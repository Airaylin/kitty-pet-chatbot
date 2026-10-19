"""与 OpenAI 兼容的大模型 HTTP 接口交互。"""

from collections.abc import AsyncIterator

import httpx

from .config import Settings


class LLMError(RuntimeError):
    """大模型调用失败。"""


def _headers(settings: Settings) -> dict:
    return {
        "Authorization": f"Bearer {settings.api_key}",
        "Content-Type": "application/json",
    }


def _payload(settings: Settings, messages: list[dict], *, stream: bool, temperature: float | None,
             max_tokens: int | None) -> dict:
    return {
        "model": settings.model_name,
        "messages": messages,
        "stream": stream,
        "temperature": settings.temperature if temperature is None else temperature,
        "max_tokens": settings.max_tokens if max_tokens is None else max_tokens,
    }


async def chat_completion(
    settings: Settings,
    messages: list[dict],
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> dict:
    """非流式对话，返回上游原始 JSON。"""
    if not settings.api_key:
        raise LLMError("未配置 API_KEY，请在 backend/.env 中填写后再启动。")

    payload = _payload(
        settings, messages, stream=False, temperature=temperature, max_tokens=max_tokens
    )

    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
            resp = await client.post(
                settings.chat_completions_url, headers=_headers(settings), json=payload
            )
    except httpx.TimeoutException as exc:
        raise LLMError("请求大模型超时，请稍后重试。") from exc
    except httpx.HTTPError as exc:
        raise LLMError(f"网络异常：{exc}") from exc

    if resp.status_code != 200:
        detail = resp.text[:500]
        raise LLMError(f"大模型返回错误 (HTTP {resp.status_code}): {detail}")

    data = resp.json()
    if "choices" not in data or not data["choices"]:
        raise LLMError("大模型返回了空结果，请重试。")
    return data


async def chat_completion_stream(
    settings: Settings,
    messages: list[dict],
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> AsyncIterator[str]:
    """流式对话，逐段 yield 出增量文本。"""
    if not settings.api_key:
        raise LLMError("未配置 API_KEY，请在 backend/.env 中填写后再启动。")

    payload = _payload(
        settings, messages, stream=True, temperature=temperature, max_tokens=max_tokens
    )

    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        try:
            async with client.stream(
                "POST",
                settings.chat_completions_url,
                headers=_headers(settings),
                json=payload,
            ) as resp:
                if resp.status_code != 200:
                    body = (await resp.aread()).decode("utf-8", errors="replace")[:500]
                    raise LLMError(f"大模型返回错误 (HTTP {resp.status_code}): {body}")

                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    if line.startswith(":"):
                        # SSE 注释行 / 心跳
                        continue
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    yield data
        except httpx.TimeoutException as exc:
            raise LLMError("流式请求超时，请稍后重试。") from exc
        except httpx.HTTPError as exc:
            raise LLMError(f"网络异常：{exc}") from exc
