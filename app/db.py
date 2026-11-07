"""SQLite 连接与表结构。数据库位置：<项目根目录>/data/assistant.db（由 BASE_DIR 推导）"""
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
    ocr_raw            TEXT NOT NULL DEFAULT '',
    qtype              TEXT NOT NULL DEFAULT 'regular',
    option_analysis    TEXT NOT NULL DEFAULT '',
    exam_year          TEXT NOT NULL DEFAULT '',
    image_path         TEXT,
    source             TEXT NOT NULL DEFAULT '',
    my_answer          TEXT NOT NULL DEFAULT '',
    correct_answer     TEXT NOT NULL DEFAULT '',
    status             TEXT NOT NULL DEFAULT 'wrong',
    review_count       INTEGER NOT NULL DEFAULT 0,
    last_review_at     TEXT,
    last_review_result TEXT,
    deleted_at         TEXT NOT NULL DEFAULT '',
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_chapter ON questions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_questions_created ON questions(created_at);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_cause ON questions(cause);

-- ===== 政治模块 =====

CREATE TABLE IF NOT EXISTS knowledge_cards (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id    INTEGER NOT NULL REFERENCES chapters(id),
    section_id    INTEGER REFERENCES chapters(id),
    title         TEXT NOT NULL,
    body          TEXT NOT NULL DEFAULT '',
    view_count    INTEGER NOT NULL DEFAULT 0,
    last_viewed_at TEXT,
    self_rating   TEXT,
    deleted_at    TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_chapter ON knowledge_cards(chapter_id, section_id);

CREATE TABLE IF NOT EXISTS current_affairs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    event_date    TEXT NOT NULL,
    title         TEXT NOT NULL,
    related_point TEXT NOT NULL DEFAULT '',
    tags          TEXT NOT NULL DEFAULT '',
    note          TEXT NOT NULL DEFAULT '',
    deleted_at    TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_affairs_date ON current_affairs(event_date);

CREATE TABLE IF NOT EXISTS answer_frameworks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    question_type TEXT NOT NULL,
    template      TEXT NOT NULL DEFAULT '',
    keywords      TEXT NOT NULL DEFAULT '',
    deleted_at    TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

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
        migrate(conn)
        conn.commit()


def migrate(conn: sqlite3.Connection) -> None:
    """兼容已有数据库：只加列、加表，不重建。"""
    columns = {row[1] for row in conn.execute("PRAGMA table_info(questions)")}
    additions = {
        "ocr_raw": "TEXT NOT NULL DEFAULT ''",
        "qtype": "TEXT NOT NULL DEFAULT 'regular'",
        "option_analysis": "TEXT NOT NULL DEFAULT ''",
        "exam_year": "TEXT NOT NULL DEFAULT ''",
        "deleted_at": "TEXT NOT NULL DEFAULT ''",
    }
    for name, ddl in additions.items():
        if name not in columns:
            conn.execute(f"ALTER TABLE questions ADD COLUMN {name} {ddl}")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_questions_qtype ON questions(qtype)")

    # 政治三张表同样只加删除标记列（软删除：有值即已进回收站）
    for table in ("knowledge_cards", "current_affairs", "answer_frameworks"):
        existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        if "deleted_at" not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN deleted_at TEXT NOT NULL DEFAULT ''")


def get_conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn
