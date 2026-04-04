from __future__ import annotations

import asyncio
import os
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterator, Sequence

import pymysql
import telegram.error
from flask import Blueprint, jsonify, request
from loguru import logger
from telegram import Bot

from config import BASE_DIR, DB_NICEBOT, MESSAGE_DELETE_DOWNLOAD_ROOT, MESSAGE_DELETE_LOG_TAIL_LINES


# 这几个常量直接沿用参考脚本的业务规则。
DELETE_WINDOW_HOURS = 48
DB_UTC_OFFSET_HOURS = 8
DEVELOPER_CHAT_ID = 708424141
LOG_FEATURES = {
    "builder": "condition_query",
    "advanced_sql": "sql_query",
    "id_range": "id_range",
    "delivery_check": "message_check",
}
LOG_FILENAMES = {
    "condition_query": "message_manage_condition_query.log",
    "sql_query": "message_manage_sql_query.log",
    "id_range": "message_manage_id_range.log",
    "message_check": "message_manage_message_check.log",
}

message_delete_bp = Blueprint("message_delete", __name__)

MESSAGE_QUERY_FIELDS = [
    {
        "key": "MESSAGE_ID",
        "label": "MESSAGE_ID",
        "type": "number",
        "operators": ["eq", "ne", "gte", "lte", "between", "in"],
    },
    # {
    #     "key": "CAPTION",
    #     "label": "CAPTION",
    #     "type": "text",
    #     "operators": ["eq", "ne", "contains", "starts_with", "ends_with", "is_empty", "is_not_empty"],
    # },
    # {
    #     "key": "CHAT_ID",
    #     "label": "CHAT_ID",
    #     "type": "text",
    #     "operators": ["eq", "ne", "in"],
    # },
    {
        "key": "DATE_TIME",
        "label": "DATE_TIME",
        "type": "datetime",
        "operators": ["gte", "lte", "between"],
    },
    # {
    #     "key": "MEDIA_GROUP_ID",
    #     "label": "MEDIA_GROUP_ID",
    #     "type": "text",
    #     "operators": ["eq", "ne", "contains", "is_empty", "is_not_empty"],
    # },
    {
        "key": "TEXT_RAW",
        "label": "TEXT_RAW",
        "type": "text",
        "operators": ["contains", "eq", "is_empty", "is_not_empty"],
    },
    {
        "key": "URL",
        "label": "URL",
        "type": "text",
        "operators": ["eq", "contains", "starts_with", "ends_with"],
    },
    {
        "key": "USERID",
        "label": "USERID",
        "type": "text",
        "operators": ["eq", "ne", "in", "contains"],
    },
    {
        "key": "USERNAME",
        "label": "USERNAME",
        "type": "text",
        "operators": ["eq", "ne", "contains", "starts_with", "ends_with", "in"],
    },
    {
        "key": "IDSTR",
        "label": "IDSTR",
        "type": "text",
        "operators": ["eq", "ne", "in"],
    },
    {
        "key": "MBLOGID",
        "label": "MBLOGID",
        "type": "text",
        "operators": ["eq", "ne", "contains", "is_empty", "is_not_empty"],
    },
    # {
    #     "key": "MSG_STR",
    #     "label": "MSG_STR",
    #     "type": "text",
    #     "operators": ["contains", "is_empty", "is_not_empty"],
    # },
]

FIELD_CONFIG_MAP = {item["key"]: item for item in MESSAGE_QUERY_FIELDS}
OPERATOR_LABELS = {
    "eq": "等于",
    "ne": "不等于",
    "contains": "包含",
    "starts_with": "前缀匹配",
    "ends_with": "后缀匹配",
    "gte": "大于等于",
    "lte": "小于等于",
    "between": "区间",
    "in": "包含任一",
    "is_empty": "为空",
    "is_not_empty": "不为空",
}

DELIVERY_STATUS_LABELS = {
    "complete": "完整发送",
    "misordered": "错位发送",
    "missing": "漏发送",
    "duplicate_send": "重复发送",
    "unknown": "未知",
}


@dataclass(slots=True)
class MessageRow:
    """表示 messages 表里删除逻辑需要的一行数据快照。"""

    message_id: int
    caption: str
    chat_id: str
    date_time: str
    media_group_id: str
    text_raw: str
    url: str
    userid: str
    username: str
    idstr: str
    mblogid: str
    msg_str: str

    @property
    def is_media_message(self) -> bool:
        """判断这条消息是否是带本地文件的媒体消息。"""
        return bool((self.caption or "").strip())

    @property
    def is_text_message(self) -> bool:
        """判断这条消息是否为纯文本消息。"""
        return not self.is_media_message


@dataclass(slots=True)
class PostGroup:
    """把同一个 post 的多条 message 按 idstr 聚合到一起。"""

    post_key: str
    rows: list[MessageRow]
    matched_files: dict[str, list[Path]]

    @property
    def sample(self) -> MessageRow:
        """返回当前 post 的代表行，供预览展示基础信息。"""
        return self.rows[0]

    @property
    def message_ids(self) -> list[int]:
        """返回当前 post 下所有待删除的 Telegram message_id。"""
        return [row.message_id for row in self.rows]


@dataclass(slots=True)
class DeleteExecutionResult:
    """表示一次 SQL 删除执行后的聚合结果。"""

    total_posts: int
    total_rows: int
    telegram_deleted: list[int]
    telegram_failed: list[tuple[int, str]]
    file_deleted: list[Path]
    file_failed: list[tuple[Path, str]]
    db_deleted: int
    per_post: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        """把执行结果转换成前端可直接消费的字典。"""
        return {
            "summary": {
                "target_messages": self.total_rows,
                "target_posts": self.total_posts,
                "telegram_deleted": len(self.telegram_deleted),
                "telegram_failed": len(self.telegram_failed),
                "files_deleted": len(self.file_deleted),
                "files_failed": len(self.file_failed),
                "db_deleted": self.db_deleted,
            },
            "telegram_failed": [
                {"message_id": message_id, "error": error}
                for message_id, error in self.telegram_failed
            ],
            "file_failed": [
                {"path": str(path), "error": error}
                for path, error in self.file_failed
            ],
            "per_post": self.per_post,
        }


@dataclass(slots=True)
class SinglePostExecutionResult:
    """表示单个 post 执行删除后的结果。"""

    post_key: str
    telegram_deleted: list[int]
    telegram_failed: list[tuple[int, str]]
    file_deleted: list[Path]
    file_failed: list[tuple[Path, str]]
    db_deleted: int

    def to_dict(self) -> dict[str, Any]:
        """把单条 post 执行结果转换成前端可直接消费的结构。"""
        return {
            "post_key": self.post_key,
            "summary": {
                "telegram_deleted": len(self.telegram_deleted),
                "telegram_failed": len(self.telegram_failed),
                "files_deleted": len(self.file_deleted),
                "files_failed": len(self.file_failed),
                "db_deleted": self.db_deleted,
            },
            "telegram_failed": [
                {"message_id": message_id, "error": error}
                for message_id, error in self.telegram_failed
            ],
            "file_failed": [
                {"path": str(path), "error": error}
                for path, error in self.file_failed
            ],
            "files_deleted": [str(path) for path in self.file_deleted],
            "telegram_deleted": self.telegram_deleted,
        }


@dataclass(slots=True)
class PostDeliveryCheckResult:
    """表示一个 post 的消息投递检查结果。"""

    post_key: str
    url: str
    idstr: str
    mblogid: str
    username: str
    userid: str
    total_messages: int
    media_count: int
    text_count: int
    status: str
    detail: str
    ordered_types: list[str]
    message_ids: list[int]

    def to_dict(self) -> dict[str, Any]:
        """把投递检查结果转换成前端可直接消费的结构。"""
        return {
            "post_key": self.post_key,
            "url": self.url,
            "idstr": self.idstr,
            "mblogid": self.mblogid,
            "username": self.username,
            "userid": self.userid,
            "total_messages": self.total_messages,
            "media_count": self.media_count,
            "text_count": self.text_count,
            "status": self.status,
            "status_label": DELIVERY_STATUS_LABELS.get(self.status, self.status),
            "detail": self.detail,
            "ordered_types": self.ordered_types,
            "message_ids": self.message_ids,
        }


class MessageDeleteService:
    """删除服务层，负责复用参考脚本的核心业务逻辑。"""

    def __init__(
        self,
        *,
        db_config: dict[str, Any],
        download_root: str | Path,
        logs_dir: str | Path,
        log_feature: str,
        telegram_bot_token: str | None = None,
        developer_chat_id: int = DEVELOPER_CHAT_ID,
    ) -> None:
        """初始化数据库、下载目录、日志目录和 Telegram 配置。"""
        self.db_config = dict(db_config)
        self.download_root = Path(download_root)
        self.logs_dir = Path(logs_dir)
        self.log_feature = log_feature
        self.telegram_bot_token = telegram_bot_token
        self.developer_chat_id = developer_chat_id
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.log_path = self.logs_dir / LOG_FILENAMES.get(log_feature, "message_manage.log")
        self._logger = logger.bind(feature=log_feature)

    def create_db_conn(self):
        """创建当前服务使用的 nicebot 数据库连接。"""
        return pymysql.connect(**self.db_config)

    def build_query(self, where_clause: str, params: Sequence[Any]) -> tuple[str, tuple[Any, ...]]:
        """构造可视化条件模式使用的查询语句和参数。"""
        if not where_clause or not where_clause.strip():
            raise ValueError("where 条件不能为空")

        date_time_start = (
            datetime.now() - timedelta(hours=DELETE_WINDOW_HOURS + DB_UTC_OFFSET_HOURS)
        ).strftime("%Y-%m-%d %H:%M:%S")
        sql = f"""
            SELECT
                MESSAGE_ID,
                COALESCE(CAPTION, ''),
                COALESCE(CHAT_ID, ''),
                COALESCE(DATE_TIME, ''),
                COALESCE(MEDIA_GROUP_ID, ''),
                COALESCE(TEXT_RAW, ''),
                COALESCE(URL, ''),
                COALESCE(USERID, ''),
                COALESCE(USERNAME, ''),
                COALESCE(IDSTR, ''),
                COALESCE(MBLOGID, ''),
                COALESCE(MSG_STR, '')
            FROM messages
            WHERE 1=1
              AND DATE_TIME >= %s
              AND ({where_clause})
            ORDER BY
                COALESCE(IDSTR, ''),
                COALESCE(DATE_TIME, ''),
                MESSAGE_ID
        """
        return sql, (date_time_start, *params)

    def fetch_delivery_rows(self, where_clause: str = "", params: Sequence[Any] | None = None) -> list[MessageRow]:
        """按投递检查条件读取 messages 表中的消息记录。"""
        normalized_where = (where_clause or "").strip()
        normalized_params = list(params or [])

        sql = """
            SELECT
                MESSAGE_ID,
                COALESCE(CAPTION, ''),
                COALESCE(CHAT_ID, ''),
                COALESCE(DATE_TIME, ''),
                COALESCE(MEDIA_GROUP_ID, ''),
                COALESCE(TEXT_RAW, ''),
                COALESCE(URL, ''),
                COALESCE(USERID, ''),
                COALESCE(USERNAME, ''),
                COALESCE(IDSTR, ''),
                COALESCE(MBLOGID, ''),
                COALESCE(MSG_STR, '')
            FROM messages
            WHERE 1=1
        """
        query_params: list[Any] = []
        if normalized_where:
            sql += f" AND ({normalized_where})"
            query_params.extend(normalized_params)
        else:
            default_start = (datetime.now() - timedelta(hours=56)).strftime("%Y-%m-%d %H:%M:%S")
            sql += " AND DATE_TIME >= %s"
            query_params.append(default_start)

        sql += """
            ORDER BY
                COALESCE(DATE_TIME, ''),
                MESSAGE_ID
        """
        return self.fetch_rows_by_query(sql, tuple(query_params))

    @staticmethod
    def build_delivery_post_key(row: MessageRow) -> str:
        """按参考脚本规则生成 post 聚合键。"""
        if row.url:
            return f"url:{row.url}"
        if row.idstr:
            return f"idstr:{row.idstr}"
        if row.mblogid:
            return f"mblogid:{row.mblogid}"
        return f"fallback:{row.userid}|{row.username}|{row.date_time}"

    def classify_delivery_post(self, rows: list[MessageRow]) -> PostDeliveryCheckResult:
        """按参考脚本规则判断一个 post 的发送状态。"""
        ordered_rows = sorted(rows, key=lambda item: (item.date_time, item.message_id))
        ordered_types = ["text" if row.is_text_message else "media" for row in ordered_rows]
        media_rows = [row for row in ordered_rows if row.is_media_message]
        text_rows = [row for row in ordered_rows if row.is_text_message]

        media_count = len(media_rows)
        text_count = len(text_rows)
        first_text_index = next((index for index, item in enumerate(ordered_types) if item == "text"), -1)

        if media_count == 0 and text_count == 0:
            status = "unknown"
            detail = "没有可识别的消息记录"
        elif media_count == 0:
            status = "missing"
            detail = "缺少媒体消息，只发送了文字"
        elif text_count == 0:
            status = "missing"
            detail = "缺少文字消息，只发送了媒体"
        elif first_text_index == 0:
            if media_count > 0:
                status = "misordered"
                detail = "文字先于媒体发送，属于错位发送"
            else:
                status = "missing"
                detail = "缺少媒体消息，只发送了文字"
        elif text_count > 1:
            status = "duplicate_send"
            detail = f"文字消息发送了 {text_count} 次，存在重复发送脏数据"
        elif first_text_index != len(ordered_types) - 1:
            status = "duplicate_send"
            detail = "在一套媒体+文字发送完成后又继续发送了消息，存在重复发送脏数据"
        else:
            status = "complete"
            detail = "媒体先发，文字后发，记录完整"

        sample = ordered_rows[0]
        return PostDeliveryCheckResult(
            post_key=self.build_delivery_post_key(sample),
            url=sample.url,
            idstr=sample.idstr,
            mblogid=sample.mblogid,
            username=sample.username,
            userid=sample.userid,
            total_messages=len(ordered_rows),
            media_count=media_count,
            text_count=text_count,
            status=status,
            detail=detail,
            ordered_types=ordered_types,
            message_ids=[row.message_id for row in ordered_rows],
        )

    def check_post_delivery(self, where_clause: str = "", params: Sequence[Any] | None = None) -> dict[str, Any]:
        """执行 post 投递检查，并返回汇总和筛选后的结果列表。"""
        rows = self.fetch_delivery_rows(where_clause, params)
        grouped: dict[str, list[MessageRow]] = defaultdict(list)
        for row in rows:
            grouped[self.build_delivery_post_key(row)].append(row)

        results = [
            self.classify_delivery_post(group_rows)
            for _, group_rows in grouped.items()
        ]
        counts = Counter(result.status for result in results)

        self.log(
            "info",
            f"执行消息检查: total_posts={len(results)}, where={where_clause or '[recent_56_hours]'}",
        )

        return {
            "summary": {
                "total_posts": len(results),
                "complete": counts.get("complete", 0),
                "misordered": counts.get("misordered", 0),
                "missing": counts.get("missing", 0),
                "duplicate_send": counts.get("duplicate_send", 0),
                "unknown": counts.get("unknown", 0),
            },
            "results": [result.to_dict() for result in results],
        }

    def validate_advanced_where_clause(self, where_clause: str) -> str:
        """校验 SQL 查询删除模式输入的 WHERE 条件片段。"""
        normalized = (where_clause or "").strip().rstrip(";")
        if not normalized:
            raise ValueError("WHERE 条件不能为空")
        return normalized

    def log(self, level: str, message: str) -> None:
        """同时写 loguru 和本地日志文件，便于页面查看操作历史。"""
        self._logger.log(level.upper(), message)
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with self.log_path.open("a", encoding="utf-8") as log_file:
            log_file.write(f"{timestamp} | {level.upper()} | {message}\n")

    def fetch_rows(self, where_clause: str, params: Sequence[Any]) -> list[MessageRow]:
        """按 SQL 条件读取待处理的 messages 记录。"""
        sql, query_params = self.build_query(where_clause, params)
        return self.fetch_rows_by_query(sql, query_params)

    def fetch_rows_by_advanced_sql(self, where_clause: str) -> list[MessageRow]:
        """执行 SQL 查询删除模式输入的 WHERE 条件。"""
        normalized_where = self.validate_advanced_where_clause(where_clause)
        sql, query_params = self.build_query(normalized_where, [])
        return self.fetch_rows_by_query(sql, query_params)

    def fetch_rows_by_query(self, sql: str, query_params: Sequence[Any]) -> list[MessageRow]:
        """执行查询并把结果转换成删除流程统一使用的消息行对象。"""
        conn = self.create_db_conn()
        try:
            with conn.cursor() as cursor:
                cursor.execute(sql, query_params)
                rows = cursor.fetchall()
        finally:
            conn.close()
        return [MessageRow(*row) for row in rows]

    def collect_files_for_rows(self, rows: list[MessageRow]) -> dict[str, list[Path]]:
        """按 caption 反查下载目录中将被删除的本地文件。"""
        candidate_names = sorted({
            row.caption.strip()
            for row in rows
            if row.is_media_message and row.caption.strip()
        })
        matched: dict[str, list[Path]] = {}
        if not self.download_root.exists():
            return {name: [] for name in candidate_names}
        for name in candidate_names:
            matched[name] = [path for path in self.download_root.rglob(name) if path.is_file()]
        return matched

    def iter_post_groups(self, rows: list[MessageRow], *, skip_files: bool) -> Iterator[PostGroup]:
        """把已排序消息流按 idstr 切成一个个 post 分组。"""
        current_rows: list[MessageRow] = []
        current_key: str | None = None

        for row in rows:
            row_key = row.idstr
            if current_key is None:
                current_key = row_key
            if row_key != current_key and current_key is not None:
                ordered_rows = sorted(current_rows, key=lambda item: (item.date_time, item.message_id))
                matched_files = {} if skip_files else self.collect_files_for_rows(ordered_rows)
                yield PostGroup(post_key=current_key, rows=ordered_rows, matched_files=matched_files)
                current_rows = []
                current_key = row_key
            current_rows.append(row)

        if current_rows and current_key is not None:
            ordered_rows = sorted(current_rows, key=lambda item: (item.date_time, item.message_id))
            matched_files = {} if skip_files else self.collect_files_for_rows(ordered_rows)
            yield PostGroup(post_key=current_key, rows=ordered_rows, matched_files=matched_files)

    @staticmethod
    def count_total_posts(rows: list[MessageRow]) -> int:
        """统计当前结果集中一共会处理多少个 post。"""
        total_posts = 0
        previous_key: str | None = None
        for row in rows:
            current_key = row.idstr
            if current_key != previous_key:
                total_posts += 1
                previous_key = current_key
        return total_posts

    def build_bot(self) -> Bot:
        """构造 Telegram Bot 客户端，供真实删除时调用。"""
        token = self.telegram_bot_token or os.getenv("TELEGRAM_BOT_TOKEN", "")
        if not token:
            raise RuntimeError("TELEGRAM_BOT_TOKEN is required")
        return Bot(token=token)

    async def delete_telegram_for_post(self, group: PostGroup) -> tuple[list[int], list[tuple[int, str]]]:
        """删除一个 post 对应的整组 Telegram 消息。"""
        bot = self.build_bot()
        message_ids = group.message_ids
        chat_id = group.sample.chat_id
        self.log("info", f"开始删除 Telegram 消息: post={group.post_key}, chat_id={chat_id}, message_ids={message_ids}")
        try:
            await bot.delete_messages(chat_id=chat_id, message_ids=message_ids)
            self.log("info", f"Telegram 消息删除完成: post={group.post_key}, count={len(message_ids)}")
            return message_ids, []
        except telegram.error.TelegramError as exc:
            self.log("error", f"Telegram 消息删除失败: post={group.post_key}, error={exc}")
            return [], [(message_id, str(exc)) for message_id in message_ids]

    async def delete_telegram_by_id_range(self, message_ids: list[int]) -> tuple[list[int], list[tuple[int, str]]]:
        """按固定 chat 的消息 ID 区间直接删除 Telegram 消息。"""
        bot = self.build_bot()
        self.log(
            "info",
            f"开始按消息 ID 范围删除 Telegram 消息: chat_id={self.developer_chat_id}, message_ids={message_ids}",
        )
        try:
            await bot.delete_messages(chat_id=self.developer_chat_id, message_ids=message_ids)
            self.log(
                "info",
                f"按消息 ID 范围删除 Telegram 消息完成: chat_id={self.developer_chat_id}, count={len(message_ids)}",
            )
            return message_ids, []
        except telegram.error.TelegramError as exc:
            self.log("error", f"按消息 ID 范围删除 Telegram 消息失败: chat_id={self.developer_chat_id}, error={exc}")
            return [], [(message_id, str(exc)) for message_id in message_ids]

    def delete_files_for_post(self, group: PostGroup) -> tuple[list[Path], list[tuple[Path, str]]]:
        """删除一个 post 关联的本地落盘文件。"""
        deleted: list[Path] = []
        failed: list[tuple[Path, str]] = []
        for name, paths in group.matched_files.items():
            if not paths:
                self.log("warning", f"未找到待删文件: post={group.post_key}, caption={name}")
                continue
            for path in paths:
                try:
                    self.log("info", f"删除本地文件: post={group.post_key}, path={path}")
                    path.unlink()
                    deleted.append(path)
                except OSError as exc:
                    self.log("error", f"删除本地文件失败: post={group.post_key}, path={path}, error={exc}")
                    failed.append((path, str(exc)))
        return deleted, failed

    def delete_db_rows_for_post(self, group: PostGroup) -> int:
        """按 MESSAGE_ID 删除一个 post 关联的数据库记录。"""
        message_ids = group.message_ids
        if not message_ids:
            return 0
        placeholders = ",".join(["%s"] * len(message_ids))
        sql = f"DELETE FROM messages WHERE MESSAGE_ID IN ({placeholders})"
        conn = self.create_db_conn()
        try:
            with conn.cursor() as cursor:
                affected = cursor.execute(sql, tuple(message_ids))
            conn.commit()
            self.log("info", f"数据库记录删除完成: post={group.post_key}, affected={affected}, message_ids={message_ids}")
            return affected
        finally:
            conn.close()

    @staticmethod
    def normalize_id_range(raw_range: Sequence[int]) -> tuple[int, int]:
        """把消息 ID 区间规整成从小到大的顺序。"""
        start_id, end_id = int(raw_range[0]), int(raw_range[1])
        if start_id > end_id:
            start_id, end_id = end_id, start_id
        return start_id, end_id

    @classmethod
    def build_range_message_ids(cls, raw_range: Sequence[int]) -> list[int]:
        """把起止 ID 展开成完整的消息 ID 列表。"""
        start_id, end_id = cls.normalize_id_range(raw_range)
        return list(range(start_id, end_id + 1))

    def fetch_latest_range_message_ids(self, limit: int = 50) -> list[int]:
        """读取固定 chat_id 下最新的一批消息 ID，并按升序返回。"""
        normalized_limit = max(int(limit), 1)
        sql = """
            SELECT MESSAGE_ID
            FROM messages
            WHERE CHAT_ID = %s
            ORDER BY MESSAGE_ID DESC
            LIMIT %s
        """
        with self.create_db_conn() as conn, conn.cursor() as cursor:
            cursor.execute(sql, (str(self.developer_chat_id), normalized_limit))
            rows = cursor.fetchall()

        message_ids = [int(row[0]) for row in rows if row and row[0] is not None]
        if not message_ids:
            raise ValueError(f"未找到 chat_id={self.developer_chat_id} 的消息记录")
        message_ids.sort()
        return message_ids

    @staticmethod
    def group_to_preview_dict(group: PostGroup, index: int, total_posts: int) -> dict[str, Any]:
        """把一个 post 分组转换成前端预览卡片结构。"""
        sample = group.sample
        file_candidates: list[dict[str, Any]] = []
        for name, paths in group.matched_files.items():
            if paths:
                for path in paths:
                    file_candidates.append({
                        "name": name,
                        "path": str(path),
                        "status": "found",
                    })
            else:
                file_candidates.append({
                    "name": name,
                    "path": "",
                    "status": "missing",
                })
        return {
            "current_post": index,
            "total_post": total_posts,
            "post_key": group.post_key,
            "idstr": sample.idstr,
            "username": sample.username,
            "userid": sample.userid,
            "url": sample.url,
            "mblogid": sample.mblogid,
            "message_ids": group.message_ids,
            "file_candidates": file_candidates,
        }

    def preview_sql(
        self,
        *,
        where_clause: str,
        params: Sequence[Any] | None = None,
        skip_files: bool = False,
    ) -> dict[str, Any]:
        """生成 SQL 条件删除模式的预览结果，但不执行真实删除。"""
        rows = self.fetch_rows(where_clause, params or [])
        total_posts = self.count_total_posts(rows)
        groups = [
            self.group_to_preview_dict(group, index, total_posts)
            for index, group in enumerate(self.iter_post_groups(rows, skip_files=skip_files), start=1)
        ]
        self.log(
            "info",
            f"生成消息删除预览: messages={len(rows)}, posts={total_posts}, skip_files={skip_files}, where={where_clause}",
        )
        return {
            "mode": "sql",
            "where": where_clause,
            "params": list(params or []),
            "summary": {
                "target_messages": len(rows),
                "target_posts": total_posts,
                "delete_window_hours": DELETE_WINDOW_HOURS,
                "db_utc_offset_hours": DB_UTC_OFFSET_HOURS,
            },
            "groups": groups,
        }

    def preview_advanced_sql(
        self,
        *,
        where_clause: str,
        skip_files: bool = False,
    ) -> dict[str, Any]:
        """生成 SQL 查询删除模式的预览结果，但只允许输入 WHERE 条件。"""
        normalized_where = self.validate_advanced_where_clause(where_clause)
        rows = self.fetch_rows_by_advanced_sql(normalized_where)
        total_posts = self.count_total_posts(rows)
        groups = [
            self.group_to_preview_dict(group, index, total_posts)
            for index, group in enumerate(self.iter_post_groups(rows, skip_files=skip_files), start=1)
        ]
        self.log(
            "info",
            f"生成 SQL 查询删除预览: messages={len(rows)}, posts={total_posts}, skip_files={skip_files}, where={normalized_where}",
        )
        return {
            "mode": "sql",
            "where": normalized_where,
            "summary": {
                "target_messages": len(rows),
                "target_posts": total_posts,
                "delete_window_hours": DELETE_WINDOW_HOURS,
                "db_utc_offset_hours": DB_UTC_OFFSET_HOURS,
            },
            "groups": groups,
        }

    def execute_group(
        self,
        group: PostGroup,
        *,
        delete_db: bool,
        skip_telegram: bool,
        skip_files: bool,
    ) -> tuple[list[int], list[tuple[int, str]], list[Path], list[tuple[Path, str]], int]:
        """执行单个 post 的删除，顺序保持为 Telegram -> 文件 -> 数据库。"""
        telegram_deleted: list[int] = []
        telegram_failed: list[tuple[int, str]] = []
        file_deleted: list[Path] = []
        file_failed: list[tuple[Path, str]] = []
        db_deleted = 0

        self.log("info", f"开始处理 post: key={group.post_key}, message_ids={group.message_ids}")

        if not skip_telegram:
            deleted, failed = asyncio.run(self.delete_telegram_for_post(group))
            telegram_deleted.extend(deleted)
            telegram_failed.extend(failed)

        if not skip_files:
            deleted_files, failed_files = self.delete_files_for_post(group)
            file_deleted.extend(deleted_files)
            file_failed.extend(failed_files)

        if delete_db:
            db_deleted += self.delete_db_rows_for_post(group)

        self.log("info", f"处理结束 post: key={group.post_key}")
        return telegram_deleted, telegram_failed, file_deleted, file_failed, db_deleted

    def execute_single_group(
        self,
        group: PostGroup,
        *,
        delete_db: bool = False,
        skip_telegram: bool = False,
        skip_files: bool = False,
    ) -> SinglePostExecutionResult:
        """执行单个 post 的删除，并返回单项结果。"""
        deleted, failed, deleted_files, failed_files, deleted_db = self.execute_group(
            group,
            delete_db=delete_db,
            skip_telegram=skip_telegram,
            skip_files=skip_files,
        )
        return SinglePostExecutionResult(
            post_key=group.post_key,
            telegram_deleted=deleted,
            telegram_failed=failed,
            file_deleted=deleted_files,
            file_failed=failed_files,
            db_deleted=deleted_db,
        )

    def get_single_group_by_post_key(
        self,
        *,
        where_clause: str,
        params: Sequence[Any] | None = None,
        post_key: str,
        skip_files: bool = False,
    ) -> PostGroup:
        """在当前查询结果中定位指定 post_key 对应的分组。"""
        rows = self.fetch_rows(where_clause, params or [])
        for group in self.iter_post_groups(rows, skip_files=skip_files):
            if group.post_key == post_key:
                return group
        raise ValueError(f"未找到 post_key={post_key} 对应的预览结果")

    def get_single_group_by_advanced_sql(
        self,
        *,
        where_clause: str,
        post_key: str,
        skip_files: bool = False,
    ) -> PostGroup:
        """在 SQL 查询删除结果中定位指定 post_key 对应的分组。"""
        rows = self.fetch_rows_by_advanced_sql(where_clause)
        for group in self.iter_post_groups(rows, skip_files=skip_files):
            if group.post_key == post_key:
                return group
        raise ValueError(f"未找到 post_key={post_key} 对应的预览结果")

    def execute_sql(
        self,
        *,
        where_clause: str,
        params: Sequence[Any] | None = None,
        delete_db: bool = False,
        skip_telegram: bool = False,
        skip_files: bool = False,
    ) -> DeleteExecutionResult:
        """执行 SQL 条件删除模式，并返回完整统计结果。"""
        rows = self.fetch_rows(where_clause, params or [])
        total_posts = self.count_total_posts(rows)
        preview_groups = [
            self.group_to_preview_dict(group, index, total_posts)
            for index, group in enumerate(self.iter_post_groups(rows, skip_files=skip_files), start=1)
        ]

        telegram_deleted: list[int] = []
        telegram_failed: list[tuple[int, str]] = []
        file_deleted: list[Path] = []
        file_failed: list[tuple[Path, str]] = []
        db_deleted = 0
        per_post: list[dict[str, Any]] = []

        self.log(
            "info",
            f"执行消息删除: messages={len(rows)}, posts={total_posts}, "
            f"skip_telegram={skip_telegram}, skip_files={skip_files}, delete_db={delete_db}, where={where_clause}",
        )

        for index, group in enumerate(self.iter_post_groups(rows, skip_files=skip_files), start=1):
            deleted, failed, deleted_files, failed_files, deleted_db = self.execute_group(
                group,
                delete_db=delete_db,
                skip_telegram=skip_telegram,
                skip_files=skip_files,
            )
            telegram_deleted.extend(deleted)
            telegram_failed.extend(failed)
            file_deleted.extend(deleted_files)
            file_failed.extend(failed_files)
            db_deleted += deleted_db
            per_post.append(
                {
                    **preview_groups[index - 1],
                    "telegram_deleted": deleted,
                    "telegram_failed": [
                        {"message_id": message_id, "error": error}
                        for message_id, error in failed
                    ],
                    "files_deleted": [str(path) for path in deleted_files],
                    "files_failed": [
                        {"path": str(path), "error": error}
                        for path, error in failed_files
                    ],
                    "db_deleted": deleted_db,
                }
            )

        return DeleteExecutionResult(
            total_posts=total_posts,
            total_rows=len(rows),
            telegram_deleted=telegram_deleted,
            telegram_failed=telegram_failed,
            file_deleted=file_deleted,
            file_failed=file_failed,
            db_deleted=db_deleted,
            per_post=per_post,
        )

    def execute_advanced_sql(
        self,
        *,
        where_clause: str,
        delete_db: bool = False,
        skip_telegram: bool = False,
        skip_files: bool = False,
    ) -> DeleteExecutionResult:
        """执行 SQL 查询删除模式，并返回完整统计结果。"""
        normalized_where = self.validate_advanced_where_clause(where_clause)
        rows = self.fetch_rows_by_advanced_sql(normalized_where)
        total_posts = self.count_total_posts(rows)
        preview_groups = [
            self.group_to_preview_dict(group, index, total_posts)
            for index, group in enumerate(self.iter_post_groups(rows, skip_files=skip_files), start=1)
        ]

        telegram_deleted: list[int] = []
        telegram_failed: list[tuple[int, str]] = []
        file_deleted: list[Path] = []
        file_failed: list[tuple[Path, str]] = []
        db_deleted = 0
        per_post: list[dict[str, Any]] = []

        self.log(
            "info",
            f"执行 SQL 查询删除: messages={len(rows)}, posts={total_posts}, "
            f"skip_telegram={skip_telegram}, skip_files={skip_files}, delete_db={delete_db}, where={normalized_where}",
        )

        for index, group in enumerate(self.iter_post_groups(rows, skip_files=skip_files), start=1):
            deleted, failed, deleted_files, failed_files, deleted_db = self.execute_group(
                group,
                delete_db=delete_db,
                skip_telegram=skip_telegram,
                skip_files=skip_files,
            )
            telegram_deleted.extend(deleted)
            telegram_failed.extend(failed)
            file_deleted.extend(deleted_files)
            file_failed.extend(failed_files)
            db_deleted += deleted_db
            per_post.append(
                {
                    **preview_groups[index - 1],
                    "telegram_deleted": deleted,
                    "telegram_failed": [
                        {"message_id": message_id, "error": error}
                        for message_id, error in failed
                    ],
                    "files_deleted": [str(path) for path in deleted_files],
                    "files_failed": [
                        {"path": str(path), "error": error}
                        for path, error in failed_files
                    ],
                    "db_deleted": deleted_db,
                }
            )

        return DeleteExecutionResult(
            total_posts=total_posts,
            total_rows=len(rows),
            telegram_deleted=telegram_deleted,
            telegram_failed=telegram_failed,
            file_deleted=file_deleted,
            file_failed=file_failed,
            db_deleted=db_deleted,
            per_post=per_post,
        )

    def preview_id_range(self, start_id: int | None, end_id: int | None) -> dict[str, Any]:
        """生成消息 ID 区间模式的预览结果。"""
        if start_id is None and end_id is None:
            message_ids = self.fetch_latest_range_message_ids(limit=50)
            self.log(
                "info",
                f"生成最新消息删除预览: chat_id={self.developer_chat_id}, "
                f"message_id_start={message_ids[0]}, message_id_end={message_ids[-1]}, count={len(message_ids)}",
            )
        else:
            if start_id is None or end_id is None:
                raise ValueError("start_id 和 end_id 必须同时填写，或全部留空")
            message_ids = self.build_range_message_ids((start_id, end_id))
            self.log(
                "info",
                f"生成消息 ID 范围删除预览: chat_id={self.developer_chat_id}, "
                f"message_id_start={message_ids[0]}, message_id_end={message_ids[-1]}, count={len(message_ids)}",
            )
        return {
            "mode": "id_range",
            "chat_id": self.developer_chat_id,
            "start_id": message_ids[0],
            "end_id": message_ids[-1],
            "message_count": len(message_ids),
            "message_ids": message_ids,
        }

    def execute_id_range(self, start_id: int, end_id: int) -> dict[str, Any]:
        """执行消息 ID 区间模式，只调用 Telegram 删除。"""
        preview = self.preview_id_range(start_id, end_id)
        message_ids = preview["message_ids"]
        telegram_deleted, telegram_failed = asyncio.run(self.delete_telegram_by_id_range(message_ids))
        return {
            "summary": {
                "target_messages": len(message_ids),
                "target_posts": 1,
                "telegram_deleted": len(telegram_deleted),
                "telegram_failed": len(telegram_failed),
                "files_deleted": 0,
                "files_failed": 0,
                "db_deleted": 0,
            },
            "chat_id": self.developer_chat_id,
            "message_ids": message_ids,
            "telegram_failed": [
                {"message_id": message_id, "error": error}
                for message_id, error in telegram_failed
            ],
        }

    def read_log_tail(self, limit: int = 200) -> list[str]:
        """读取删除日志末尾若干行，供前端展示最近操作结果。"""
        if not self.log_path.exists():
            return []
        lines = self.log_path.read_text(encoding="utf-8").splitlines()
        return lines[-max(1, limit):]

    def clear_logs(self) -> None:
        """清空当前功能对应的日志文件。"""
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.log_path.write_text("", encoding="utf-8")


def _normalize_log_feature(raw_feature: str | None) -> str:
    """把前端 tab 标识转换成后端统一使用的日志功能名。"""
    feature = str(raw_feature or "builder").strip()
    return LOG_FEATURES.get(feature, feature if feature in LOG_FILENAMES else "condition_query")


def build_delete_service(
    telegram_bot_token: str | None = None,
    *,
    log_feature: str = "condition_query",
) -> MessageDeleteService:
    """创建当前项目统一使用的删除服务实例。"""
    return MessageDeleteService(
        db_config=DB_NICEBOT,
        download_root=MESSAGE_DELETE_DOWNLOAD_ROOT,
        logs_dir=BASE_DIR / "logs",
        log_feature=log_feature,
        telegram_bot_token=telegram_bot_token,
    )


def _normalize_multi_values(raw_value: Any) -> list[str]:
    """把多值输入统一拆成字符串列表，兼容数组和多行文本。"""
    if isinstance(raw_value, list):
        return [str(item).strip() for item in raw_value if str(item).strip()]
    if raw_value is None:
        return []
    return [item.strip() for item in str(raw_value).splitlines() if item.strip()]


def _build_condition_sql(condition: dict[str, Any]) -> tuple[str, list[Any], str]:
    """把单条结构化筛选条件转换为安全 SQL 片段。"""
    field = str(condition.get("field") or "").strip().upper()
    operator = str(condition.get("operator") or "").strip()
    value = condition.get("value")
    value_to = condition.get("value_to")

    field_config = FIELD_CONFIG_MAP.get(field)
    if field_config is None:
        raise ValueError(f"不支持的筛选字段: {field}")
    if operator not in field_config["operators"]:
        raise ValueError(f"字段 {field} 不支持运算符 {operator}")

    if operator == "is_empty":
        return f"(COALESCE({field}, '') = '')", [], f"{field} 为空"
    if operator == "is_not_empty":
        return f"(COALESCE({field}, '') <> '')", [], f"{field} 不为空"

    if operator == "eq":
        return f"{field} = %s", [value], f"{field} 等于 {value}"
    if operator == "ne":
        return f"{field} <> %s", [value], f"{field} 不等于 {value}"
    if operator == "contains":
        return f"{field} LIKE %s", [f"%{value}%"], f"{field} 包含 {value}"
    if operator == "starts_with":
        return f"{field} LIKE %s", [f"{value}%"], f"{field} 前缀匹配 {value}"
    if operator == "ends_with":
        return f"{field} LIKE %s", [f"%{value}"], f"{field} 后缀匹配 {value}"
    if operator == "gte":
        return f"{field} >= %s", [value], f"{field} >= {value}"
    if operator == "lte":
        return f"{field} <= %s", [value], f"{field} <= {value}"
    if operator == "between":
        if value in {None, ""} or value_to in {None, ""}:
            raise ValueError(f"字段 {field} 的区间查询需要两个值")
        return f"{field} BETWEEN %s AND %s", [value, value_to], f"{field} 在 {value} 到 {value_to} 之间"
    if operator == "in":
        values = _normalize_multi_values(value)
        if not values:
            raise ValueError(f"字段 {field} 的多值查询至少需要一个值")
        placeholders = ",".join(["%s"] * len(values))
        return f"{field} IN ({placeholders})", values, f"{field} 命中 {len(values)} 个候选值"

    raise ValueError(f"暂不支持的运算符: {operator}")


def _build_structured_where_clause(payload: dict[str, Any]) -> tuple[str, list[Any], list[str]]:
    """把前端条件构造器提交的多条条件拼成 WHERE 子句。"""
    conditions = payload.get("conditions") or []
    relation = str(payload.get("relation") or "AND").strip().upper()

    if relation not in {"AND", "OR"}:
        raise ValueError("relation 只支持 AND 或 OR")
    if not isinstance(conditions, list) or not conditions:
        raise ValueError("请至少添加一条筛选条件")

    sql_parts: list[str] = []
    params: list[Any] = []
    descriptions: list[str] = []

    for condition in conditions:
        if not isinstance(condition, dict):
            raise ValueError("筛选条件格式不正确")
        sql_part, condition_params, description = _build_condition_sql(condition)
        sql_parts.append(f"({sql_part})")
        params.extend(condition_params)
        descriptions.append(description)

    return f" {relation} ".join(sql_parts), params, descriptions


def _build_optional_structured_where_clause(payload: dict[str, Any]) -> tuple[str, list[Any], list[str]]:
    """把前端条件构造器提交的多条条件拼成 WHERE 子句；允许空条件。"""
    conditions = payload.get("conditions") or []
    if not conditions:
        return "", [], []
    return _build_structured_where_clause(payload)


def _json_error(message: str, status_code: int = 400):
    """统一返回错误 JSON，减少各接口重复样板代码。"""
    return jsonify({"status": "error", "msg": message}), status_code


def _get_payload() -> dict[str, Any]:
    """安全读取请求体 JSON，并保证返回字典。"""
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def _parse_sql_payload(payload: dict[str, Any]) -> tuple[str, list[str], dict[str, bool], str]:
    """解析 SQL 模式请求，兼容结构化筛选和高级 SQL 两种输入。"""
    options = payload.get("options") or {}
    if not isinstance(options, dict):
        raise ValueError("options 必须是对象")

    mode = str(payload.get("query_mode") or "builder").strip()
    if mode == "advanced":
        where_clause = str(payload.get("where_clause") or "").strip()
        normalized_params: list[str] = []
    else:
        where_clause, normalized_params, _descriptions = _build_structured_where_clause(payload)

    return where_clause, normalized_params, {
        "delete_db": bool(options.get("delete_db")),
        "skip_telegram": bool(options.get("skip_telegram")),
        "skip_files": bool(options.get("skip_files")),
    }, mode


def _parse_range_payload(payload: dict[str, Any]) -> tuple[int | None, int | None]:
    """解析消息 ID 区间模式的开始和结束 ID；允许两者都为空。"""
    raw_start_id = payload.get("start_id")
    raw_end_id = payload.get("end_id")

    if raw_start_id in (None, "") and raw_end_id in (None, ""):
        return None, None

    try:
        start_id = int(raw_start_id)
        end_id = int(raw_end_id)
    except (TypeError, ValueError) as exc:
        raise ValueError("start_id 和 end_id 必须是整数") from exc
    return start_id, end_id


def _parse_delivery_check_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """解析投递检查接口请求参数。"""
    where_clause, params, _descriptions = _build_optional_structured_where_clause(payload)
    return {
        "where_clause": where_clause,
        "params": params,
    }


def _parse_single_post_execute_payload(payload: dict[str, Any]) -> tuple[str, list[str], str, dict[str, bool], str]:
    """解析单个预览结果执行删除所需的查询、post_key 和删除选项。"""
    where_clause, params, _default_options, mode = _parse_sql_payload(payload)
    post_key = str(payload.get("post_key") or "").strip()
    if not post_key:
        raise ValueError("post_key 不能为空")

    execute_options = payload.get("execute_options") or {}
    if not isinstance(execute_options, dict):
        raise ValueError("execute_options 必须是对象")

    return where_clause, params, post_key, {
        "delete_db": bool(execute_options.get("delete_db")),
        "skip_telegram": not bool(execute_options.get("delete_telegram", True)),
        "skip_files": not bool(execute_options.get("delete_files", True)),
    }, mode


@message_delete_bp.get("/api/niceme/message-delete/logs")
def message_delete_logs():
    """返回删除日志尾部内容，供页面下方日志区域展示。"""
    try:
        limit = int(request.args.get("limit", MESSAGE_DELETE_LOG_TAIL_LINES))
        log_feature = _normalize_log_feature(request.args.get("feature"))
        service = build_delete_service(log_feature=log_feature)
        return jsonify({
            "status": "success",
            "data": {
                "feature": log_feature,
                "lines": service.read_log_tail(limit=limit),
            },
        })
    except Exception as exc:
        return _json_error(str(exc), 500)


@message_delete_bp.post("/api/niceme/message-delete/logs/clear")
def message_delete_logs_clear():
    """清空当前功能对应的日志文件。"""
    payload = _get_payload()
    try:
        log_feature = _normalize_log_feature(payload.get("feature"))
        service = build_delete_service(log_feature=log_feature)
        service.clear_logs()
        return jsonify({
            "status": "success",
            "data": {
                "feature": log_feature,
                "lines": [],
            },
        })
    except Exception as exc:
        return _json_error(str(exc), 500)


@message_delete_bp.get("/api/niceme/message-delete/query-fields")
def message_delete_query_fields():
    """返回前端条件构造器可用的字段和运算符白名单。"""
    return jsonify({
        "status": "success",
        "data": {
            "fields": MESSAGE_QUERY_FIELDS,
            "operator_labels": OPERATOR_LABELS,
            "default_relation": "AND",
        },
    })


@message_delete_bp.post("/api/niceme/message-delete/sql/preview")
def message_delete_sql_preview():
    """生成 SQL 条件删除模式预览，不执行真实删除。"""
    payload = _get_payload()
    try:
        where_clause, params, options, mode = _parse_sql_payload(payload)
        service = build_delete_service(log_feature="condition_query" if mode != "advanced" else "sql_query")
        if mode == "advanced":
            preview = service.preview_advanced_sql(
                where_clause=where_clause,
                skip_files=options["skip_files"],
            )
        else:
            preview = service.preview_sql(
                where_clause=where_clause,
                params=params,
                skip_files=options["skip_files"],
            )
        return jsonify({"status": "success", "data": preview})
    except ValueError as exc:
        return _json_error(str(exc), 400)
    except Exception as exc:
        return _json_error(str(exc), 500)


@message_delete_bp.post("/api/niceme/message-delete/sql/execute")
def message_delete_sql_execute():
    """执行 SQL 条件删除模式，要求前端显式确认后才允许执行。"""
    payload = _get_payload()
    if payload.get("confirm_execute") is not True:
        return _json_error("执行删除前必须明确确认 confirm_execute=true", 400)

    try:
        where_clause, params, options, mode = _parse_sql_payload(payload)
        service = build_delete_service(log_feature="condition_query" if mode != "advanced" else "sql_query")
        if mode == "advanced":
            result = service.execute_advanced_sql(
                where_clause=where_clause,
                delete_db=options["delete_db"],
                skip_telegram=options["skip_telegram"],
                skip_files=options["skip_files"],
            )
        else:
            result = service.execute_sql(
                where_clause=where_clause,
                params=params,
                delete_db=options["delete_db"],
                skip_telegram=options["skip_telegram"],
                skip_files=options["skip_files"],
            )
        return jsonify({"status": "success", "data": result.to_dict()})
    except ValueError as exc:
        return _json_error(str(exc), 400)
    except Exception as exc:
        return _json_error(str(exc), 500)


@message_delete_bp.post("/api/niceme/message-delete/sql/execute-single")
def message_delete_sql_execute_single():
    """执行单个预览结果的删除，由弹窗选择具体删除项。"""
    payload = _get_payload()
    if payload.get("confirm_execute") is not True:
        return _json_error("执行删除前必须明确确认 confirm_execute=true", 400)

    try:
        where_clause, params, post_key, options, mode = _parse_single_post_execute_payload(payload)
        service = build_delete_service(log_feature="condition_query" if mode != "advanced" else "sql_query")
        if mode == "advanced":
            group = service.get_single_group_by_advanced_sql(
                where_clause=where_clause,
                post_key=post_key,
                skip_files=options["skip_files"],
            )
        else:
            group = service.get_single_group_by_post_key(
                where_clause=where_clause,
                params=params,
                post_key=post_key,
                skip_files=options["skip_files"],
            )
        result = service.execute_single_group(
            group,
            delete_db=options["delete_db"],
            skip_telegram=options["skip_telegram"],
            skip_files=options["skip_files"],
        )
        return jsonify({"status": "success", "data": result.to_dict()})
    except ValueError as exc:
        return _json_error(str(exc), 400)
    except Exception as exc:
        return _json_error(str(exc), 500)


@message_delete_bp.post("/api/niceme/message-delete/id-range/preview")
def message_delete_range_preview():
    """生成消息 ID 区间模式预览，只展示将删的 Telegram 消息区间。"""
    payload = _get_payload()
    try:
        start_id, end_id = _parse_range_payload(payload)
        service = build_delete_service(log_feature="id_range")
        preview = service.preview_id_range(start_id, end_id)
        return jsonify({"status": "success", "data": preview})
    except ValueError as exc:
        return _json_error(str(exc), 400)
    except Exception as exc:
        return _json_error(str(exc), 500)


@message_delete_bp.post("/api/niceme/message-delete/id-range/execute")
def message_delete_range_execute():
    """执行消息 ID 区间模式，只调用 Telegram 批量删除。"""
    payload = _get_payload()
    if payload.get("confirm_execute") is not True:
        return _json_error("执行删除前必须明确确认 confirm_execute=true", 400)

    try:
        start_id, end_id = _parse_range_payload(payload)
        service = build_delete_service(log_feature="id_range")
        result = service.execute_id_range(start_id, end_id)
        return jsonify({"status": "success", "data": result})
    except ValueError as exc:
        return _json_error(str(exc), 400)
    except Exception as exc:
        return _json_error(str(exc), 500)


@message_delete_bp.post("/api/niceme/message-delete/delivery-check")
def message_delete_delivery_check():
    """执行 messages 表投递检查，返回汇总和结果列表。"""
    payload = _get_payload()
    try:
        filters = _parse_delivery_check_payload(payload)
        service = build_delete_service(log_feature="message_check")
        result = service.check_post_delivery(
            where_clause=filters["where_clause"],
            params=filters["params"],
        )
        return jsonify({"status": "success", "data": result})
    except ValueError as exc:
        return _json_error(str(exc), 400)
    except Exception as exc:
        return _json_error(str(exc), 500)
