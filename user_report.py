from flask import Blueprint, render_template, request, jsonify
import pymysql
import pandas as pd
import datetime
import calendar
import warnings

# 放在 app.py 的顶部，import pandas 之前或之后均可
warnings.filterwarnings(
    'ignore', message=".*pandas only supports SQLAlchemy connectable.*")
user_report_bp = Blueprint('user_report', __name__)

# 数据库连接配置 (请确保与你的 app.py 一致)
DB_CONFIG = {
    "host": "127.0.0.1",
    "user": "root",
    "password": "31305a0fbd",
    "database": "nicebot",
    "charset": "utf8mb4"
}


def get_platform(url):
    if not isinstance(url, str):
        return "其他"
    url_l = url.lower()
    if "weibo" in url_l:
        return "微博"
    if "douyin" in url_l:
        return "抖音"
    if "instagram" in url_l:
        return "Instagram"
    return "其他"


def process_messages_df(df):
    """处理消息列表格式，对齐首页样式"""
    res = []
    for _, row in df.iterrows():
        caption = row['CAPTION'] or ""
        file_type = "文本"
        if caption.lower().endswith(('.mp4', '.mov')):
            file_type = "视频"
        elif caption.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp')):
            file_type = "图片"

        # 转换显示时间 (+8h)
        local_time = pd.to_datetime(
            row['DATE_TIME']) + datetime.timedelta(hours=8)

        res.append({
            "id": row['MESSAGE_ID'],
            "time": local_time.strftime('%Y-%m-%d %H:%M:%S'),
            "username": row['USERNAME'] or "未知",
            "platform": get_platform(row['URL']),
            "text": row['TEXT_RAW'] or "",
            "url": row['URL'],
            "file_type": file_type,
            "caption": caption
        })
    return res


@user_report_bp.route('/user/<identity>')
def user_report_page(identity):
    """渲染用户报告页面"""
    return render_template('user_report.html', identity=identity)


@user_report_bp.route('/api/user/report')
def api_user_report():
    """初始化报告数据：统计信息 + 账号聚合 + 首页消息 + 当月热力图"""
    identity = request.args.get('identity')
    target_month = datetime.datetime.now().strftime('%Y-%m')
    per_page = 100
    conn = pymysql.connect(**DB_CONFIG)
    try:
        # 1. 查询该用户的所有消息
        sql = "SELECT * FROM messages WHERE USERID = %s OR USERNAME = %s"
        if identity == 'favorite':
            sql = "SELECT * FROM messages WHERE USERID not in (select userid from user)"
            df = pd.read_sql(sql, conn)
        else:
            df = pd.read_sql(sql, conn, params=[identity, identity])

        if df.empty:
            return jsonify({"status": "empty", "msg": "未找到相关数据"})

        # 2. 统计基础逻辑
        df['platform'] = df['URL'].apply(get_platform)
        df['local_time'] = pd.to_datetime(
            df['DATE_TIME']) + datetime.timedelta(hours=8)
        df['day_str'] = df['local_time'].dt.strftime('%Y-%m-%d')
        df['month_str'] = df['local_time'].dt.strftime('%Y-%m')

        total_msgs = len(df)
        total_works = df['IDSTR'].nunique()
        total_pages = int((total_msgs + per_page - 1) // per_page)

        # 文件统计
        video_cnt = 0
        image_cnt = 0
        for c in df['CAPTION']:
            if c:
                if c.lower().endswith(('.mp4', '.mov')):
                    video_cnt += 1
                elif c.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp')):
                    image_cnt += 1

        # 3. 重点：账号维度聚合统计
        # 根据 USERID 分组，统计消息数和唯一 IDSTR 数
        acc_df = df.groupby('USERID').agg({
            'USERNAME': 'first',
            'platform': 'first',
            'MESSAGE_ID': 'count',
            'IDSTR': 'nunique'
        }).reset_index()

        # 转换为列表字典，并确保数值是原生 int (解决 int64 报错)
        accounts_stats = []
        for _, row in acc_df.iterrows():
            accounts_stats.append({
                "userid": str(row['USERID']),
                "username": str(row['USERNAME']),
                "platform": str(row['platform']),
                "msg_count": int(row['MESSAGE_ID']),
                "work_count": int(row['IDSTR'])
            })

        # 4. 其他数据准备
        platform_dist = df['platform'].value_counts().to_dict()
        heatmap_df = df[df['month_str'] == target_month]
        heatmap_data = heatmap_df.groupby(
            'day_str').size().reset_index().values.tolist()

        df_latest = df.sort_values('DATE_TIME', ascending=False).head(100)
        messages_list = process_messages_df(df_latest)

        return jsonify({
            "status": "success",
            "stats": {
                "total": total_msgs,
                "works": total_works,
                "video": video_cnt,
                "image": image_cnt,
                "platforms": platform_dist
            },
            "info": {
                "accounts_stats": accounts_stats,  # 新增聚合统计
                "current_month": target_month,
                "total_pages": total_pages
            },
            "heatmap": heatmap_data,
            "messages": messages_list,
            "total_pages": total_pages
        })
    except Exception as e:
        return jsonify({"status": "error", "msg": str(e)})
    finally:
        conn.close()


@user_report_bp.route('/api/user/messages')
def api_user_messages():
    """请求用户消息明细 (在 Python 层处理日期过滤和分页)"""
    identity = request.args.get('identity')
    page = int(request.args.get('page', 1))
    date_filter = request.args.get('date')  # 格式 YYYY-MM-DD
    per_page = 100
    offset = (page - 1) * per_page
    conn = pymysql.connect(**DB_CONFIG)
    try:
        # 1. 一次性查出该用户的所有数据 (userid 和 username 建议在数据库里有索引)
        # 注意：这里只根据用户标识过滤，不在数据库层做复杂的日期运算
        sql = "SELECT * FROM messages WHERE (USERID = %s OR USERNAME = %s) ORDER BY DATE_TIME DESC"
        if identity == 'favorite':
            sql = "SELECT * FROM messages WHERE USERID not in (select userid from user) ORDER BY DATE_TIME DESC"
            df = pd.read_sql(sql, conn)
        else:
            df = pd.read_sql(sql, conn, params=[identity, identity])
        if df.empty:
            return jsonify({
                "status": "success",
                "messages": [],
                "total_pages": 0,
                "total_count": 0,
                "current_date": date_filter
            })

        # 2. 在 Python 层处理时区和日期转换
        # 将原始日期转换为 pandas 时间对象并 +8 小时
        df['DATE_TIME_LOCAL'] = pd.to_datetime(
            df['DATE_TIME']) + datetime.timedelta(hours=8)

        # 3. 如果有日期过滤，在内存中筛选
        if date_filter:
            # 提取日期字符串进行匹配
            df = df[df['DATE_TIME_LOCAL'].dt.strftime(
                '%Y-%m-%d') == date_filter]

        # 4. 计算总数和总页数 (使用 int() 确保非 numpy 类型)
        total_count = int(len(df))
        total_pages = int((total_count + per_page - 1) // per_page)

        # 5. 分页截取 (Slice)
        df_page = df.iloc[offset: offset + per_page]

        # 6. 处理展示格式 (复用你之前的处理函数)
        formatted_messages = process_messages_df(df_page)

        return jsonify({
            "status": "success",
            "messages": formatted_messages,
            "total_pages": total_pages,
            "total_count": total_count,
            "current_date": date_filter
        })
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"status": "error", "msg": str(e)})
    finally:
        conn.close()


@user_report_bp.route('/api/user/heatmap')
def api_user_message_relitu():
    """请求用户热力图 (按月统计)"""
    identity = request.args.get('identity')
    target_month = request.args.get('month')  # YYYY-MM

    conn = pymysql.connect(**DB_CONFIG)
    try:
        sql = "SELECT * FROM messages WHERE (USERID = %s OR USERNAME = %s) ORDER BY DATE_TIME DESC"
        if identity == 'favorite':
            sql = "SELECT * FROM messages WHERE USERID not in (select userid from user) ORDER BY DATE_TIME DESC"
            df = pd.read_sql(sql, conn)
        else:
            df = pd.read_sql(sql, conn, params=[identity, identity])
        df['local_time'] = pd.to_datetime(
            df['DATE_TIME']) + datetime.timedelta(hours=8)
        df['day_str'] = df['local_time'].dt.strftime('%Y-%m-%d')
        df['month_str'] = df['local_time'].dt.strftime('%Y-%m')

        heatmap_df = df[df['month_str'] == target_month]
        heatmap_data = heatmap_df.groupby(
            'day_str').size().reset_index().values.tolist()

        return jsonify({
            "status": "success",
            "month": target_month,
            "data": heatmap_data
        })
    finally:
        conn.close()
