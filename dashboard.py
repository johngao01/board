import datetime
from collections import Counter, defaultdict

import pymysql
from flask import Blueprint, jsonify, request

from config import DB_NICEBOT
from juhe import calculate_trend
from user import build_user_url, detect_platform

dashboard_bp = Blueprint("dashboard", __name__)

IMAGE_SUFFIXES = (".jpg", ".jpeg", ".png", ".gif", ".webp")
VIDEO_SUFFIXES = (".mp4", ".mov")


def normalize_valid(value):
    return None if value is None else int(value)


def message_type_from_valid(value):
    return "关注" if value is not None and int(value) > 0 else "喜欢"


def count_files(captions):
    video_count, image_count = 0, 0
    for caption in captions:
        if not caption:
            continue
        lowered = str(caption).lower()
        if lowered.endswith(IMAGE_SUFFIXES):
            image_count += 1
        elif lowered.endswith(VIDEO_SUFFIXES):
            video_count += 1
    return video_count, image_count


def safe_platform(url):
    return detect_platform(str(url or "")) or "其他"


@dashboard_bp.route("/api/niceme")
def api_niceme():
    """返回 NiceBot 首页卡片和近 7 天趋势数据。"""
    date_str = request.args.get("date", datetime.datetime.now().strftime("%Y-%m-%d"))
    curr_date = datetime.datetime.strptime(date_str, "%Y-%m-%d")

    conn = pymysql.connect(**DB_NICEBOT)
    try:
        end_q = curr_date.strftime("%Y-%m-%d 16:00:00")
        prev_date_str = (curr_date - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
        seven_days_ago = curr_date - datetime.timedelta(days=6)
        start_7d = (seven_days_ago - datetime.timedelta(days=1)).strftime("%Y-%m-%d 16:00:00")

        sql_rows = """
            SELECT t.CAPTION,
                   p.URL,
                   p.USERID,
                   p.IDSTR,
                   DATE_FORMAT(DATE_ADD(t.DATE_TIME, INTERVAL 8 HOUR), '%%Y-%%m-%%d') AS day_str
            FROM tgmsg t
            LEFT JOIN post p ON t.IDSTR = p.IDSTR
            WHERE t.DATE_TIME >= %s
              AND t.DATE_TIME < %s
        """
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute(sql_rows, (start_7d, end_q))
            rows = cursor.fetchall()

        if not rows:
            return jsonify(
                {
                    "status": "empty",
                    "data": {
                        "total": 0,
                        "total_trend": 0,
                        "total_prev": 0,
                        "users": 0,
                        "users_trend": 0,
                        "users_prev": 0,
                        "works": 0,
                        "works_trend": 0,
                        "works_prev": 0,
                        "files": {"video": 0, "image": 0},
                        "files_trend": 0,
                        "files_prev_str": "0/0",
                        "msg_platforms": {},
                        "history": {"dates": [], "msgs": [], "users": [], "works": []},
                        "platform_history_7d": {
                            "dates": [],
                            "platforms": [],
                            "messages": {},
                            "works": {},
                        },
                    },
                }
            )

        day_rows = defaultdict(list)
        day_users = defaultdict(set)
        day_works = defaultdict(set)
        day_platform_messages = defaultdict(Counter)
        day_platform_works = defaultdict(lambda: defaultdict(set))

        for row in rows:
            day_str = row["day_str"]
            day_rows[day_str].append(row)
            user_id = row["USERID"]
            work_id = row["IDSTR"]
            if user_id:
                day_users[day_str].add(user_id)
            if work_id:
                day_works[day_str].add(work_id)

            platform = safe_platform(row["URL"])
            day_platform_messages[day_str][platform] += 1
            if work_id:
                day_platform_works[day_str][platform].add(work_id)

        history_dates = []
        h_msgs, h_users, h_works = [], [], []
        iter_date = seven_days_ago
        while iter_date <= curr_date:
            date_key = iter_date.strftime("%Y-%m-%d")
            history_dates.append(date_key)
            h_msgs.append(len(day_rows.get(date_key, [])))
            h_users.append(len(day_users.get(date_key, set())))
            h_works.append(len(day_works.get(date_key, set())))
            iter_date += datetime.timedelta(days=1)

        df_curr = day_rows.get(date_str, [])
        df_prev = day_rows.get(prev_date_str, [])
        curr_total = len(df_curr)
        prev_total = len(df_prev)
        curr_users = len(day_users.get(date_str, set()))
        prev_users = len(day_users.get(prev_date_str, set()))
        curr_works = len(day_works.get(date_str, set()))
        prev_works = len(day_works.get(prev_date_str, set()))
        curr_v, curr_i = count_files(row["CAPTION"] for row in df_curr)
        prev_v, prev_i = count_files(row["CAPTION"] for row in df_prev)
        msg_platform_data = dict(day_platform_messages.get(date_str, Counter()))

        platform_history = {
            "dates": history_dates,
            "platforms": [],
            "messages": {},
            "works": {},
        }
        platform_scores = Counter()
        all_platforms = set()
        for day in history_dates:
            for platform, count in day_platform_messages.get(day, {}).items():
                platform_scores[platform] += count
                all_platforms.add(platform)
            for platform, work_ids in day_platform_works.get(day, {}).items():
                platform_scores[platform] += len(work_ids)
                all_platforms.add(platform)

        sorted_platforms = sorted(all_platforms, key=lambda item: (-platform_scores[item], item))
        platform_history["platforms"] = sorted_platforms
        platform_history["messages"] = {
            platform: [day_platform_messages.get(day, {}).get(platform, 0) for day in history_dates]
            for platform in sorted_platforms
        }
        platform_history["works"] = {
            platform: [len(day_platform_works.get(day, {}).get(platform, set())) for day in history_dates]
            for platform in sorted_platforms
        }

        return jsonify(
            {
                "status": "success",
                "data": {
                    "total": curr_total,
                    "total_trend": calculate_trend(curr_total, prev_total),
                    "total_prev": prev_total,
                    "users": curr_users,
                    "users_trend": calculate_trend(curr_users, prev_users),
                    "users_prev": prev_users,
                    "works": curr_works,
                    "works_trend": calculate_trend(curr_works, prev_works),
                    "works_prev": prev_works,
                    "files": {"video": curr_v, "image": curr_i},
                    "files_trend": calculate_trend(curr_v + curr_i, prev_v + prev_i),
                    "files_prev_str": f"{prev_v}/{prev_i}",
                    "msg_platforms": msg_platform_data,
                    "history": {
                        "dates": history_dates,
                        "msgs": h_msgs,
                        "users": h_users,
                        "works": h_works,
                    },
                    "platform_history_7d": platform_history,
                },
            }
        )
    except Exception as exc:
        return jsonify({"status": "error", "msg": str(exc)})
    finally:
        conn.close()


@dashboard_bp.route("/api/niceme/works_dist")
def api_works_dist():
    """返回 NiceBot 当日作品平台分布。"""
    date_str = request.args.get("date", datetime.datetime.now().strftime("%Y-%m-%d"))
    curr_date = datetime.datetime.strptime(date_str, "%Y-%m-%d")
    conn = pymysql.connect(**DB_NICEBOT)
    try:
        start_q = (curr_date - datetime.timedelta(days=2)).strftime("%Y-%m-%d 16:00:00")
        end_q = curr_date.strftime("%Y-%m-%d 16:00:00")

        sql = """
            SELECT p.IDSTR,
                   p.URL,
                   t.DATE_TIME,
                   DATE_FORMAT(DATE_ADD(t.DATE_TIME, INTERVAL 8 HOUR), '%%Y-%%m-%%d') AS day_str,
                   u.valid
            FROM tgmsg t
            LEFT JOIN post p ON t.IDSTR = p.IDSTR
            LEFT JOIN user u ON p.USERID = u.USERID
            WHERE t.DATE_TIME >= %s
              AND t.DATE_TIME < %s
              AND p.IDSTR IS NOT NULL
            ORDER BY t.DATE_TIME DESC
        """
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute(sql, (start_q, end_q))
            rows = cursor.fetchall()

        if not rows:
            return jsonify({"total": 0, "platforms": {}})

        work_rows = {}
        for row in rows:
            work_id = row["IDSTR"]
            if work_id and work_id not in work_rows:
                work_rows[work_id] = row

        curr_platforms = Counter()
        curr_total = 0

        for row in work_rows.values():
            day_str = row["day_str"]
            platform = safe_platform(row["URL"])
            if day_str == date_str:
                curr_total += 1
                curr_platforms[platform] += 1

        return jsonify(
            {
                "total": curr_total,
                "platforms": dict(curr_platforms),
            }
        )
    except Exception:
        return jsonify({"total": 0, "platforms": {}})
    finally:
        conn.close()


@dashboard_bp.route("/api/list/niceme_messages")
def list_niceme_messages():
    """返回首页消息流列表数据。"""
    date_str = request.args.get("date", datetime.datetime.now().strftime("%Y-%m-%d"))
    curr_date = datetime.datetime.strptime(date_str, "%Y-%m-%d")
    start_q = (curr_date - datetime.timedelta(days=1)).strftime("%Y-%m-%d 16:00:00")
    end_q = curr_date.strftime("%Y-%m-%d 16:00:00")

    conn = pymysql.connect(**DB_NICEBOT)
    try:
        sql = """
            SELECT t.MESSAGE_ID,
                   p.IDSTR,
                   DATE_ADD(t.DATE_TIME, INTERVAL 8 HOUR) AS LOCAL_TIME,
                   p.USERID,
                   p.USERNAME,
                   p.URL,
                   t.CAPTION,
                   u.VALID,
                   p.TEXT_RAW
            FROM tgmsg t
            LEFT JOIN post p ON t.IDSTR = p.IDSTR
            LEFT JOIN user u ON p.USERID = u.USERID
            WHERE t.DATE_TIME >= %s
              AND t.DATE_TIME < %s
            ORDER BY t.DATE_TIME DESC
        """
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute(sql, (start_q, end_q))
            rows = cursor.fetchall()

        if not rows:
            return jsonify({"data": []})

        result = []
        for row in rows:
            url = str(row["URL"])
            caption = row["CAPTION"] or ""
            platform = safe_platform(url)
            user_url = build_user_url(platform, row["USERID"])
            valid = normalize_valid(row["VALID"])
            msg_type = message_type_from_valid(valid)
            file_type = "未知"
            lowered_caption = caption.lower()
            if lowered_caption.endswith(VIDEO_SUFFIXES):
                file_type = "视频"
            elif lowered_caption.endswith(IMAGE_SUFFIXES):
                file_type = "图片"

            result.append(
                {
                    "id": row["MESSAGE_ID"],
                    "idstr": row["IDSTR"] or "",
                    "time": row["LOCAL_TIME"].strftime("%H:%M:%S"),
                    "username": row["USERNAME"] or "未知",
                    "text": row["TEXT_RAW"],
                    "user_url": user_url,
                    "platform": platform,
                    "type": msg_type,
                    "file_type": file_type,
                    "caption": caption,
                    "url": url,
                    "valid": valid,
                }
            )
        return jsonify({"data": result})
    finally:
        conn.close()
