"""章节重导命令：python -m app.seed"""
from __future__ import annotations

from .catalog import load_catalog, sync_catalog
from .db import get_conn, init_db


def main() -> None:
    init_db()
    subjects = load_catalog()
    conn = get_conn()
    try:
        counts = sync_catalog(conn, subjects)
    finally:
        conn.close()
    total_chapters = sum(len(s.get("chapters") or []) for s in subjects)
    print(
        f"章节导入完成：新增章 {counts['chapters']} 个、新增节 {counts['sections']} 个，"
        f"停用 {counts['deactivated']} 个、删除 {counts['removed']} 个；"
        f"当前共 {len(subjects)} 科 / {total_chapters} 章。"
    )


if __name__ == "__main__":
    main()
