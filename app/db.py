"""SQLite 连接与表结构。数据库位置：E:\\助手\\data\\assistant.db"""
from __future__ import annotations

import sqlite3
from contextlib import closing
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = BASE_DIR / "uploads"
DB_PATH = DATA_DIR / "assistant.db"

SCHEMA = """
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS chapters (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    path          TEXT NOT NULL UNIQUE,
    subject       TEXT NOT NULL,
    subject_group TEXT NOT NULL DEFAULT '',
    subject_order INTEGER NOT NULL DEFAULT 0,
    title         TEXT NOT NULL,
    level         INTEGER NOT NULL,
    parent_id     INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    weight        REAL NOT NULL DEFAULT 0,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    active        INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_chapters_subject ON chapters(subject, level, sort_order);

CREATE TABLE IF NOT EXISTS questions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    subject            TEXT NOT NULL,
    chapter_id         INTEGER NOT NULL REFERENCES chapters(id),
    section_id         INTEGER REFERENCES chapters(id),
    cause              TEXT NOT NULL,
    content            TEXT NOT NULL DEFAULT '',
    image_path         TEXT,
    source             TEXT NOT NULL DEFAULT '',
    my_answer          TEXT NOT NULL DEFAULT '',
    correct_answer     TEXT NOT NULL DEFAULT '',
    status             TEXT NOT NULL DEFAULT 'wrong',
    review_count       INTEGER NOT NULL DEFAULT 0,
    last_review_at     TEXT,
    last_review_result TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_chapter ON questions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_questions_created ON questions(created_at);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_cause ON questions(cause);

-- 复习事件流水，为 v2 的间隔复习队列预留
CREATE TABLE IF NOT EXISTS review_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    result      TEXT NOT NULL,
    reviewed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_events_question ON review_events(question_id);
"""


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(DB_PATH)) as conn:
        conn.executescript(SCHEMA)
        conn.commit()


def get_conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn
