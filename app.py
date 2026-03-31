from flask import Flask, jsonify, request, send_from_directory
import pymysql
import pandas as pd
import datetime
from config import DB_NICEBOT, DB_TIKTOK, FRONTEND_DIST_DIR
from juhe import juhe_bp, init_city_cache, calculate_trend
from user_report import user_report_bp, detect_platform

app = Flask(__name__, static_folder=str(FRONTEND_DIST_DIR), static_url_path="")

app.register_blueprint(juhe_bp)
app.register_blueprint(user_report_bp)

init_city_cache()


def serve_spa_entry():
    return send_from_directory(app.static_folder, 'index.html')


# ==========================================
#               NiceBot 接口
# ==========================================


@app.route('/api/niceme')
def api_niceme():
    date_str = request.args.get(
        'date', datetime.datetime.now().strftime('%Y-%m-%d'))
    curr_date = datetime.datetime.strptime(date_str, '%Y-%m-%d')

    conn = pymysql.connect(**DB_NICEBOT)
    try:
        start_q = (curr_date - datetime.timedelta(days=2)
                   ).strftime('%Y-%m-%d 16:00:00')
        end_q = curr_date.strftime('%Y-%m-%d 16:00:00')

        sql_detail = """SELECT CAPTION, URL, USERID, IDSTR, DATE_ADD(DATE_TIME, INTERVAL 8 HOUR) as local_time
                        FROM messages
                        WHERE DATE_TIME >= %s
                          AND DATE_TIME < %s"""
        df = pd.read_sql(sql_detail, conn, params=[start_q, end_q])

        # 空数据结构
        if df.empty:
            return jsonify({"status": "empty", "data": {
                "total": 0, "total_trend": 0, "total_prev": 0,
                "users": 0, "users_trend": 0, "users_prev": 0,
                "works": 0, "works_trend": 0, "works_prev": 0,
                "files": {"video": 0, "image": 0}, "files_trend": 0, "files_prev_str": "0/0",
                "msg_platforms": {},
                "history": {"dates": [], "msgs": [], "users": [], "works": []}
            }})

        df['day_str'] = df['local_time'].dt.strftime('%Y-%m-%d')
        prev_date_str = (curr_date - datetime.timedelta(days=1)
                         ).strftime('%Y-%m-%d')

        df_curr = df[df['day_str'] == date_str].copy()
        df_prev = df[df['day_str'] == prev_date_str].copy()

        curr_total = len(df_curr)
        prev_total = len(df_prev)
        curr_users = df_curr["USERID"].nunique()
        prev_users = df_prev["USERID"].nunique()
        curr_works = df_curr["IDSTR"].nunique()
        prev_works = df_prev["IDSTR"].nunique()

        def count_files(captions):
            v, i = 0, 0
            for c in captions:
                if c:
                    if c.endswith((".jpg", ".jpeg", ".png", ".gif")):
                        i += 1
                    elif c.endswith((".mp4", ".mov")):
                        v += 1
            return v, i

        curr_v, curr_i = count_files(df_curr["CAPTION"])
        prev_v, prev_i = count_files(df_prev["CAPTION"])

        # 1. 消息分布 (基于所有消息)
        df_curr["platform"] = df_curr["URL"].apply(detect_platform)
        msg_platform_data = df_curr["platform"].value_counts().to_dict()

        # 2. 历史趋势
        seven_days_ago = curr_date - datetime.timedelta(days=6)
        start_7d = (seven_days_ago - datetime.timedelta(days=1)
                    ).strftime('%Y-%m-%d 16:00:00')
        sql_trend = """SELECT DATE_FORMAT(DATE_ADD(DATE_TIME, INTERVAL 8 HOUR), '%%Y-%%m-%%d') as d,
                              COUNT(*)                                                         as msg_cnt,
                              COUNT(DISTINCT USERID)                                           as user_cnt,
                              COUNT(DISTINCT IDSTR)                                            as work_cnt
                       FROM messages
                       WHERE DATE_TIME >= %s
                         AND DATE_TIME < %s
                       GROUP BY d
                       ORDER BY d ASC"""
        cursor = conn.cursor()
        cursor.execute(sql_trend, (start_7d, end_q))
        trend_res = cursor.fetchall()

        history_dates, h_msgs, h_users, h_works = [], [], [], []
        data_map = {row[0]: row for row in trend_res}
        iter_date = seven_days_ago
        while iter_date <= curr_date:
            d_s = iter_date.strftime('%Y-%m-%d')
            history_dates.append(d_s)
            if d_s in data_map:
                row = data_map[d_s]
                h_msgs.append(row[1])
                h_users.append(row[2])
                h_works.append(row[3])
            else:
                h_msgs.append(0)
                h_users.append(0)
                h_works.append(0)
            iter_date += datetime.timedelta(days=1)

        return jsonify({
            "status": "success",
            "data": {
                "total": curr_total, "total_trend": calculate_trend(curr_total, prev_total), "total_prev": prev_total,
                "users": curr_users, "users_trend": calculate_trend(curr_users, prev_users), "users_prev": prev_users,
                "works": curr_works, "works_trend": calculate_trend(curr_works, prev_works), "works_prev": prev_works,
                "files": {"video": curr_v, "image": curr_i},
                "files_trend": calculate_trend(curr_v + curr_i, prev_v + prev_i),
                "files_prev_str": f"{prev_v}/{prev_i}",
                "msg_platforms": msg_platform_data,
                "history": {"dates": history_dates, "msgs": h_msgs, "users": h_users, "works": h_works}
            }
        })
    except Exception as e:
        return jsonify({"status": "error", "msg": str(e)})
    finally:
        conn.close()


@app.route('/api/niceme/works_dist')
def api_works_dist():
    date_str = request.args.get(
        'date', datetime.datetime.now().strftime('%Y-%m-%d'))
    curr_date = datetime.datetime.strptime(date_str, '%Y-%m-%d')
    conn = pymysql.connect(**DB_NICEBOT)
    try:
        start_q = (curr_date - datetime.timedelta(days=2)
                   ).strftime('%Y-%m-%d 16:00:00')
        end_q = curr_date.strftime('%Y-%m-%d 16:00:00')

        sql = """SELECT m.IDSTR, m.URL, DATE_ADD(m.DATE_TIME, INTERVAL 8 HOUR) as local_time, u.valid
                 FROM (SELECT IDSTR, URL, USERID, DATE_TIME FROM messages WHERE DATE_TIME >= %s AND DATE_TIME < %s) m
                          LEFT JOIN user u ON m.USERID = u.USERID"""
        df = pd.read_sql(sql, conn, params=[start_q, end_q])

        if df.empty:
            return jsonify({"total": 0, "platforms": {}, "types": {}, "prev_str": "0/0"})

        df['type'] = df['valid'].apply(
            lambda x: '关注' if (pd.notnull(x) and x > 0) else '喜欢')
        df['platform'] = df['URL'].apply(detect_platform)
        df['day_str'] = df['local_time'].dt.strftime('%Y-%m-%d')
        prev_date_str = (curr_date - datetime.timedelta(days=1)
                         ).strftime('%Y-%m-%d')

        # 基于作品去重
        df_unique = df.drop_duplicates(subset=['IDSTR'])
        df_curr = df_unique[df_unique['day_str'] == date_str]
        df_prev = df_unique[df_unique['day_str'] == prev_date_str]

        prev_counts = df_prev['type'].value_counts()

        return jsonify({
            "total": len(df_curr),
            "platforms": df_curr['platform'].value_counts().to_dict(),
            "types": df_curr['type'].value_counts().to_dict(),
            "prev_str": f"关注:{prev_counts.get('关注', 0)} / 喜欢:{prev_counts.get('喜欢', 0)}"
        })
    except Exception as e:
        return jsonify({"total": 0, "platforms": {}, "types": {}, "prev_str": "Err"})
    finally:
        conn.close()


@app.route('/api/list/niceme_messages')
def list_niceme_messages():
    date_str = request.args.get(
        'date', datetime.datetime.now().strftime('%Y-%m-%d'))
    curr_date = datetime.datetime.strptime(date_str, '%Y-%m-%d')
    start_q = (curr_date - datetime.timedelta(days=1)
               ).strftime('%Y-%m-%d 16:00:00')
    end_q = curr_date.strftime('%Y-%m-%d 16:00:00')

    conn = pymysql.connect(**DB_NICEBOT)
    try:
        sql = """
              SELECT m.MESSAGE_ID,
                     DATE_ADD(m.DATE_TIME, INTERVAL 8 HOUR) as local_time,
                     m.userid,
                     m.USERNAME,
                     m.URL,
                     m.CAPTION,
                     u.valid,
                     m.text_raw
              FROM messages m
                       LEFT JOIN user u ON m.USERID = u.USERID
              WHERE m.DATE_TIME >= %s
                AND m.DATE_TIME < %s
              ORDER BY m.DATE_TIME DESC \
              """
        df = pd.read_sql(sql, conn, params=[start_q, end_q])
        if df.empty:
            return jsonify({"data": []})

        result = []
        for _, row in df.iterrows():
            url = str(row['URL'])
            caption = row['CAPTION'] or ""
            platform = "其他"
            user_url = ''
            if "weibo" in url:
                platform = "微博"
                user_url = f"https://weibo.com/u/{row['userid']}"
            elif "douyin" in url:
                platform = "抖音"
                user_url = f"https://douyin.com/user/{row['userid']}"
            elif "instagram" in url:
                platform = "Instagram"
                user_url = f"https://instagram.com/{row['userid']}"
            elif 'bilibili' in url:
                platform = 'B站'
                user_url = 'https://space.bilibili.com/{userid}'

            valid = row['valid']
            msg_type = "关注" if (pd.notnull(valid) and valid > 0) else "喜欢"
            file_type = "未知"
            if caption.lower().endswith(('.mp4', '.mov')):
                file_type = "视频"
            elif caption.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp')):
                file_type = "图片"

            result.append({
                "id": row['MESSAGE_ID'],
                "time": row['local_time'].strftime('%H:%M:%S'),
                "username": row['USERNAME'] or "未知",
                "text": row['text_raw'],
                "user_url": user_url,
                "platform": platform,
                "type": msg_type,
                "file_type": file_type,
                "caption": caption,
                "url": url
            })
        return jsonify({"data": result})
    finally:
        conn.close()


@app.route('/api/niceme/users')
def list_niceme_users():
    conn = pymysql.connect(**DB_NICEBOT)
    try:
        cursor = conn.cursor(pymysql.cursors.DictCursor)
        # 改为 SELECT * 获取所有字段
        sql = "SELECT * FROM user ORDER BY USERID DESC"
        cursor.execute(sql)
        return jsonify({"status": "success", "data": cursor.fetchall()})
    except Exception as e:
        return jsonify({"status": "error", "msg": str(e), "data": []}), 500
    finally:
        conn.close()

@app.route('/api/niceme/users/<string:user_id>', methods=['PUT'])
def update_niceme_user(user_id):
    payload = request.get_json(silent=True) or {}
    
    # 防止 USERID 被意外修改
    if 'USERID' in payload:
        del payload['USERID']

    if not payload:
        return jsonify({"status": "error", "msg": "未提供需要更新的字段"}), 400

    conn = pymysql.connect(**DB_NICEBOT)
    try:
        cursor = conn.cursor()
        
        # 动态构建 UPDATE 语句
        set_clauses = []
        values = []
        for key, value in payload.items():
            set_clauses.append(f"{key} = %s")
            values.append(value)
            
        sql = f"UPDATE user SET {', '.join(set_clauses)} WHERE USERID = %s"
        values.append(user_id)
        
        cursor.execute(sql, tuple(values))
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({"status": "error", "msg": "用户不存在或数据未发生变化"}), 404
            
        return jsonify({"status": "success"})
    except Exception as e:
        conn.rollback()
        return jsonify({"status": "error", "msg": str(e)}), 500
    finally:
        conn.close()


# ==========================================
#               TikTok 接口
# ==========================================


def get_tiktok_metric(sql_template, date_str):
    curr_date = datetime.datetime.strptime(date_str, '%Y-%m-%d')
    prev_date = curr_date - datetime.timedelta(days=1)
    conn = pymysql.connect(**DB_TIKTOK)
    cursor = conn.cursor()
    cursor.execute(sql_template, (date_str, (curr_date +
                                             datetime.timedelta(days=1)).strftime('%Y-%m-%d')))
    val_curr = cursor.fetchone()[0]
    cursor.execute(sql_template, (prev_date.strftime('%Y-%m-%d'), date_str))
    val_prev = cursor.fetchone()[0]
    conn.close()
    return val_curr, calculate_trend(val_curr, val_prev), val_prev


@app.route('/api/tiktok/scraped')
def tk_scraped():
    d = request.args.get('date')
    sql = "select count(*) from aweme where SCRAPY_AT >= %s AND SCRAPY_AT < %s"
    return jsonify(dict(zip(["val", "trend", "prev"], get_tiktok_metric(sql, d))))


@app.route('/api/tiktok/active')
def tk_active():
    d = request.args.get('date')
    sql = "select count(distinct chat_id) from messages where DATE_TIME >= %s AND DATE_TIME < %s"
    return jsonify(dict(zip(["val", "trend", "prev"], get_tiktok_metric(sql, d))))


@app.route('/api/tiktok/new')
def tk_new():
    d = request.args.get('date')
    sql = "select count(distinct chat_id) from users where created_at >= %s AND created_at < %s"
    return jsonify(dict(zip(["val", "trend", "prev"], get_tiktok_metric(sql, d))))


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def frontend_routes(path):
    if path.startswith('api/'):
        return jsonify({"status": "error", "msg": "Not found"}), 404

    requested_path = FRONTEND_DIST_DIR / path
    if path and requested_path.exists() and requested_path.is_file():
        return send_from_directory(app.static_folder, path)

    return serve_spa_entry()


if __name__ == '__main__':
    app.run(debug=True, port=12345, host="0.0.0.0", threaded=True)
