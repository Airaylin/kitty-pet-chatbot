"""FastAPI 入口：提供对话接口并托管前端静态文件。"""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse

from . import llm
from .config import get_settings
from .personalities import PERSONALITIES, build_system_prompt, get_personality
from .schemas import (
    ChatRequest,
    ChatResponse,
    HealthResponse,
    Message,
    PersonalityInfo,
    SessionInfo,
)

settings = get_settings()

BASE_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = FastAPI(
    title="AI Chatbot API",
    description="基于 FastAPI + mimo-v2.6-pro 的对话机器人后端",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # 本地开发放开；生产请改成前端域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# 内存态会话存储（进程重启即清空；生产环境可换成 Redis / 数据库）
# ---------------------------------------------------------------------------
class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, dict] = {}

    def create(self) -> str:
        sid = uuid.uuid4().hex
        now = time.time()
        self._sessions[sid] = {
            "title": "新对话",
            "created_at": now,
            "updated_at": now,
            "messages": [],
        }
        return sid

    def get(self, sid: str) -> dict | None:
        return self._sessions.get(sid)

    def append(self, sid: str, role: str, content: str) -> None:
        sess = self._sessions[sid]
        sess["messages"].append({"role": role, "content": content})
        sess["updated_at"] = time.time()
        if role == "user" and sess["title"] == "新对话":
            sess["title"] = content.strip().replace("\n", " ")[:24] or "新对话"

    def list_all(self) -> list[SessionInfo]:
        items = []
        for sid, sess in self._sessions.items():
            items.append(
                SessionInfo(
                    session_id=sid,
                    title=sess["title"],
                    created_at=sess["created_at"],
                    updated_at=sess["updated_at"],
                    message_count=len(sess["messages"]),
                )
            )
        items.sort(key=lambda s: s.updated_at, reverse=True)
        return items

    def delete(self, sid: str) -> bool:
        return self._sessions.pop(sid, None) is not None

    def clear(self) -> int:
        n = len(self._sessions)
        self._sessions.clear()
        return n


store = SessionStore()


# ---------------------------------------------------------------------------
# 健康检查 / 元信息
# ---------------------------------------------------------------------------
@app.get("/api/health", response_model=HealthResponse, tags=["meta"])
async def health() -> HealthResponse:
    return HealthResponse(
        model=settings.model_name,
        api_base_url=settings.api_base_url,
        api_key_configured=bool(settings.api_key),
    )


@app.get("/api/personalities", response_model=list[PersonalityInfo], tags=["meta"])
async def list_personalities() -> list[PersonalityInfo]:
    """返回可选的宠物性格（不含 system prompt 明文）。"""
    return [PersonalityInfo(**{k: p[k] for k in ("id", "name", "emoji", "tagline", "color")}) for p in PERSONALITIES]


# ---------------------------------------------------------------------------
# 会话管理
# ---------------------------------------------------------------------------
@app.get("/api/sessions", response_model=list[SessionInfo], tags=["sessions"])
async def list_sessions() -> list[SessionInfo]:
    return store.list_all()


@app.post("/api/sessions", response_model=SessionInfo, tags=["sessions"])
async def create_session() -> SessionInfo:
    sid = store.create()
    sess = store.get(sid)
    assert sess is not None
    return SessionInfo(
        session_id=sid,
        title=sess["title"],
        created_at=sess["created_at"],
        updated_at=sess["updated_at"],
        message_count=0,
    )


@app.get("/api/sessions/{session_id}/messages", response_model=list[Message], tags=["sessions"])
async def get_session_messages(session_id: str) -> list[Message]:
    sess = store.get(session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    return [Message(**m) for m in sess["messages"]]


@app.delete("/api/sessions/{session_id}", tags=["sessions"])
async def delete_session(session_id: str) -> dict:
    if not store.delete(session_id):
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"ok": True}


@app.delete("/api/sessions", tags=["sessions"])
async def clear_sessions() -> dict:
    return {"ok": True, "deleted": store.clear()}


# ---------------------------------------------------------------------------
# 对话
# ---------------------------------------------------------------------------
def _build_messages(req: ChatRequest) -> list[dict]:
    """组装发给大模型的 messages 数组（system prompt 由宠物人设生成）。"""
    if req.pet_name or req.personality:
        system_prompt = build_system_prompt(req.pet_name, req.personality)
    else:
        # 兼容旧调用方：没有人设时退回通用提示词
        system_prompt = settings.system_prompt

    msgs: list[dict] = [{"role": "system", "content": system_prompt}]
    # 仅保留合法的 user/assistant 历史，防止伪造 system 提示
    for m in req.history:
        if m.role in ("user", "assistant") and m.content.strip():
            msgs.append({"role": m.role, "content": m.content})
    msgs.append({"role": "user", "content": req.message})
    return msgs


def _resolve_session(session_id: str | None) -> str:
    if session_id and store.get(session_id) is not None:
        return session_id
    return store.create()


@app.post("/api/chat", response_model=ChatResponse, tags=["chat"])
async def chat(req: ChatRequest) -> ChatResponse:
    """非流式对话。"""
    sid = _resolve_session(req.session_id)
    messages = _build_messages(req)

    try:
        data = await llm.chat_completion(
            settings,
            messages,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
        )
    except llm.LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    choice = data["choices"][0]
    reply = (choice.get("message") or {}).get("content", "") or ""
    if not reply.strip():
        raise HTTPException(status_code=502, detail="模型返回了空回复，请重试。")

    store.append(sid, "user", req.message)
    store.append(sid, "assistant", reply)

    return ChatResponse(
        reply=reply,
        session_id=sid,
        model=data.get("model", settings.model_name),
        pet_name=req.pet_name,
        personality=req.personality,
        usage=data.get("usage"),
    )


@app.post("/api/chat/stream", tags=["chat"])
async def chat_stream(req: ChatRequest) -> EventSourceResponse:
    """流式对话（SSE）。

    事件类型：
      - `meta`    : {"session_id", "model"}
      - `delta`   : {"text"}  模型输出的增量片段
      - `done`    : {"session_id", "usage"}
      - `error`   : {"message"}
    """
    sid = _resolve_session(req.session_id)
    messages = _build_messages(req)

    async def event_gen():
        # 先推元信息，方便前端立刻绑定 session
        yield {
            "event": "meta",
            "data": json.dumps({
                "session_id": sid,
                "model": settings.model_name,
                "pet_name": req.pet_name,
                "personality": req.personality,
            }),
        }

        full_text: list[str] = []
        try:
            async for raw in llm.chat_completion_stream(
                settings,
                messages,
                temperature=req.temperature,
                max_tokens=req.max_tokens,
            ):
                try:
                    chunk = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                choices = chunk.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                text = delta.get("content") or ""
                if text:
                    full_text.append(text)
                    yield {"event": "delta", "data": json.dumps({"text": text})}

        except llm.LLMError as exc:
            yield {"event": "error", "data": json.dumps({"message": str(exc)})}
            return

        reply = "".join(full_text).strip()
        if not reply:
            yield {"event": "error", "data": json.dumps({"message": "模型返回了空回复，请重试。"})}
            return

        store.append(sid, "user", req.message)
        store.append(sid, "assistant", reply)

        yield {
            "event": "done",
            "data": json.dumps({"session_id": sid, "usage": None}),
        }

    return EventSourceResponse(event_gen())


# ---------------------------------------------------------------------------
# 前端静态资源（放在所有 /api 路由之后）
# ---------------------------------------------------------------------------
if FRONTEND_DIR.is_dir():
    assets_dir = FRONTEND_DIR / "vendor"
    if assets_dir.is_dir():
        app.mount("/vendor", StaticFiles(directory=assets_dir), name="vendor")
    app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
    app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")

    @app.get("/", include_in_schema=False)
    async def index() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
