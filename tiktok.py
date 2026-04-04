import datetime

import pymysql
from flask import Blueprint, jsonify, request

from config import DB_TIKTOK
from juhe import calculate_trend

tiktok_bp = Blueprint("tiktok", __name__)


def get_tiktok_metric(sql_template, date_str):
    """查询 TikTok 指标的当日值、环比趋势和前一日值。"""
    curr_date = datetime.datetime.strptime(date_str, "%Y-%m-%d")
    prev_date = curr_date - datetime.timedelta(days=1)
    conn = pymysql.connect(**DB_TIKTOK)
    try:
        cursor = conn.cursor()
        cursor.execute(
            sql_template,
            (date_str, (curr_date + datetime.timedelta(days=1)).strftime("%Y-%m-%d")),
        )
        val_curr = cursor.fetchone()[0]
        cursor.execute(sql_template, (prev_date.strftime("%Y-%m-%d"), date_str))
        val_prev = cursor.fetchone()[0]
        return val_curr, calculate_trend(val_curr, val_prev), val_prev
    finally:
        conn.close()


@tiktok_bp.route("/api/tiktok/scraped")
def tk_scraped():
    """返回 TikTok 抓取作品数。"""
    date_str = request.args.get("date")
    sql = "select count(*) from aweme where SCRAPY_AT >= %s AND SCRAPY_AT < %s"
    return jsonify(dict(zip(["val", "trend", "prev"], get_tiktok_metric(sql, date_str))))


@tiktok_bp.route("/api/tiktok/active")
def tk_active():
    """返回 TikTok 当日活跃聊天账号数。"""
    date_str = request.args.get("date")
    sql = "select count(distinct chat_id) from messages where DATE_TIME >= %s AND DATE_TIME < %s"
    return jsonify(dict(zip(["val", "trend", "prev"], get_tiktok_metric(sql, date_str))))


@tiktok_bp.route("/api/tiktok/new")
def tk_new():
    """返回 TikTok 当日新增用户数。"""
    date_str = request.args.get("date")
    sql = "select count(distinct chat_id) from users where created_at >= %s AND created_at < %s"
    return jsonify(dict(zip(["val", "trend", "prev"], get_tiktok_metric(sql, date_str))))
