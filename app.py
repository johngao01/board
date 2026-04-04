from flask import Flask, jsonify, send_from_directory

from config import FRONTEND_DIST_DIR
from dashboard import dashboard_bp
from juhe import init_city_cache, juhe_bp
from message_manage import message_delete_bp
from tiktok import tiktok_bp
from user import user_bp


def create_app():
    """创建并配置当前项目的 Flask 应用实例。"""
    app = Flask(__name__, static_folder=None)

    app.register_blueprint(dashboard_bp)
    app.register_blueprint(juhe_bp)
    app.register_blueprint(tiktok_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(message_delete_bp)

    init_city_cache()

    def serve_spa_entry():
        """统一返回前端 SPA 入口页。"""
        return send_from_directory(FRONTEND_DIST_DIR, "index.html")

    @app.route("/user/<path:identity>")
    def user_report_entry(identity):
        """让用户详情页刷新时仍然回落到前端路由入口。"""
        return serve_spa_entry()

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def frontend_routes(path):
        """处理前端静态资源和 SPA 路由兜底。"""
        if path.startswith("api/"):
            return jsonify({"status": "error", "msg": "Not found"}), 404

        requested_path = FRONTEND_DIST_DIR / path
        if path and requested_path.exists() and requested_path.is_file():
            return send_from_directory(FRONTEND_DIST_DIR, path)

        return serve_spa_entry()

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, port=12345, host="0.0.0.0", threaded=True)
