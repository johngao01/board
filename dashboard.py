import datetime

import pandas as pd
import pymysql
from flask import Blueprint, jsonify, request

from config import DB_NICEBOT
from juhe import calculate_trend
from user import build_user_url, detect_platform

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/api/niceme")
def api_niceme():
    """返回 NiceBot 首页卡片和近 7 天趋势数据。"""
    date_str = request.args.get("date", datetime.datetime.now().strftime("%Y-%m-%d"))
    curr_date = datetime.datetime.strptime(date_str, "%Y-%m-%d")

    conn = pymysql.connect(**DB_NICEBOT)
    try:
        start_q = (curr_date - datetime.timedelta(days=2)).strftime("%Y-%m-%d 16:00:00")
        end_q = curr_date.strftime("%Y-%m-%d 16:00:00")

        sql_detail = """
            SELECT CAPTION, URL, USERID, IDSTR, DATE_ADD(DATE_TIME, INTERVAL 8 HOUR) as local_time
            FROM messages
            WHERE DATE_TIME >= %s
              AND DATE_TIME < %s
        """
        df = pd.read_sql(sql_detail, conn, params=[start_q, end_q])

        if df.empty:
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
                    },
                }
            )

        df["day_str"] = df["local_time"].dt.strftime("%Y-%m-%d")
        prev_date_str = (curr_date - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
        df_curr = df[df["day_str"] == date_str].copy()
        df_prev = df[df["day_str"] == prev_date_str].copy()

        curr_total = len(df_curr)
        prev_total = len(df_prev)
        curr_users = df_curr["USERID"].nunique()
        prev_users = df_prev["USERID"].nunique()
        curr_works = df_curr["IDSTR"].nunique()
        prev_works = df_prev["IDSTR"].nunique()

        def count_files(captions):
            """统计消息附件里的视频和图片数量。"""
            video_count, image_count = 0, 0
            for caption in captions:
                if caption:
                    if caption.endswith((".jpg", ".jpeg", ".png", ".gif")):
                        image_count += 1
                    elif caption.endswith((".mp4", ".mov")):
                        video_count += 1
            return video_count, image_count

        curr_v, curr_i = count_files(df_curr["CAPTION"])
        prev_v, prev_i = count_files(df_prev["CAPTION"])

        df_curr["platform"] = df_curr["URL"].apply(detect_platform)
        msg_platform_data = df_curr["platform"].value_counts().to_dict()

        seven_days_ago = curr_date - datetime.timedelta(days=6)
        start_7d = (seven_days_ago - datetime.timedelta(days=1)).strftime("%Y-%m-%d 16:00:00")
        sql_trend = """
            SELECT DATE_FORMAT(DATE_ADD(DATE_TIME, INTERVAL 8 HOUR), '%%Y-%%m-%%d') as d,
                   COUNT(*) as msg_cnt,
                   COUNT(DISTINCT USERID) as user_cnt,
                   COUNT(DISTINCT IDSTR) as work_cnt
            FROM messages
            WHERE DATE_TIME >= %s
              AND DATE_TIME < %s
            GROUP BY d
            ORDER BY d ASC
        """
        cursor = conn.cursor()
        cursor.execute(sql_trend, (start_7d, end_q))
        trend_res = cursor.fetchall()

        history_dates, h_msgs, h_users, h_works = [], [], [], []
        data_map = {row[0]: row for row in trend_res}
        iter_date = seven_days_ago
        while iter_date <= curr_date:
            date_key = iter_date.strftime("%Y-%m-%d")
            history_dates.append(date_key)
            if date_key in data_map:
                row = data_map[date_key]
                h_msgs.append(row[1])
                h_users.append(row[2])
                h_works.append(row[3])
            else:
                h_msgs.append(0)
                h_users.append(0)
                h_works.append(0)
            iter_date += datetime.timedelta(days=1)

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
                },
            }
        )
    except Exception as exc:
        return jsonify({"status": "error", "msg": str(exc)})
    finally:
        conn.close()


@dashboard_bp.route("/api/niceme/works_dist")
def api_works_dist():
    """返回 NiceBot 当日作品平台分布和关注类型分布。"""
    date_str = request.args.get("date", datetime.datetime.now().strftime("%Y-%m-%d"))
    curr_date = datetime.datetime.strptime(date_str, "%Y-%m-%d")
    conn = pymysql.connect(**DB_NICEBOT)
    try:
        start_q = (curr_date - datetime.timedelta(days=2)).strftime("%Y-%m-%d 16:00:00")
        end_q = curr_date.strftime("%Y-%m-%d 16:00:00")

        sql = """
            SELECT m.IDSTR, m.URL, DATE_ADD(m.DATE_TIME, INTERVAL 8 HOUR) as local_time, u.valid
            FROM (SELECT IDSTR, URL, USERID, DATE_TIME FROM messages WHERE DATE_TIME >= %s AND DATE_TIME < %s) m
            LEFT JOIN user u ON m.USERID = u.USERID
        """
        df = pd.read_sql(sql, conn, params=[start_q, end_q])

        if df.empty:
            return jsonify({"total": 0, "platforms": {}, "types": {}, "prev_str": "0/0"})

        df["type"] = df["valid"].apply(lambda x: "关注" if (pd.notnull(x) and x > 0) else "喜欢")
        df["platform"] = df["URL"].apply(detect_platform)
        df["day_str"] = df["local_time"].dt.strftime("%Y-%m-%d")
        prev_date_str = (curr_date - datetime.timedelta(days=1)).strftime("%Y-%m-%d")

        df_unique = df.drop_duplicates(subset=["IDSTR"])
        df_curr = df_unique[df_unique["day_str"] == date_str]
        df_prev = df_unique[df_unique["day_str"] == prev_date_str]
        prev_counts = df_prev["type"].value_counts()

        return jsonify(
            {
                "total": len(df_curr),
                "platforms": df_curr["platform"].value_counts().to_dict(),
                "types": df_curr["type"].value_counts().to_dict(),
                "prev_str": f"关注:{prev_counts.get('关注', 0)} / 喜欢:{prev_counts.get('喜欢', 0)}",
            }
        )
    except Exception:
        return jsonify({"total": 0, "platforms": {}, "types": {}, "prev_str": "Err"})
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
            SELECT m.MESSAGE_ID,
                   DATE_ADD(m.DATE_TIME, INTERVAL 8 HOUR) as LOCAL_TIME,
                   m.USERID,
                   m.USERNAME,
                   m.URL,
                   m.CAPTION,
                   u.VALID,
                   m.TEXT_RAW
            FROM messages m
            LEFT JOIN user u ON m.USERID = u.USERID
            WHERE m.DATE_TIME >= %s
              AND m.DATE_TIME < %s
            ORDER BY m.DATE_TIME DESC
        """
        df = pd.read_sql(sql, conn, params=[start_q, end_q])
        if df.empty:
            return jsonify({"data": []})

        result = []
        for _, row in df.iterrows():
            url = str(row["URL"])
            caption = row["CAPTION"] or ""
            platform = detect_platform(url)
            user_url = build_user_url(platform, row["USERID"])
            valid = row["VALID"]
            msg_type = "关注" if (pd.notnull(valid) and valid > 0) else "喜欢"
            file_type = "未知"
            if caption.lower().endswith((".mp4", ".mov")):
                file_type = "视频"
            elif caption.lower().endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
                file_type = "图片"

            result.append(
                {
                    "id": row["MESSAGE_ID"],
                    "time": row["LOCAL_TIME"].strftime("%H:%M:%S"),
                    "username": row["USERNAME"] or "未知",
                    "text": row["TEXT_RAW"],
                    "user_url": user_url,
                    "platform": platform,
                    "type": msg_type,
                    "file_type": file_type,
                    "caption": caption,
                    "url": url,
                }
            )
        return jsonify({"data": result})
    finally:
        conn.close()
