"""408 学习助手 v1 后端：FastAPI + SQLite。"""
from __future__ import annotations

import random
import re
import sqlite3
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .catalog import CAUSES, get_catalog, load_catalog, sync_catalog
from .db import BASE_DIR, UPLOAD_DIR, get_conn, init_db

STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_IMAGE_BYTES = 15 * 1024 * 1024
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    conn = get_conn()
    try:
        count = conn.execute("SELECT COUNT(*) FROM chapters").fetchone()[0]
        if count == 0:
            sync_catalog(conn, load_catalog())
    finally:
        conn.close()
    yield


app = FastAPI(title="408 学习助手", version="1.0.0", lifespan=lifespan)


def db():
    conn = get_conn()
    try:
        yield conn
    finally:
        conn.close()


class QuestionPatch(BaseModel):
    chapter_id: int | None = None
    section_id: int | None = None
    cause: str | None = None


class ReviewIn(BaseModel):
    result: Literal["mastered", "wrong"]


def fetch_question(conn: sqlite3.Connection, question_id: int) -> dict | None:
    row = conn.execute(
        """SELECT q.*, c.title AS chapter_title, s.title AS section_title
           FROM questions q
           JOIN chapters c ON c.id = q.chapter_id
           LEFT JOIN chapters s ON s.id = q.section_id
           WHERE q.id = ?""",
        (question_id,),
    ).fetchone()
    return dict(row) if row else None


def serialize_question(row: dict) -> dict:
    item = dict(row)
    image_path = item.get("image_path")
    item["image_url"] = f"/{image_path}" if image_path else None
    return item


def validate_taxonomy(
    conn: sqlite3.Connection, subject: str, chapter_id: int, section_id: int | None
) -> None:
    chapter = conn.execute(
        "SELECT * FROM chapters WHERE id = ? AND level = 1 AND active = 1",
        (chapter_id,),
    ).fetchone()
    if not chapter:
        raise HTTPException(status_code=400, detail="所选章不存在或已停用")
    if chapter["subject"] != subject:
        raise HTTPException(status_code=400, detail="科目与所选章不一致")
    if section_id:
        section = conn.execute(
            "SELECT * FROM chapters WHERE id = ? AND level = 2 AND active = 1",
            (section_id,),
        ).fetchone()
        if not section or section["parent_id"] != chapter_id:
            raise HTTPException(status_code=400, detail="所选节不属于该章")


def save_image(upload: UploadFile) -> str | None:
    if not upload or not upload.filename:
        return None
    content_type = (upload.content_type or "").lower()
    ext_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/heic": ".heic",
        "image/heif": ".heif",
    }
    suffix = Path(upload.filename).suffix.lower()
    suffix_map = {".jpeg": ".jpg", ".jpe": ".jpg"}
    suffix = suffix_map.get(suffix, suffix)
    ext = ext_map.get(content_type)
    if not ext:
        if suffix not in {".jpg", ".png", ".webp", ".gif", ".heic", ".heif"}:
            raise HTTPException(status_code=400, detail="仅支持 jpg / png / webp / gif 图片")
        ext = suffix
    data = upload.file.read()
    if not data:
        return None
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="图片超过 15MB，请压缩后再上传")
    name = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / name).write_bytes(data)
    return f"uploads/{name}"


@app.get("/api/bootstrap")
def bootstrap(conn: sqlite3.Connection = Depends(db)):
    return get_catalog(conn)


@app.get("/api/questions")
def list_questions(
    subject: str | None = None,
    chapter_id: int | None = None,
    cause: str | None = None,
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    q: str | None = None,
    limit: int = 200,
    conn: sqlite3.Connection = Depends(db),
):
    where: list[str] = []
    params: list = []
    if subject:
        where.append("q.subject = ?")
        params.append(subject)
    if chapter_id:
        where.append("q.chapter_id = ?")
        params.append(chapter_id)
    if cause:
        where.append("q.cause = ?")
        params.append(cause)
    if status in ("wrong", "mastered"):
        where.append("q.status = ?")
        params.append(status)
    if date_from and DATE_RE.match(date_from):
        where.append("q.created_at >= ?")
        params.append(f"{date_from} 00:00:00")
    if date_to and DATE_RE.match(date_to):
        where.append("q.created_at <= ?")
        params.append(f"{date_to} 23:59:59")
    if q and q.strip():
        keyword = f"%{q.strip()}%"
        where.append(
            """(q.content LIKE ? OR q.source LIKE ? OR q.my_answer LIKE ?
                OR q.correct_answer LIKE ? OR c.title LIKE ? OR s.title LIKE ?)"""
        )
        params.extend([keyword] * 6)

    sql = """SELECT q.*, c.title AS chapter_title, s.title AS section_title
             FROM questions q
             JOIN chapters c ON c.id = q.chapter_id
             LEFT JOIN chapters s ON s.id = q.section_id"""
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY q.created_at DESC, q.id DESC LIMIT ?"
    params.append(max(1, min(limit, 500)))
    items = [serialize_question(dict(row)) for row in conn.execute(sql, params)]
    return {"items": items, "count": len(items)}


@app.get("/api/questions/{question_id}")
def get_question(question_id: int, conn: sqlite3.Connection = Depends(db)):
    item = fetch_question(conn, question_id)
    if not item:
        raise HTTPException(status_code=404, detail="错题不存在")
    return serialize_question(item)


@app.post("/api/questions", status_code=201)
def create_question(
    subject: str = Form(...),
    chapter_id: int = Form(...),
    cause: str = Form(...),
    section_id: int | None = Form(None),
    content: str = Form(""),
    source: str = Form(""),
    my_answer: str = Form(""),
    correct_answer: str = Form(""),
    image: UploadFile | None = File(None),
    conn: sqlite3.Connection = Depends(db),
):
    subject = subject.strip()
    content = content.strip()
    source = source.strip()
    my_answer = my_answer.strip()
    correct_answer = correct_answer.strip()
    validate_taxonomy(conn, subject, chapter_id, section_id)
    if cause not in CAUSES:
        raise HTTPException(status_code=400, detail="请选择有效的错因标签")
    if not content and not (image and image.filename):
        raise HTTPException(status_code=400, detail="请填写题目文字或上传题目照片")

    image_path = save_image(image) if image else None
    stamp = now_str()
    cursor = conn.execute(
        """INSERT INTO questions
           (subject, chapter_id, section_id, cause, content, image_path, source,
            my_answer, correct_answer, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'wrong', ?, ?)""",
        (
            subject,
            chapter_id,
            section_id,
            cause,
            content,
            image_path,
            source,
            my_answer,
            correct_answer,
            stamp,
            stamp,
        ),
    )
    question_id = cursor.lastrowid
    conn.commit()
    item = fetch_question(conn, question_id)
    return serialize_question(item)


@app.patch("/api/questions/{question_id}")
def update_question(
    question_id: int,
    payload: QuestionPatch,
    conn: sqlite3.Connection = Depends(db),
):
    current = fetch_question(conn, question_id)
    if not current:
        raise HTTPException(status_code=404, detail="错题不存在")

    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        return serialize_question(current)

    chapter_id = fields.get("chapter_id", current["chapter_id"])
    if "section_id" in fields:
        section_id = fields["section_id"]
    elif "chapter_id" in fields:
        section_id = None
    else:
        section_id = current["section_id"]
    cause = fields.get("cause", current["cause"])

    validate_taxonomy(conn, current["subject"], chapter_id, section_id)
    if cause not in CAUSES:
        raise HTTPException(status_code=400, detail="请选择有效的错因标签")

    conn.execute(
        """UPDATE questions SET chapter_id=?, section_id=?, cause=?, updated_at=?
           WHERE id=?""",
        (chapter_id, section_id, cause, now_str(), question_id),
    )
    conn.commit()
    item = fetch_question(conn, question_id)
    return serialize_question(item)


def chapter_stats(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """SELECT c.id AS chapter_id, c.subject, c.title AS chapter, c.weight,
                  c.subject_order, c.sort_order,
                  COUNT(q.id) AS total,
                  COALESCE(SUM(CASE WHEN q.status = 'wrong' THEN 1 ELSE 0 END), 0) AS wrong,
                  MAX(q.last_review_at) AS last_review_at
           FROM chapters c
           LEFT JOIN questions q ON q.chapter_id = c.id
           WHERE c.level = 1 AND c.active = 1
           GROUP BY c.id
           ORDER BY c.subject_order, c.sort_order, c.id"""
    ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        total = item["total"]
        wrong = item["wrong"]
        item["weight"] = float(item["weight"])
        item["error_rate"] = round(wrong / total, 2) if total else None
        item["mastery"] = round((total - wrong) / total, 2) if total else None
        item["gap_score"] = round(item["weight"] * wrong / total, 2) if total else 0.0
        result.append(item)
    return result


@app.get("/api/overview")
def overview(conn: sqlite3.Connection = Depends(db)):
    today = datetime.now().strftime("%Y-%m-%d")
    totals = conn.execute(
        """SELECT COUNT(*) AS total,
                  COALESCE(SUM(CASE WHEN status = 'wrong' THEN 1 ELSE 0 END), 0) AS wrong,
                  COALESCE(SUM(CASE WHEN status = 'mastered' THEN 1 ELSE 0 END), 0) AS mastered,
                  COALESCE(SUM(CASE WHEN substr(created_at, 1, 10) = ? THEN 1 ELSE 0 END), 0) AS today_new
           FROM questions""",
        (today,),
    ).fetchone()

    stats = chapter_stats(conn)
    priority = sorted(
        [s for s in stats if s["total"] > 0 and s["wrong"] > 0],
        key=lambda s: (-s["gap_score"], -s["wrong"], -s["weight"]),
    )[:3]

    subject_order: list[str] = []
    subject_groups: dict[str, str] = {}
    for item in stats:
        if item["subject"] not in subject_order:
            subject_order.append(item["subject"])

    subject_stats = []
    for name in subject_order:
        items = [s for s in stats if s["subject"] == name]
        total = sum(s["total"] for s in items)
        wrong = sum(s["wrong"] for s in items)
        subject_stats.append(
            {
                "subject": name,
                "total": total,
                "wrong": wrong,
                "mastery": round((total - wrong) / total * 100) if total else None,
                "chapters": len(items),
            }
        )

    heatmap_cells = []
    max_chapters = 0
    for y, name in enumerate(subject_order):
        items = [s for s in stats if s["subject"] == name]
        max_chapters = max(max_chapters, len(items))
        for x, s in enumerate(items):
            heatmap_cells.append(
                {
                    "value": [x, y, round(s["mastery"] * 100) if s["total"] else -1],
                    "chapter": s["chapter"],
                    "subject": name,
                    "total": s["total"],
                    "wrong": s["wrong"],
                    "last_review_at": s["last_review_at"],
                }
            )

    return {
        "today_new": totals["today_new"],
        "total": totals["total"],
        "wrong": totals["wrong"],
        "mastered": totals["mastered"],
        "priority": [
            {
                "chapter_id": s["chapter_id"],
                "subject": s["subject"],
                "chapter": s["chapter"],
                "weight": s["weight"],
                "total": s["total"],
                "wrong": s["wrong"],
                "error_rate": s["error_rate"],
                "gap_score": s["gap_score"],
                "last_review_at": s["last_review_at"],
            }
            for s in priority
        ],
        "subject_stats": subject_stats,
        "heatmap": {
            "subjects": subject_order,
            "max_chapters": max_chapters,
            "cells": heatmap_cells,
        },
    }


@app.get("/api/mastery")
def mastery(conn: sqlite3.Connection = Depends(db)):
    stats = chapter_stats(conn)
    subjects = []
    for name in dict.fromkeys(s["subject"] for s in stats):
        items = [s for s in stats if s["subject"] == name]
        total = sum(s["total"] for s in items)
        wrong = sum(s["wrong"] for s in items)
        subjects.append(
            {
                "subject": name,
                "total_chapters": len(items),
                "total": total,
                "wrong": wrong,
                "mastery": round((total - wrong) / total * 100) if total else None,
                "chapters": [
                    {
                        "chapter_id": s["chapter_id"],
                        "chapter": s["chapter"],
                        "weight": s["weight"],
                        "total": s["total"],
                        "wrong": s["wrong"],
                        "error_rate": s["error_rate"],
                        "mastery": s["mastery"],
                        "last_review_at": s["last_review_at"],
                    }
                    for s in items
                ],
            }
        )
    return {"subjects": subjects}


@app.get("/api/review/questions")
def review_questions(
    subject: str | None = None,
    chapter_id: int | None = None,
    limit: int = 10,
    conn: sqlite3.Connection = Depends(db),
):
    where = ["q.status = 'wrong'"]
    params: list = []
    if subject:
        where.append("q.subject = ?")
        params.append(subject)
    if chapter_id:
        where.append("q.chapter_id = ?")
        params.append(chapter_id)
    params.append(max(1, min(limit, 50)))
    rows = conn.execute(
        f"""SELECT q.*, c.title AS chapter_title, s.title AS section_title
            FROM questions q
            JOIN chapters c ON c.id = q.chapter_id
            LEFT JOIN chapters s ON s.id = q.section_id
            WHERE {' AND '.join(where)}
            ORDER BY RANDOM() LIMIT ?""",
        params,
    ).fetchall()
    return {"items": [serialize_question(dict(row)) for row in rows]}


@app.post("/api/questions/{question_id}/review")
def review_question(
    question_id: int,
    payload: ReviewIn,
    conn: sqlite3.Connection = Depends(db),
):
    current = fetch_question(conn, question_id)
    if not current:
        raise HTTPException(status_code=404, detail="错题不存在")
    stamp = now_str()
    status = "mastered" if payload.result == "mastered" else "wrong"
    conn.execute(
        """UPDATE questions
           SET status=?, review_count=review_count+1, last_review_at=?, last_review_result=?, updated_at=?
           WHERE id=?""",
        (status, stamp, payload.result, stamp, question_id),
    )
    conn.execute(
        "INSERT INTO review_events (question_id, result, reviewed_at) VALUES (?, ?, ?)",
        (question_id, payload.result, stamp),
    )
    conn.commit()
    item = fetch_question(conn, question_id)
    return serialize_question(item)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
