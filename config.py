from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"
ENV_FILE = BASE_DIR / ".env"


def load_env_file(path: Path = ENV_FILE) -> None:
    """从本地 .env 文件加载环境变量，但不覆盖已有系统环境变量。"""
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


load_env_file()


def get_env(key: str, default: str | None = None) -> str | None:
    """读取环境变量；当值为空时回退到默认值。"""
    value = os.getenv(key)
    if value is None or value == "":
        return default
    return value


def get_db_config(prefix: str, default_database: str) -> dict[str, str]:
    """按统一前缀读取数据库连接配置。"""
    host = get_env(f"{prefix}_HOST", get_env("DB_HOST", "127.0.0.1"))
    user = get_env(f"{prefix}_USER", get_env("DB_USER", "root"))
    password = get_env(f"{prefix}_PASSWORD", get_env("DB_PASSWORD", ""))
    database = get_env(f"{prefix}_NAME", default_database)
    charset = get_env(f"{prefix}_CHARSET", "utf8mb4")

    return {
        "host": host or "127.0.0.1",
        "user": user or "root",
        "password": password or "",
        "database": database or default_database,
        "charset": charset or "utf8mb4",
    }


MESSAGE_DELETE_LOG_TAIL_LINES = int(get_env("MESSAGE_DELETE_LOG_TAIL_LINES", "120") or "120")
MESSAGE_DELETE_DOWNLOAD_ROOT = Path(
    get_env("MESSAGE_DELETE_DOWNLOAD_ROOT", get_env("DOWNLOAD_ROOT", "/root/download"))
    or "/root/download"
)

DB_NICEBOT = get_db_config("NICEBOT_DB", "nicebot")
DB_TIKTOK = get_db_config("TIKTOK_DB", "tiktok_bot")
DB_JUHE = get_db_config("JUHE_DB", "juhe")
