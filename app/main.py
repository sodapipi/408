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

from .catalog import CAUSES, POLITICS_CAUSES, get_catalog, load_catalog, sync_catalog
from .db import BASE_DIR, UPLOAD_DIR, get_conn, init_db
from .ocr import recognize

STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_IMAGE_BYTES = 15 * 1024 * 1024
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
IMAGE_PATH_RE = re.compile(r"^uploads/[0-9a-f]{32}\.(jpg|png|webp|gif|heic|heif)$")


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


app = FastAPI(title="408 学习助手", version="1.1.0", lifespan=lifespan)


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
    content: str | None = None
    option_analysis: str | None = None
    exam_year: str | None = None


class ReviewIn(BaseModel):
    result: Literal["mastered", "wrong"]


class CardIn(BaseModel):
    chapter_id: int
    section_id: int | None = None
    title: str
    body: str = ""


class CardPatch(BaseModel):
    chapter_id: int | None = None
    section_id: int | None = None
    title: str | None = None
    body: str | None = None
    view_count: int | None = None
    self_rating: str | None = None


class CardViewIn(BaseModel):
    rating: str | None = None


class AffairIn(BaseModel):
    event_date: str
    title: str
    related_point: str = ""
    tags: str = ""
    note: str = ""


class AffairPatch(BaseModel):
    event_date: str | None = None
    title: str | None = None
    related_point: str | None = None
    tags: str | None = None
    note: str | None = None


class FrameworkIn(BaseModel):
    question_type: str
    template: str = ""
    keywords: str = ""


class FrameworkPatch(BaseModel):
    question_type: str | None = None
    template: str | None = None
    keywords: str | None = None


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


def existing_image_path(value: str | None) -> str | None:
    """校验 OCR 阶段已保存的图片路径，避免任意路径写入。"""
    value = (value or "").strip()
    if not value:
        return None
    if not IMAGE_PATH_RE.match(value):
        raise HTTPException(status_code=400, detail="图片路径无效，请重新上传")
    if not (BASE_DIR / value).is_file():
        raise HTTPException(status_code=400, detail="图片已丢失，请重新上传")
    return value


@app.get("/api/bootstrap")
def bootstrap(conn: sqlite3.Connection = Depends(db)):
    return get_catalog(conn)


@app.post("/api/ocr")
def ocr_upload(image: UploadFile = File(...)):
    """保存原图并做本地离线识别；识别失败也返回图片路径，仍可保存错题。"""
    image_path = save_image(image)
    if not image_path:
        raise HTTPException(status_code=400, detail="请选择一张题目照片")
    result = recognize(BASE_DIR / image_path)
    return {"image_path": image_path, "image_url": f"/{image_path}", **result}


@app.get("/api/questions")
def list_questions(
    subject: str | None = None,
    chapter_id: int | None = None,
    cause: str | None = None,
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    q: str | None = None,
    qtype: str | None = None,
    include_deleted: bool = False,
    limit: int = 200,
    conn: sqlite3.Connection = Depends(db),
):
    where: list[str] = []
    params: list = []
    if not include_deleted:
        where.append("q.deleted_at = ''")
    if qtype:
        where.append("q.qtype = ?")
        params.append(qtype)
    else:
        where.append("q.qtype != 'politics_choice'")
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
            """(q.content LIKE ? OR q.ocr_raw LIKE ? OR q.option_analysis LIKE ? OR q.source LIKE ?
                OR q.my_answer LIKE ? OR q.correct_answer LIKE ? OR c.title LIKE ? OR s.title LIKE ?)"""
        )
        params.extend([keyword] * 8)

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
    ocr_raw: str = Form(""),
    qtype: str = Form("regular"),
    option_analysis: str = Form(""),
    exam_year: str = Form(""),
    image_path: str = Form(""),
    source: str = Form(""),
    my_answer: str = Form(""),
    correct_answer: str = Form(""),
    image: UploadFile | None = File(None),
    conn: sqlite3.Connection = Depends(db),
):
    subject = subject.strip()
    content = content.strip()
    ocr_raw = ocr_raw.strip()
    qtype = qtype.strip() or "regular"
    option_analysis = option_analysis.strip()
    exam_year = exam_year.strip()
    source = source.strip()
    my_answer = my_answer.strip()
    correct_answer = correct_answer.strip()
    validate_taxonomy(conn, subject, chapter_id, section_id)
    if qtype not in ("regular", "politics_choice"):
        raise HTTPException(status_code=400, detail="题目类型无效")
    if qtype == "politics_choice":
        if subject != "政治":
            raise HTTPException(status_code=400, detail="政治选择题的科目必须是政治")
        if cause not in POLITICS_CAUSES:
            raise HTTPException(status_code=400, detail="请选择政治专用错因标签")
        if not option_analysis:
            raise HTTPException(status_code=400, detail="政治选择题必须填写错选项分析")
    elif cause not in CAUSES:
        raise HTTPException(status_code=400, detail="请选择有效的错因标签")

    if image and image.filename:
        stored_image = save_image(image)
    else:
        stored_image = existing_image_path(image_path)
    if not content and not stored_image:
        raise HTTPException(status_code=400, detail="请填写题目文字或上传题目照片")

    stamp = now_str()
    cursor = conn.execute(
        """INSERT INTO questions
           (subject, chapter_id, section_id, cause, content, ocr_raw, qtype, option_analysis,
            exam_year, image_path, source, my_answer, correct_answer, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'wrong', ?, ?)""",
        (
            subject,
            chapter_id,
            section_id,
            cause,
            content,
            ocr_raw,
            qtype,
            option_analysis,
            exam_year,
            stored_image,
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
    allowed = POLITICS_CAUSES if current["qtype"] == "politics_choice" else CAUSES
    if cause not in allowed:
        raise HTTPException(status_code=400, detail="请选择有效的错因标签")

    updates = ["chapter_id=?", "section_id=?", "cause=?", "updated_at=?"]
    values: list = [chapter_id, section_id, cause, now_str()]
    if fields.get("content") is not None:
        updates.append("content=?")
        values.append(str(fields["content"]).strip())
    if fields.get("option_analysis") is not None:
        analysis = str(fields["option_analysis"]).strip()
        if current["qtype"] == "politics_choice" and not analysis:
            raise HTTPException(status_code=400, detail="政治选择题必须填写错选项分析")
        updates.append("option_analysis=?")
        values.append(analysis)
    if fields.get("exam_year") is not None:
        updates.append("exam_year=?")
        values.append(str(fields["exam_year"]).strip())
    values.append(question_id)
    conn.execute(f"UPDATE questions SET {', '.join(updates)} WHERE id=?", values)
    conn.commit()
    item = fetch_question(conn, question_id)
    return serialize_question(item)


@app.delete("/api/questions/{question_id}")
def delete_question(question_id: int, conn: sqlite3.Connection = Depends(db)):
    current = fetch_question(conn, question_id)
    if not current:
        raise HTTPException(status_code=404, detail="错题不存在")
    stamp = now_str()
    conn.execute("UPDATE questions SET deleted_at = ?, updated_at = ? WHERE id = ?", (stamp, stamp, question_id))
    conn.commit()
    return serialize_question(fetch_question(conn, question_id))


@app.post("/api/questions/{question_id}/restore")
def restore_question(question_id: int, conn: sqlite3.Connection = Depends(db)):
    current = fetch_question(conn, question_id)
    if not current:
        raise HTTPException(status_code=404, detail="错题不存在")
    conn.execute("UPDATE questions SET deleted_at = '', updated_at = ? WHERE id = ?", (now_str(), question_id))
    conn.commit()
    return serialize_question(fetch_question(conn, question_id))


def chapter_stats(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """SELECT c.id AS chapter_id, c.subject, c.title AS chapter, c.weight,
                  c.subject_order, c.sort_order,
                  COUNT(q.id) AS total,
                  COALESCE(SUM(CASE WHEN q.status = 'wrong' THEN 1 ELSE 0 END), 0) AS wrong,
                  MAX(q.last_review_at) AS last_review_at
           FROM chapters c
           LEFT JOIN questions q ON q.chapter_id = c.id AND q.deleted_at = ''
           WHERE c.level = 1 AND c.active = 1 AND c.subject != '政治'
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
           FROM questions
           WHERE qtype != 'politics_choice' AND deleted_at = ''""",
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
    where = ["q.status = 'wrong'", "q.qtype != 'politics_choice'", "q.deleted_at = ''"]
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


@app.get("/api/politics/cards")
def list_cards(
    chapter_id: int | None = None,
    section_id: int | None = None,
    q: str | None = None,
    include_deleted: bool = False,
    limit: int = 300,
    conn: sqlite3.Connection = Depends(db),
):
    where: list[str] = []
    params: list = []
    if not include_deleted:
        where.append("k.deleted_at = ''")
    if chapter_id:
        where.append("k.chapter_id = ?")
        params.append(chapter_id)
    if section_id:
        where.append("k.section_id = ?")
        params.append(section_id)
    if q and q.strip():
        keyword = f"%{q.strip()}%"
        where.append("(k.title LIKE ? OR k.body LIKE ?)")
        params.extend([keyword, keyword])

    sql = """SELECT k.*, c.title AS chapter_title, s.title AS section_title
             FROM knowledge_cards k
             JOIN chapters c ON c.id = k.chapter_id
             LEFT JOIN chapters s ON s.id = k.section_id"""
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY c.sort_order, s.sort_order, k.id DESC LIMIT ?"
    params.append(max(1, min(limit, 500)))
    items = [dict(row) for row in conn.execute(sql, params)]
    return {"items": items, "count": len(items)}


@app.post("/api/politics/cards", status_code=201)
def create_card(payload: CardIn, conn: sqlite3.Connection = Depends(db)):
    title = payload.title.strip()
    body = payload.body.strip()
    if not title:
        raise HTTPException(status_code=400, detail="请填写考点名称")
    validate_taxonomy(conn, "政治", payload.chapter_id, payload.section_id)
    stamp = now_str()
    cursor = conn.execute(
        """INSERT INTO knowledge_cards (chapter_id, section_id, title, body, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (payload.chapter_id, payload.section_id, title, body, stamp, stamp),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM knowledge_cards WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return dict(row)


@app.patch("/api/politics/cards/{card_id}")
def update_card(card_id: int, payload: CardPatch, conn: sqlite3.Connection = Depends(db)):
    current = conn.execute("SELECT * FROM knowledge_cards WHERE id = ?", (card_id,)).fetchone()
    if not current:
        raise HTTPException(status_code=404, detail="知识点卡不存在")
    fields = payload.model_dump(exclude_unset=True)
    chapter_id = fields.get("chapter_id", current["chapter_id"])
    section_id = fields.get("section_id", current["section_id"]) if "section_id" in fields else current["section_id"]
    if "chapter_id" in fields and "section_id" not in fields:
        section_id = None
    validate_taxonomy(conn, "政治", chapter_id, section_id)
    title = (fields.get("title", current["title"]) or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="请填写考点名称")
    body = (fields.get("body", current["body"]) or "").strip()
    view_count = current["view_count"]
    if fields.get("view_count") is not None:
        view_count = max(0, int(fields["view_count"]))
    self_rating = fields.get("self_rating", current["self_rating"])
    if self_rating in ("", None):
        self_rating = None
    elif self_rating not in ("remembered", "forgotten"):
        raise HTTPException(status_code=400, detail="自评结果无效")
    conn.execute(
        """UPDATE knowledge_cards
           SET chapter_id=?, section_id=?, title=?, body=?, view_count=?, self_rating=?, updated_at=?
           WHERE id=?""",
        (chapter_id, section_id, title, body, view_count, self_rating, now_str(), card_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM knowledge_cards WHERE id = ?", (card_id,)).fetchone()
    return dict(row)


@app.delete("/api/politics/cards/{card_id}")
def delete_card(card_id: int, conn: sqlite3.Connection = Depends(db)):
    current = conn.execute("SELECT * FROM knowledge_cards WHERE id = ?", (card_id,)).fetchone()
    if not current:
        raise HTTPException(status_code=404, detail="知识点卡不存在")
    stamp = now_str()
    conn.execute(
        "UPDATE knowledge_cards SET deleted_at = ?, updated_at = ? WHERE id = ?",
        (stamp, stamp, card_id),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM knowledge_cards WHERE id = ?", (card_id,)).fetchone())


@app.post("/api/politics/cards/{card_id}/restore")
def restore_card(card_id: int, conn: sqlite3.Connection = Depends(db)):
    current = conn.execute("SELECT * FROM knowledge_cards WHERE id = ?", (card_id,)).fetchone()
    if not current:
        raise HTTPException(status_code=404, detail="知识点卡不存在")
    conn.execute(
        "UPDATE knowledge_cards SET deleted_at = '', updated_at = ? WHERE id = ?",
        (now_str(), card_id),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM knowledge_cards WHERE id = ?", (card_id,)).fetchone())


@app.post("/api/politics/cards/{card_id}/view")
def view_card(card_id: int, payload: CardViewIn, conn: sqlite3.Connection = Depends(db)):
    current = conn.execute("SELECT * FROM knowledge_cards WHERE id = ?", (card_id,)).fetchone()
    if not current:
        raise HTTPException(status_code=404, detail="知识点卡不存在")
    rating = payload.rating
    if rating not in (None, "", "remembered", "forgotten"):
        raise HTTPException(status_code=400, detail="自评结果无效")
    stamp = now_str()
    if rating:
        conn.execute(
            """UPDATE knowledge_cards
               SET view_count=view_count+1, last_viewed_at=?, self_rating=?, updated_at=?
               WHERE id=?""",
            (stamp, rating, stamp, card_id),
        )
    else:
        conn.execute(
            """UPDATE knowledge_cards
               SET view_count=view_count+1, last_viewed_at=?, updated_at=?
               WHERE id=?""",
            (stamp, stamp, card_id),
        )
    conn.commit()
    row = conn.execute("SELECT * FROM knowledge_cards WHERE id = ?", (card_id,)).fetchone()
    return dict(row)


@app.get("/api/politics/affairs")
def list_affairs(
    tag: str | None = None,
    point: str | None = None,
    q: str | None = None,
    include_deleted: bool = False,
    limit: int = 300,
    conn: sqlite3.Connection = Depends(db),
):
    where: list[str] = []
    params: list = []
    if not include_deleted:
        where.append("deleted_at = ''")
    if tag and tag.strip():
        where.append("tags LIKE ?")
        params.append(f"%{tag.strip()}%")
    if point and point.strip():
        where.append("related_point LIKE ?")
        params.append(f"%{point.strip()}%")
    if q and q.strip():
        keyword = f"%{q.strip()}%"
        where.append("(title LIKE ? OR note LIKE ? OR related_point LIKE ? OR tags LIKE ?)")
        params.extend([keyword] * 4)
    sql = "SELECT * FROM current_affairs"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY event_date DESC, id DESC LIMIT ?"
    params.append(max(1, min(limit, 500)))
    items = [dict(row) for row in conn.execute(sql, params)]
    return {"items": items, "count": len(items)}


@app.post("/api/politics/affairs", status_code=201)
def create_affair(payload: AffairIn, conn: sqlite3.Connection = Depends(db)):
    date_value = payload.event_date.strip()
    title = payload.title.strip()
    if not DATE_RE.match(date_value):
        raise HTTPException(status_code=400, detail="日期格式应为 YYYY-MM-DD")
    if not title:
        raise HTTPException(status_code=400, detail="请填写时政事件")
    stamp = now_str()
    cursor = conn.execute(
        """INSERT INTO current_affairs (event_date, title, related_point, tags, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            date_value,
            title,
            payload.related_point.strip(),
            payload.tags.strip(),
            payload.note.strip(),
            stamp,
            stamp,
        ),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM current_affairs WHERE id = ?", (cursor.lastrowid,)).fetchone())


@app.patch("/api/politics/affairs/{affair_id}")
def update_affair(affair_id: int, payload: AffairPatch, conn: sqlite3.Connection = Depends(db)):
    current = conn.execute("SELECT * FROM current_affairs WHERE id = ?", (affair_id,)).fetchone()
    if not current:
        raise HTTPException(status_code=404, detail="时政条目不存在")
    fields = payload.model_dump(exclude_unset=True)
    date_value = (fields.get("event_date", current["event_date"]) or "").strip()
    title = (fields.get("title", current["title"]) or "").strip()
    if not DATE_RE.match(date_value):
        raise HTTPException(status_code=400, detail="日期格式应为 YYYY-MM-DD")
    if not title:
        raise HTTPException(status_code=400, detail="请填写时政事件")
    conn.execute(
        """UPDATE current_affairs SET event_date=?, title=?, related_point=?, tags=?, note=?, updated_at=?
           WHERE id=?""",
        (
            date_value,
            title,
            fields.get("related_point", current["related_point"]).strip(),
            fields.get("tags", current["tags"]).strip(),
            fields.get("note", current["note"]).strip(),
            now_str(),
            affair_id,
        ),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM current_affairs WHERE id = ?", (affair_id,)).fetchone())


@app.delete("/api/politics/affairs/{affair_id}")
def delete_affair(affair_id: int, conn: sqlite3.Connection = Depends(db)):
    current = conn.execute("SELECT * FROM current_affairs WHERE id = ?", (affair_id,)).fetchone()
    if not current:
        raise HTTPException(status_code=404, detail="时政条目不存在")
    stamp = now_str()
    conn.execute(
        "UPDATE current_affairs SET deleted_at = ?, updated_at = ? WHERE id = ?",
        (stamp, stamp, affair_id),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM current_affairs WHERE id = ?", (affair_id,)).fetchone())


@app.post("/api/politics/affairs/{affair_id}/restore")
def restore_affair(affair_id: int, conn: sqlite3.Connection = Depends(db)):
    current = conn.execute("SELECT * FROM current_affairs WHERE id = ?", (affair_id,)).fetchone()
    if not current:
        raise HTTPException(status_code=404, detail="时政条目不存在")
    conn.execute(
        "UPDATE current_affairs SET deleted_at = '', updated_at = ? WHERE id = ?",
        (now_str(), affair_id),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM current_affairs WHERE id = ?", (affair_id,)).fetchone())


@app.get("/api/politics/frameworks")
def list_frameworks(
    q: str | None = None,
    question_type: str | None = None,
    include_deleted: bool = False,
    conn: sqlite3.Connection = Depends(db),
):
    where: list[str] = []
    params: list = []
    if not include_deleted:
        where.append("deleted_at = ''")
    if question_type:
        where.append("question_type = ?")
        params.append(question_type)
    if q and q.strip():
        keyword = f"%{q.strip()}%"
        where.append("(template LIKE ? OR keywords LIKE ? OR question_type LIKE ?)")
        params.extend([keyword] * 3)
    sql = "SELECT * FROM answer_frameworks"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY id DESC"
    items = [dict(row) for row in conn.execute(sql, params)]
    return {"items": items, "count": len(items)}


@app.post("/api/politics/frameworks", status_code=201)
def create_framework(payload: FrameworkIn, conn: sqlite3.Connection = Depends(db)):
    question_type = payload.question_type.strip()
    if not question_type:
        raise HTTPException(status_code=400, detail="请选择题型")
    stamp = now_str()
    cursor = conn.execute(
        """INSERT INTO answer_frameworks (question_type, template, keywords, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)""",
        (question_type, payload.template.strip(), payload.keywords.strip(), stamp, stamp),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM answer_frameworks WHERE id = ?", (cursor.lastrowid,)).fetchone())


@app.patch("/api/politics/frameworks/{framework_id}")
def update_framework(framework_id: int, payload: FrameworkPatch, conn: sqlite3.Connection = Depends(db)):
    current = conn.execute("SELECT * FROM answer_frameworks WHERE id = ?", (framework_id,)).fetchone()
    if not current:
        raise HTTPException(status_code=404, detail="分析题框架不存在")
    fields = payload.model_dump(exclude_unset=True)
    question_type = (fields.get("question_type", current["question_type"]) or "").strip()
    if not question_type:
        raise HTTPException(status_code=400, detail="请选择题型")
    conn.execute(
        """UPDATE answer_frameworks SET question_type=?, template=?, keywords=?, updated_at=?
           WHERE id=?""",
        (
            question_type,
            fields.get("template", current["template"]).strip(),
            fields.get("keywords", current["keywords"]).strip(),
            now_str(),
            framework_id,
        ),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM answer_frameworks WHERE id = ?", (framework_id,)).fetchone())


@app.delete("/api/politics/frameworks/{framework_id}")
def delete_framework(framework_id: int, conn: sqlite3.Connection = Depends(db)):
    current = conn.execute("SELECT * FROM answer_frameworks WHERE id = ?", (framework_id,)).fetchone()
    if not current:
        raise HTTPException(status_code=404, detail="分析题框架不存在")
    stamp = now_str()
    conn.execute(
        "UPDATE answer_frameworks SET deleted_at = ?, updated_at = ? WHERE id = ?",
        (stamp, stamp, framework_id),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM answer_frameworks WHERE id = ?", (framework_id,)).fetchone())


@app.post("/api/politics/frameworks/{framework_id}/restore")
def restore_framework(framework_id: int, conn: sqlite3.Connection = Depends(db)):
    current = conn.execute("SELECT * FROM answer_frameworks WHERE id = ?", (framework_id,)).fetchone()
    if not current:
        raise HTTPException(status_code=404, detail="分析题框架不存在")
    conn.execute(
        "UPDATE answer_frameworks SET deleted_at = '', updated_at = ? WHERE id = ?",
        (now_str(), framework_id),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM answer_frameworks WHERE id = ?", (framework_id,)).fetchone())


@app.get("/api/politics/search")
def politics_search(q: str, conn: sqlite3.Connection = Depends(db)):
    keyword = (q or "").strip()
    if not keyword:
        return {"items": [], "count": 0}
    like = f"%{keyword}%"
    results: list[dict] = []

    for row in conn.execute(
        """SELECT k.*, c.title AS chapter_title, s.title AS section_title
           FROM knowledge_cards k
           JOIN chapters c ON c.id = k.chapter_id
           LEFT JOIN chapters s ON s.id = k.section_id
           WHERE k.deleted_at = '' AND (k.title LIKE ? OR k.body LIKE ?)
           ORDER BY k.id DESC LIMIT 20""",
        (like, like),
    ):
        item = dict(row)
        results.append(
            {
                "type": "card",
                "id": item["id"],
                "title": item["title"],
                "snippet": item["body"][:120],
                "meta": " · ".join(x for x in [item["chapter_title"], item.get("section_title")] if x),
                "chapter_id": item["chapter_id"],
                "section_id": item["section_id"],
            }
        )

    for row in conn.execute(
        """SELECT * FROM current_affairs
           WHERE deleted_at = '' AND (title LIKE ? OR note LIKE ? OR related_point LIKE ? OR tags LIKE ?)
           ORDER BY event_date DESC, id DESC LIMIT 20""",
        (like, like, like, like),
    ):
        item = dict(row)
        results.append(
            {
                "type": "affair",
                "id": item["id"],
                "title": item["title"],
                "snippet": item["note"][:120] or item["related_point"][:120],
                "meta": " · ".join(x for x in [item["event_date"], item["tags"]] if x),
            }
        )

    for row in conn.execute(
        """SELECT * FROM answer_frameworks
           WHERE deleted_at = '' AND (template LIKE ? OR keywords LIKE ? OR question_type LIKE ?)
           ORDER BY id DESC LIMIT 20""",
        (like, like, like),
    ):
        item = dict(row)
        results.append(
            {
                "type": "framework",
                "id": item["id"],
                "title": f"分析题框架 · {item['question_type']}",
                "snippet": item["template"][:120],
                "meta": item["keywords"],
            }
        )

    for row in conn.execute(
        """SELECT q.*, c.title AS chapter_title, s.title AS section_title
           FROM questions q
           JOIN chapters c ON c.id = q.chapter_id
           LEFT JOIN chapters s ON s.id = q.section_id
           WHERE q.qtype = 'politics_choice' AND q.deleted_at = ''
             AND (q.content LIKE ? OR q.ocr_raw LIKE ? OR q.option_analysis LIKE ?
                  OR q.my_answer LIKE ? OR q.correct_answer LIKE ? OR q.cause LIKE ?
                  OR c.title LIKE ? OR s.title LIKE ? OR q.exam_year LIKE ?)
           ORDER BY q.created_at DESC LIMIT 20""",
        (like,) * 9,
    ):
        item = dict(row)
        snippet = (item["option_analysis"] or item["content"] or "")[:120]
        results.append(
            {
                "type": "question",
                "id": item["id"],
                "title": (item["content"] or "政治选择题").split("\n")[0][:60],
                "snippet": snippet,
                "meta": " · ".join(
                    x
                    for x in [item["chapter_title"], item.get("section_title"), item["cause"], item.get("exam_year")]
                    if x
                ),
            }
        )

    return {"items": results, "count": len(results)}


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
