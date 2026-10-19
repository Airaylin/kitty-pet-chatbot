"""请求 / 响应模型定义。"""

from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["user", "assistant", "system"]


class Message(BaseModel):
    role: Role
    content: str = Field(default="", min_length=0)


class ChatRequest(BaseModel):
    """前端发来的一次对话请求。"""

    message: str = Field(..., min_length=1, max_length=8000, description="当前用户输入")
    history: list[Message] = Field(default_factory=list, description="历史消息（不含本次输入）")
    session_id: str | None = Field(default=None, description="可选的会话 ID")
    pet_name: str = Field(default="", max_length=24, description="给宠物起的名字")
    personality: str = Field(default="gentle", max_length=32, description="性格 ID")
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=1, le=32768)


class ChatResponse(BaseModel):
    """非流式对话的响应。"""

    reply: str
    session_id: str
    model: str
    pet_name: str = ""
    personality: str = "gentle"
    usage: dict | None = None


class PersonalityInfo(BaseModel):
    """可选的宠物性格。"""

    id: str
    name: str
    emoji: str
    tagline: str
    color: str


class SessionInfo(BaseModel):
    session_id: str
    title: str
    created_at: float
    updated_at: float
    message_count: int


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    model: str
    api_base_url: str
    api_key_configured: bool
