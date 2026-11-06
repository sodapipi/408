"""章节目录的加载、校验与数据库同步。"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import yaml

from .db import BASE_DIR

CATALOG_PATH = BASE_DIR / "chapters.yaml"
CAUSES = ["概念不清", "计算失误", "审题错", "记不住", "方法不会"]


def load_catalog(path: Path | None = None) -> list[dict]:
    source = path or CATALOG_PATH
    with source.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    subjects = data.get("subjects") or []
    if not subjects:
        raise ValueError("chapters.yaml 中未找到 subjects 配置")

    names: set[str] = set()
    for subject in subjects:
        name = str(subject.get("name") or "").strip()
        if not name:
            raise ValueError("chapters.yaml 存在未命名的科目")
        if name in names:
            raise ValueError(f"科目重复：{name}")
        names.add(name)

        chapters = subject.get("chapters") or []
        if not chapters:
            raise ValueError(f"{name} 没有配置章节")
        total = sum(float(ch.get("weight") or 0) for ch in chapters)
        expected = float(subject.get("total_weight") or total)
        if abs(total - expected) > 0.01:
            raise ValueError(
                f"{name} 的章权重合计为 {total:g}，与 total_weight {expected:g} 不一致"
            )
        chapter_names: set[str] = set()
        for chapter in chapters:
            title = str(chapter.get("name") or "").strip()
            if not title:
                raise ValueError(f"{name} 存在未命名的章")
            if title in chapter_names:
                raise ValueError(f"{name} 的章重复：{title}")
            chapter_names.add(title)
            for section in chapter.get("sections") or []:
                if not str(section).strip():
                    raise ValueError(f"{name} / {title} 存在未命名的小节")
    return subjects


def sync_catalog(conn: sqlite3.Connection, subjects: list[dict]) -> dict:
    """按 YAML 重建/更新章节树，保留已有题目引用。"""
    seen: set[str] = set()
    counts = {"chapters": 0, "sections": 0, "deactivated": 0, "removed": 0}

    for subject_order, subject in enumerate(subjects):
        subject_name = subject["name"].strip()
        subject_group = str(subject.get("group") or "")
        chapters = subject.get("chapters") or []

        for chapter_order, chapter in enumerate(chapters):
            chapter_title = str(chapter["name"]).strip()
            chapter_path = f"{subject_name}/{chapter_title}"
            seen.add(chapter_path)
            row = conn.execute(
                "SELECT id FROM chapters WHERE path = ?", (chapter_path,)
            ).fetchone()
            if row:
                conn.execute(
                    """UPDATE chapters SET subject=?, subject_group=?, subject_order=?,
                       title=?, level=1, parent_id=NULL, weight=?, sort_order=?, active=1
                       WHERE id=?""",
                    (
                        subject_name,
                        subject_group,
                        subject_order,
                        chapter_title,
                        float(chapter.get("weight") or 0),
                        chapter_order,
                        row["id"],
                    ),
                )
                chapter_id = row["id"]
            else:
                cursor = conn.execute(
                    """INSERT INTO chapters
                       (path, subject, subject_group, subject_order, title, level, parent_id,
                        weight, sort_order, active)
                       VALUES (?, ?, ?, ?, ?, 1, NULL, ?, ?, 1)""",
                    (
                        chapter_path,
                        subject_name,
                        subject_group,
                        subject_order,
                        chapter_title,
                        float(chapter.get("weight") or 0),
                        chapter_order,
                    ),
                )
                chapter_id = cursor.lastrowid
                counts["chapters"] += 1

            for section_order, section in enumerate(chapter.get("sections") or []):
                section_title = str(section).strip()
                section_path = f"{chapter_path}/{section_title}"
                seen.add(section_path)
                row = conn.execute(
                    "SELECT id FROM chapters WHERE path = ?", (section_path,)
                ).fetchone()
                if row:
                    conn.execute(
                        """UPDATE chapters SET subject=?, subject_group=?, subject_order=?,
                           title=?, level=2, parent_id=?, weight=0, sort_order=?, active=1
                           WHERE id=?""",
                        (
                            subject_name,
                            subject_group,
                            subject_order,
                            section_title,
                            chapter_id,
                            section_order,
                            row["id"],
                        ),
                    )
                else:
                    conn.execute(
                        """INSERT INTO chapters
                           (path, subject, subject_group, subject_order, title, level, parent_id,
                            weight, sort_order, active)
                           VALUES (?, ?, ?, ?, ?, 2, ?, 0, ?, 1)""",
                        (
                            section_path,
                            subject_name,
                            subject_group,
                            subject_order,
                            section_title,
                            chapter_id,
                            section_order,
                        ),
                    )
                    counts["sections"] += 1

    # 文件里删掉的小节/章：没有题目引用就删除，有引用则停用（保留历史错题）
    rows = conn.execute(
        "SELECT id, path, level FROM chapters WHERE path NOT IN (%s) ORDER BY level DESC"
        % ",".join("?" for _ in seen),
        tuple(seen),
    ).fetchall()
    for row in rows:
        used = conn.execute(
            """SELECT 1 FROM questions WHERE chapter_id = ? OR section_id = ?
               LIMIT 1""",
            (row["id"], row["id"]),
        ).fetchone()
        if row["level"] == 1:
            has_children = conn.execute(
                "SELECT 1 FROM chapters WHERE parent_id = ? LIMIT 1", (row["id"],)
            ).fetchone()
            if has_children:
                used = True
        if used:
            conn.execute("UPDATE chapters SET active = 0 WHERE id = ?", (row["id"],))
            counts["deactivated"] += 1
        else:
            conn.execute("DELETE FROM chapters WHERE id = ?", (row["id"],))
            counts["removed"] += 1

    conn.commit()
    return counts


def get_catalog(conn: sqlite3.Connection) -> dict:
    rows = conn.execute(
        """SELECT id, subject, subject_group, subject_order, title, level, parent_id,
                  weight, sort_order
           FROM chapters WHERE active = 1
           ORDER BY subject_order, level, sort_order, id"""
    ).fetchall()

    subjects: list[dict] = []
    by_name: dict[str, dict] = {}
    for row in rows:
        if row["level"] != 1:
            continue
        subject = by_name.get(row["subject"])
        if subject is None:
            subject = {
                "name": row["subject"],
                "group": row["subject_group"],
                "total_weight": 0.0,
                "chapters": [],
            }
            by_name[row["subject"]] = subject
            subjects.append(subject)
        subject["total_weight"] += float(row["weight"])
        subject["chapters"].append(
            {
                "id": row["id"],
                "title": row["title"],
                "weight": float(row["weight"]),
                "sections": [],
            }
        )

    chapter_map = {
        s["id"]: s
        for subject in subjects
        for s in subject["chapters"]
    }
    for row in rows:
        if row["level"] != 2:
            continue
        chapter = chapter_map.get(row["parent_id"])
        if chapter is not None:
            chapter["sections"].append({"id": row["id"], "title": row["title"]})

    return {"subjects": subjects, "causes": CAUSES}
