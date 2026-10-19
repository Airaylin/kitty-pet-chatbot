"""应用配置：从 .env / 环境变量读取大模型与服务参数。"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SYSTEM_PROMPT = (
    "你是一个乐于助人、专业友好的中文 AI 助手。"
    "回答要准确、清晰、有条理；必要时使用 Markdown 列表或表格让内容更易读。"
)


class Settings(BaseSettings):
    """运行期配置。所有字段都可通过环境变量覆盖。"""

    api_key: str = Field(default="", alias="API_KEY")
    api_base_url: str = Field(
        default="https://api.xiaomimimo.com/v1", alias="API_BASE_URL"
    )
    model_name: str = Field(default="mimo-v2.6-pro", alias="MODEL_NAME")

    temperature: float = Field(default=0.7, alias="TEMPERATURE")
    max_tokens: int = Field(default=2048, alias="MAX_TOKENS")
    request_timeout: float = Field(default=120.0, alias="REQUEST_TIMEOUT")

    host: str = Field(default="127.0.0.1", alias="HOST")
    port: int = Field(default=8000, alias="PORT")

    system_prompt: str = Field(default=DEFAULT_SYSTEM_PROMPT, alias="SYSTEM_PROMPT")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @property
    def chat_completions_url(self) -> str:
        return f"{self.api_base_url.rstrip('/')}/chat/completions"


@lru_cache
def get_settings() -> Settings:
    return Settings()
