"""本地启动脚本：日志写入 data/server.log，便于后台运行。"""
from __future__ import annotations

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
os.chdir(BASE_DIR)
sys.path.insert(0, str(BASE_DIR))

LOG_PATH = BASE_DIR / "data" / "server.log"
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
_log = LOG_PATH.open("a", encoding="utf-8", buffering=1)
sys.stdout = _log
sys.stderr = _log

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("ASSISTANT_PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, log_level="info")
