import datetime
import json
import warnings

import pandas as pd
import pymysql
from flask import Blueprint, current_app, jsonify, request

from config import BASE_DIR, DB_NICEBOT

warnings.filterwarnings(
    "ignore", message=".*pandas only supports SQLAlchemy connectable.*"
)

user_bp = Blueprint("user", __name__)

USER_UPDATE_LOG_PATH = BASE_DIR / "logs" / "niceme_user_updates.jsonl"


def detect_platform(url):
    """根据作品链接识别所属平台。"""
    if not isinstance(url, str):
        return "其他"

    url_l = url.lower()
    if "weibo" in url_l:
        return "微博"
    if "douyin" in url_l:
        return "抖音"
    if "instagram" in url_l:
        return "Instagram"
    if "bilibili" in url_l:
        return "B站"
    return "其他"


def build_user_url(platform, userid):
    """根据平台和用户 ID 构造对应的个人主页链接。"""
    userid_str = str(userid or "")
    if platform == "微博":
        return f"https://weibo.com/u/{userid_str}"
    if platform == "抖音":
        return f"https://douyin.com/user/{userid_str}"
    if platform == "Instagram":
        return f"https://instagram.com/{userid_str}"
    if platform == "B站":
        return f"https://space.bilibili.com/{userid_str}"
    return ""


def append_user_update_log(entry):
    """把用户资料修改记录追加写入日志文件。"""
    USER_UPDATE_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with USER_UPDATE_LOG_PATH.open("a", encoding="utf-8") as log_file:
        log_file.write(json.dumps(entry, ensure_ascii=False) + "\n")


def process_messages_df(df):
    """把原始消息 DataFrame 转成前端使用的展示结构。"""
    res = []
    for _, row in df.iterrows():
        caption = row["CAPTION"] or ""
        file_type = "文本"
        if caption.lower().endswith((".mp4", ".mov")):
            file_type = "视频"
        elif caption.lower().endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
            file_type = "图片"

        url = row["URL"]
        userid = row["USERID"]
        platform = detect_platform(url)
        user_url = build_user_url(platform, userid)
        local_time = pd.to_datetime(row["DATE_TIME"]) + datetime.timedelta(hours=8)

        res.append(
            {
                "id": row["MESSAGE_ID"],
                "time": local_time.strftime("%Y-%m-%d %H:%M:%S"),
                "user_url": user_url,
                "username": row["USERNAME"] or "未知",
                "platform": platform,
                "text": row["TEXT_RAW"] or "",
                "url": url,
                "file_type": file_type,
                "caption": caption,
            }
        )
    return res


@user_bp.route("/api/niceme/users")
def list_niceme_users():
    """返回 NiceBot 用户表的完整列表。"""
    conn = pymysql.connect(**DB_NICEBOT)
    try:
        cursor = conn.cursor(pymysql.cursors.DictCursor)
        cursor.execute("SELECT * FROM user ORDER BY USERID DESC")
        return jsonify({"status": "success", "data": cursor.fetchall()})
    except Exception as exc:
        return jsonify({"status": "error", "msg": str(exc), "data": []}), 500
    finally:
        conn.close()


@user_bp.route("/api/niceme/users/<string:user_id>", methods=["PUT"])
def update_niceme_user(user_id):
    """更新指定用户字段，并记录修改日志。"""
    payload = request.get_json(silent=True) or {}
    original_platform = request.args.get("platform", "")

    if not payload:
        return jsonify({"status": "error", "msg": "未提供需要更新的字段"}), 400

    conn = pymysql.connect(**DB_NICEBOT)
    try:
        cursor = conn.cursor(pymysql.cursors.DictCursor)

        if original_platform:
            cursor.execute(
                "SELECT * FROM user WHERE USERID = %s AND platform = %s LIMIT 1",
                (user_id, original_platform),
            )
        else:
            cursor.execute("SELECT * FROM user WHERE USERID = %s LIMIT 1", (user_id,))

        original_row = cursor.fetchone()
        if not original_row:
            return jsonify({"status": "error", "msg": "用户不存在"}), 404

        changed_items = []
        for key, value in payload.items():
            before_value = "" if original_row.get(key) is None else str(original_row.get(key))
            after_value = "" if value is None else str(value)
            if before_value != after_value:
                changed_items.append(
                    {
                        "field": key,
                        "before": before_value,
                        "after": after_value,
                    }
                )

        if not changed_items:
            return jsonify({"status": "error", "msg": "用户不存在或数据未发生变化"}), 404

        set_clauses = []
        values = []
        for item in changed_items:
            set_clauses.append(f"{item['field']} = %s")
            values.append(item["after"])

        sql = f"UPDATE user SET {', '.join(set_clauses)} WHERE USERID = %s"
        values.append(user_id)
        if original_platform:
            sql += " AND platform = %s"
            values.append(original_platform)

        cursor.execute(sql, tuple(values))
        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({"status": "error", "msg": "用户不存在或数据未发生变化"}), 404

        log_entry = {
            "timestamp": datetime.datetime.now().isoformat(timespec="seconds"),
            "user_id": user_id,
            "platform": original_platform or str(original_row.get("platform") or ""),
            "changes": changed_items,
        }

        log_msg = (
            f"将 {user_id} 的 {changed_items[0]['field']} 从 "
            f"{changed_items[0]['before'] or '-'} 修改为 {changed_items[0]['after'] or '-'} 成功"
        )
        if len(changed_items) > 1:
            log_msg = f"将 {user_id} 的 {len(changed_items)} 个字段修改成功"

        try:
            append_user_update_log(log_entry)
        except Exception as log_error:
            current_app.logger.exception("Failed to write niceme user update log")
            return jsonify(
                {
                    "status": "success",
                    "msg": f"{log_msg}，但日志写入失败：{log_error}",
                }
            )

        return jsonify({"status": "success", "msg": log_msg})
    except Exception as exc:
        conn.rollback()
        return jsonify({"status": "error", "msg": str(exc)}), 500
    finally:
        conn.close()


@user_bp.route("/api/user/report")
def api_user_report():
    """返回用户详情页首屏所需的统计、热力图和最新消息。"""
    identity = request.args.get("identity")
    target_month = datetime.datetime.now().strftime("%Y-%m")
    per_page = 100
    conn = pymysql.connect(**DB_NICEBOT)
    try:
        sql = "SELECT * FROM messages WHERE USERID = %s OR USERNAME = %s"
        if identity == "favorite":
            sql = "SELECT * FROM messages WHERE USERID not in (select userid from user)"
            df = pd.read_sql(sql, conn)
        else:
            df = pd.read_sql(sql, conn, params=[identity, identity])

        if df.empty:
            return jsonify({"status": "empty", "msg": "未找到相关数据"})

        df["platform"] = df["URL"].apply(detect_platform)
        df["local_time"] = pd.to_datetime(df["DATE_TIME"]) + datetime.timedelta(hours=8)
        df["day_str"] = df["local_time"].dt.strftime("%Y-%m-%d")
        df["month_str"] = df["local_time"].dt.strftime("%Y-%m")

        total_msgs = len(df)
        total_works = df["IDSTR"].nunique()
        total_pages = int((total_msgs + per_page - 1) // per_page)

        video_cnt = 0
        image_cnt = 0
        for caption in df["CAPTION"]:
            if caption:
                if caption.lower().endswith((".mp4", ".mov")):
                    video_cnt += 1
                elif caption.lower().endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
                    image_cnt += 1

        acc_df = (
            df.groupby("USERID")
            .agg(
                {
                    "USERNAME": "first",
                    "platform": "first",
                    "MESSAGE_ID": "count",
                    "IDSTR": "nunique",
                }
            )
            .reset_index()
        )

        accounts_stats = []
        for _, row in acc_df.iterrows():
            platform = str(row["platform"])
            userid = str(row["USERID"])
            accounts_stats.append(
                {
                    "userid": userid,
                    "username": str(row["USERNAME"]),
                    "platform": platform,
                    "user_url": build_user_url(platform, userid),
                    "msg_count": int(row["MESSAGE_ID"]),
                    "work_count": int(row["IDSTR"]),
                }
            )

        platform_dist = df["platform"].value_counts().to_dict()
        heatmap_df = df[df["month_str"] == target_month]
        heatmap_data = heatmap_df.groupby("day_str").size().reset_index().values.tolist()

        df_latest = df.sort_values("DATE_TIME", ascending=False).head(100)
        messages_list = process_messages_df(df_latest)

        return jsonify(
            {
                "status": "success",
                "stats": {
                    "total": total_msgs,
                    "works": total_works,
                    "video": video_cnt,
                    "image": image_cnt,
                    "platforms": platform_dist,
                },
                "info": {
                    "accounts_stats": accounts_stats,
                    "current_month": target_month,
                    "total_pages": total_pages,
                },
                "heatmap": heatmap_data,
                "messages": messages_list,
                "total_pages": total_pages,
            }
        )
    except Exception as exc:
        return jsonify({"status": "error", "msg": str(exc)})
    finally:
        conn.close()


@user_bp.route("/api/user/messages")
def api_user_messages():
    """按页返回指定用户的消息明细列表。"""
    identity = request.args.get("identity")
    page = int(request.args.get("page", 1))
    date_filter = request.args.get("date")
    per_page = 100
    offset = (page - 1) * per_page
    conn = pymysql.connect(**DB_NICEBOT)
    try:
        sql = "SELECT * FROM messages WHERE (USERID = %s OR USERNAME = %s) ORDER BY DATE_TIME DESC"
        if identity == "favorite":
            sql = "SELECT * FROM messages WHERE USERID not in (select userid from user) ORDER BY DATE_TIME DESC"
            df = pd.read_sql(sql, conn)
        else:
            df = pd.read_sql(sql, conn, params=[identity, identity])

        if df.empty:
            return jsonify(
                {
                    "status": "success",
                    "messages": [],
                    "total_pages": 0,
                    "total_count": 0,
                    "current_date": date_filter,
                }
            )

        df["DATE_TIME_LOCAL"] = pd.to_datetime(df["DATE_TIME"]) + datetime.timedelta(hours=8)
        if date_filter:
            df = df[df["DATE_TIME_LOCAL"].dt.strftime("%Y-%m-%d") == date_filter]

        total_count = int(len(df))
        total_pages = int((total_count + per_page - 1) // per_page)
        df_page = df.iloc[offset: offset + per_page]

        return jsonify(
            {
                "status": "success",
                "messages": process_messages_df(df_page),
                "total_pages": total_pages,
                "total_count": total_count,
                "current_date": date_filter,
            }
        )
    except Exception as exc:
        return jsonify({"status": "error", "msg": str(exc)})
    finally:
        conn.close()


@user_bp.route("/api/user/heatmap")
def api_user_message_relitu():
    """返回指定用户某个月份的消息热力图数据。"""
    identity = request.args.get("identity")
    target_month = request.args.get("month")

    conn = pymysql.connect(**DB_NICEBOT)
    try:
        sql = "SELECT * FROM messages WHERE (USERID = %s OR USERNAME = %s) ORDER BY DATE_TIME DESC"
        if identity == "favorite":
            sql = "SELECT * FROM messages WHERE USERID not in (select userid from user) ORDER BY DATE_TIME DESC"
            df = pd.read_sql(sql, conn)
        else:
            df = pd.read_sql(sql, conn, params=[identity, identity])

        df["local_time"] = pd.to_datetime(df["DATE_TIME"]) + datetime.timedelta(hours=8)
        df["day_str"] = df["local_time"].dt.strftime("%Y-%m-%d")
        df["month_str"] = df["local_time"].dt.strftime("%Y-%m")
        heatmap_df = df[df["month_str"] == target_month]
        heatmap_data = heatmap_df.groupby("day_str").size().reset_index().values.tolist()

        return jsonify({"status": "success", "month": target_month, "data": heatmap_data})
    finally:
        conn.close()
