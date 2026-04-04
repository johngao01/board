import pymysql
import datetime
import time
from flask import Blueprint, request, jsonify
from config import DB_JUHE

juhe_bp = Blueprint('juhe', __name__)

CITY_CODE_MAP = {}


def init_city_cache():
    """预加载城市代码映射，减少接口请求时的重复查询。"""
    print("正在加载城市代码缓存...")
    t0 = time.time()
    conn = pymysql.connect(**DB_JUHE)
    try:
        cur = conn.cursor()
        cur.execute("SELECT code, city FROM district_codes")
        rows = cur.fetchall()
        for r in rows:
            if r[0] and r[1]:
                CITY_CODE_MAP[r[0]] = r[1]
        print(f"城市代码加载完成，共 {len(CITY_CODE_MAP)} 条。耗时: {time.time() - t0:.4f}s")
    except Exception as e:
        print(f"加载城市代码失败: {e}")
    finally:
        conn.close()


def calculate_trend(curr, prev):
    """根据当前值和前一日值计算百分比趋势。"""
    if not prev or prev == 0:
        return 0
    return round(((curr - prev) / prev) * 100, 1)


# ==========================================
#               核心接口逻辑
# ==========================================


@juhe_bp.route('/api/juhe/stats')
def api_juhe_stats():
    """返回聚合库首页的总体统计、来源分布和城市分布。"""
    # 开始总计时
    t_start = time.time()
    conn = None
    try:
        date_str = request.args.get(
            'date', datetime.datetime.now().strftime('%Y-%m-%d'))

        # 1. 建立数据库连接
        t0 = time.time()
        conn = pymysql.connect(**DB_JUHE)
        cur = conn.cursor()
        t_conn = time.time()
        print(f"[{date_str} Stats] DB连接建立: {t_conn - t0:.4f}s")

        # 时间范围
        today_start = f"{date_str} 00:00:00"
        today_end = f"{date_str} 23:59:59"

        t_date = datetime.datetime.strptime(date_str, '%Y-%m-%d')
        p_date = t_date - datetime.timedelta(days=1)
        prev_start = p_date.strftime('%Y-%m-%d 00:00:00')
        prev_end = p_date.strftime('%Y-%m-%d 23:59:59')

        # --- A. 实时KPI (今日/昨日) ---
        # 理论极快：命中 CREATETIME 索引
        t_kpi_rt_start = time.time()
        sql_time_range = "SELECT COUNT(*), SUM(CASE WHEN VAILD > 0 THEN 1 ELSE 0 END) FROM juhe WHERE CREATETIME >= %s AND CREATETIME <= %s"

        cur.execute(sql_time_range, (today_start, today_end))
        res_today = cur.fetchone()
        today_new = res_today[0] or 0
        today_valid_new = int(res_today[1] or 0)

        cur.execute(sql_time_range, (prev_start, prev_end))
        res_prev = cur.fetchone()
        prev_new = res_prev[0] or 0
        prev_valid_new = int(res_prev[1] or 0)
        print(f"[{date_str} Stats] KPI(今日/昨日): {time.time() - t_kpi_rt_start:.4f}s")

        # --- B. 总量KPI (全表统计) ---
        # 理论较慢：全表扫描 17w 行
        t_total_start = time.time()
        cur.execute(
            "SELECT COUNT(*), SUM(CASE WHEN VAILD > 0 THEN 1 ELSE 0 END), SUM(CASE WHEN VAILD < 0 THEN 1 ELSE 0 END) FROM juhe")
        res_total = cur.fetchone()
        total_all = res_total[0] or 0
        total_valid = int(res_total[1] or 0)
        total_invalid = int(res_total[2] or 0)
        print(f"[{date_str} Stats] KPI(总量-全表扫): {time.time() - t_total_start:.4f}s")

        valid_rate = round((total_valid / total_all * 100),
                           2) if total_all > 0 else 0

        # --- C. 来源分布 (全表聚合) ---
        # 理论中等：全表 GROUP BY，如果有 idx_sourced 索引会快
        t_source_start = time.time()
        cur.execute(
            "SELECT SOURCED, COUNT(*) as cnt, SUM(CASE WHEN VAILD > 0 THEN 1 ELSE 0 END) FROM juhe GROUP BY SOURCED ORDER BY cnt DESC LIMIT 8")
        source_res = cur.fetchall()
        source_data = []
        for r in source_res:
            t, v = r[1], int(r[2] or 0)
            rate = round((v / t * 100), 1) if t > 0 else 0
            source_data.append(
                {"name": r[0], "value": t, "valid_count": v, "valid_rate": rate})
        print(f"[{date_str} Stats] 来源分布(Top8): {time.time() - t_source_start:.4f}s")

        # --- D. 热门城市 (全表聚合 + Python处理) ---
        # 理论中等：全表 GROUP BY CITY
        t_city_start = time.time()
        cur.execute(
            "SELECT CITY, COUNT(*) as cnt, SUM(CASE WHEN VAILD > 0 THEN 1 ELSE 0 END) FROM juhe WHERE CITY != '' GROUP BY CITY ORDER BY cnt DESC LIMIT 30")
        raw_city = cur.fetchall()

        city_agg = {}
        for item in raw_city:
            code, total, valid = item[0], item[1], int(item[2] or 0)
            city_name = CITY_CODE_MAP.get(code)
            if city_name:
                if city_name not in city_agg:
                    city_agg[city_name] = {'t': 0, 'v': 0}
                city_agg[city_name]['t'] += total
                city_agg[city_name]['v'] += valid

        sorted_cities = sorted(
            city_agg.items(), key=lambda x: x[1]['t'], reverse=True)[:10]
        chart_city = []
        for name, stats in sorted_cities:
            t, v = stats['t'], stats['v']
            r = round((v / t * 100), 1) if t > 0 else 0
            chart_city.append(
                {"name": name, "total": t, "valid": v, "rate": r})
        print(
            f"[{date_str} Stats] 热门城市(Top30+Map): {time.time() - t_city_start:.4f}s")

        print(f"[{date_str} Stats] >>> 接口总耗时: {time.time() - t_start:.4f}s <<<")

        return jsonify({
            "status": "success",
            "kpi": {
                "total_str": f"{total_valid} / {total_all}", "rate": valid_rate, "invalid": total_invalid,
                "today_new": today_new, "trend_new": calculate_trend(today_new, prev_new), "prev_new": prev_new,
                "today_valid_new": today_valid_new, "trend_valid_new": calculate_trend(today_valid_new, prev_valid_new),
                "prev_valid_new": prev_valid_new
            },
            "chart_source": source_data, "chart_city": chart_city
        })

    except Exception as e:
        print(f"Stats Error: {e}")
        return jsonify({"status": "error", "msg": str(e)})
    finally:
        if conn:
            conn.close()


@juhe_bp.route('/api/juhe/shanghai')
def api_juhe_shanghai():
    """返回上海区域的聚合统计、30 天趋势和近 7 天平台分布。"""
    t_start = time.time()
    conn = None
    try:
        date_str = request.args.get(
            'date', datetime.datetime.now().strftime('%Y-%m-%d'))

        t0 = time.time()
        conn = pymysql.connect(**DB_JUHE)
        cur = conn.cursor()
        print(f"[{date_str} SH] DB连接建立: {time.time() - t0:.4f}s")

        # --- 1. 上海全平台分布 ---
        # 理论极快：命中 idx_juhe_city 范围索引
        t_dist_start = time.time()
        cur.execute("""
                    SELECT SOURCED, COUNT(*) as cnt, SUM(CASE WHEN VAILD > 0 THEN 1 ELSE 0 END), MAX(CREATETIME)
                    FROM juhe
                    WHERE CITY >= '310000'
                      AND CITY <= '319999'
                    GROUP BY SOURCED
                    ORDER BY cnt DESC
                    """)
        dist_res = cur.fetchall()

        sh_breakdown = []
        total_sh = 0
        valid_sh = 0
        for row in dist_res:
            t, v, latest = row[1], int(row[2] or 0), row[3]
            total_sh += t
            valid_sh += v
            rate = round((v / t * 100), 1) if t > 0 else 0
            l_date = latest.strftime('%m-%d %H:%M') if latest else '-'
            sh_breakdown.append({
                "name": row[0], "value": t,
                "valid_count": v, "valid_rate": rate, "latest_date": l_date
            })
        print(f"[{date_str} SH] 上海平台分布: {time.time() - t_dist_start:.4f}s")

        # --- 2. 30天趋势 ---
        # 理论最慢：两个 SQL 都需要处理 30 天的数据范围
        t_trend_start = time.time()
        target_date = datetime.datetime.strptime(date_str, '%Y-%m-%d')
        end_dt = target_date + datetime.timedelta(days=1)
        start_dt = end_dt - datetime.timedelta(days=30)
        start_str = start_dt.strftime('%Y-%m-%d 00:00:00')
        end_str = end_dt.strftime('%Y-%m-%d 00:00:00')

        # SQL A: 全网趋势 (CREATETIME Range)
        t_a = time.time()
        cur.execute(
            "SELECT DATE_FORMAT(CREATETIME, '%%Y-%%m-%%d') as d, COUNT(*) FROM juhe WHERE CREATETIME >= %s AND CREATETIME < %s GROUP BY d",
            (start_str, end_str))
        res_all_raw = cur.fetchall()
        print(f"[{date_str} SH] 趋势-全网: {time.time() - t_a:.4f}s")

        # SQL B: 上海趋势 (CREATETIME Range + CITY Filter)
        t_b = time.time()
        cur.execute(
            "SELECT DATE_FORMAT(CREATETIME, '%%Y-%%m-%%d') as d, COUNT(*) FROM juhe WHERE CREATETIME >= %s AND CREATETIME < %s AND CITY >= '310000' AND CITY <= '319999' GROUP BY d",
            (start_str, end_str))
        res_sh_raw = cur.fetchall()
        print(f"[{date_str} SH] 趋势-上海: {time.time() - t_b:.4f}s")

        res_all = {r[0]: r[1] for r in res_all_raw}
        res_sh = {r[0]: r[1] for r in res_sh_raw}

        history_dates = []
        vals_sh = []
        vals_all = []
        curr = start_dt
        while curr < end_dt:
            d_s = curr.strftime('%Y-%m-%d')
            history_dates.append(d_s)
            vals_all.append(res_all.get(d_s, 0))
            vals_sh.append(res_sh.get(d_s, 0))
            curr += datetime.timedelta(days=1)

        # --- 3. 上海近7天平台分布 ---
        t_platform_start = time.time()
        start_7_dt = end_dt - datetime.timedelta(days=7)
        start_7_str = start_7_dt.strftime('%Y-%m-%d 00:00:00')

        cur.execute(
            """
            SELECT DATE_FORMAT(CREATETIME, '%%Y-%%m-%%d') as d, SOURCED, COUNT(*) as cnt
            FROM juhe
            WHERE CREATETIME >= %s
              AND CREATETIME < %s
              AND CITY >= '310000'
              AND CITY <= '319999'
            GROUP BY d, SOURCED
            ORDER BY d ASC, cnt DESC
            """,
            (start_7_str, end_str)
        )
        res_platform_7_raw = cur.fetchall()
        print(f"[{date_str} SH] 近7天平台分布: {time.time() - t_platform_start:.4f}s")

        platform_totals = {}
        daily_platform_map = {}
        for row in res_platform_7_raw:
            day_key, platform_name, count = row[0], row[1] or '未知来源', int(row[2] or 0)
            platform_totals[platform_name] = platform_totals.get(platform_name, 0) + count
            if day_key not in daily_platform_map:
                daily_platform_map[day_key] = {}
            daily_platform_map[day_key][platform_name] = count

        top_platforms = [
            item[0]
            for item in sorted(platform_totals.items(), key=lambda x: x[1], reverse=True)[:6]
        ]

        dates_7 = []
        curr_7 = start_7_dt
        while curr_7 < end_dt:
            dates_7.append(curr_7.strftime('%Y-%m-%d'))
            curr_7 += datetime.timedelta(days=1)

        platform_series = []
        other_series = [0] * len(dates_7)
        for platform_name in top_platforms:
            values = []
            for idx, day_key in enumerate(dates_7):
                day_values = daily_platform_map.get(day_key, {})
                value = int(day_values.get(platform_name, 0))
                values.append(value)
            platform_series.append({
                "name": platform_name,
                "values": values
            })

        if platform_totals:
            for idx, day_key in enumerate(dates_7):
                day_values = daily_platform_map.get(day_key, {})
                other_series[idx] = sum(
                    count for platform_name, count in day_values.items() if platform_name not in top_platforms
                )

            if any(other_series):
                platform_series.append({
                    "name": "其他",
                    "values": other_series
                })

        print(f"[{date_str} SH] >>> 接口总耗时: {time.time() - t_start:.4f}s <<<")

        return jsonify({
            "total": total_sh, "valid": valid_sh,
            "sh_breakdown": sh_breakdown,
            "history": {"dates": history_dates, "sh_vals": vals_sh, "all_vals": vals_all},
            "platform_history_7d": {"dates": dates_7, "series": platform_series}
        })

    except Exception as e:
        print(f"SH API Error: {e}")
        return jsonify({"error": str(e)})
    finally:
        if conn:
            conn.close()
