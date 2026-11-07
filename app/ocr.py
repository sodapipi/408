"""本地离线 OCR：RapidOCR（onnxruntime，CPU），只识别印刷体文字。"""
from __future__ import annotations

import threading
import time
from pathlib import Path

_engine = None
_lock = threading.Lock()


def _get_engine():
    global _engine
    if _engine is None:
        from rapidocr_onnxruntime import RapidOCR

        _engine = RapidOCR()
    return _engine


def recognize(path: Path) -> dict:
    """识别图片中的印刷体文字，失败时返回空文本和错误说明，不抛异常。"""
    started = time.perf_counter()
    try:
        with _lock:
            result, _ = _get_engine()(str(path))
    except Exception as exc:  # 模型缺失、图片损坏等都不应阻塞录题
        return {
            "text": "",
            "lines": [],
            "elapsed_ms": int((time.perf_counter() - started) * 1000),
            "error": f"OCR 识别失败：{exc}",
        }

    lines = []
    for _box, text, score in result or []:
        text = (text or "").strip()
        if text:
            lines.append({"text": text, "score": round(float(score), 3)})

    return {
        "text": "\n".join(item["text"] for item in lines),
        "lines": lines,
        "elapsed_ms": int((time.perf_counter() - started) * 1000),
        "error": None,
    }
