import json
from collections.abc import AsyncIterator

import httpx

from app.ai.base import (
    AIProvider,
    ChatMessage,
    Completion,
    ProviderRateLimited,
    ProviderTimeout,
    ProviderTokenLimit,
    estimate_tokens,
)
from app.core.errors import ProviderError


def _total(messages: list[ChatMessage]) -> str:
    return "\n".join(m.content for m in messages)


def _raise_for_status(resp: httpx.Response, provider: str) -> None:
    if resp.status_code < 400:
        return
    if resp.status_code == 429:
        raise ProviderRateLimited(f"{provider} rate limit reached. Try again shortly or switch provider.")
    if resp.status_code in (401, 403):
        raise ProviderError(f"{provider} rejected the credentials. Check the API key configuration.")
    if resp.status_code == 413 or (resp.status_code == 400 and "context" in resp.text.lower()):
        raise ProviderTokenLimit(f"Request exceeds the {provider} model's token limit. Select fewer files.")
    raise ProviderError(f"{provider} returned HTTP {resp.status_code}.")


class GroqProvider(AIProvider):
    name = "groq"

    def __init__(self, api_key: str, model: str, base_url: str, timeout: float):
        if not api_key:
            raise ProviderError("GROQ_API_KEY is not configured.", status_code=503, code="provider_not_configured")
        self.model = model
        self._base = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._timeout = timeout

    def _payload(self, messages, max_tokens, stream, json_mode=False):
        p = {
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "max_tokens": max_tokens,
            "temperature": 0.1,
            "stream": stream,
        }
        if json_mode:
            p["response_format"] = {"type": "json_object"}
        return p

    async def complete(self, messages, *, json_mode=False, max_tokens=2048) -> Completion:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as c:
                r = await c.post(
                    f"{self._base}/chat/completions",
                    headers=self._headers,
                    json=self._payload(messages, max_tokens, False, json_mode),
                )
        except httpx.TimeoutException as e:
            raise ProviderTimeout("The AI provider timed out.") from e
        except httpx.HTTPError as e:
            raise ProviderError("Could not reach the Groq API.") from e
        _raise_for_status(r, "Groq")
        try:
            data = r.json()
            text = data["choices"][0]["message"]["content"] or ""
        except (ValueError, KeyError, IndexError, TypeError) as e:
            raise ProviderError("Groq returned an unexpected response shape.") from e
        usage = data.get("usage") or {}
        if "prompt_tokens" in usage:
            return Completion(text, usage["prompt_tokens"], usage.get("completion_tokens", 0), "provider")
        return Completion(text, estimate_tokens(_total(messages)), estimate_tokens(text), "estimate")

    async def stream(self, messages, *, max_tokens=2048) -> AsyncIterator[str]:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as c:
                async with c.stream(
                    "POST",
                    f"{self._base}/chat/completions",
                    headers=self._headers,
                    json=self._payload(messages, max_tokens, True),
                ) as r:
                    if r.status_code >= 400:
                        await r.aread()
                    _raise_for_status(r, "Groq")
                    async for line in r.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        chunk = line[5:].strip()
                        if chunk == "[DONE]":
                            return
                        try:
                            delta = json.loads(chunk)["choices"][0]["delta"].get("content")
                        except (ValueError, KeyError, IndexError):
                            continue
                        if delta:
                            yield delta
        except httpx.TimeoutException as e:
            raise ProviderTimeout("The AI provider timed out.") from e
        except httpx.HTTPError as e:
            raise ProviderError("Could not reach the Groq API.") from e


class OllamaProvider(AIProvider):
    name = "ollama"

    def __init__(self, base_url: str, model: str, timeout: float):
        self.model = model
        self._base = base_url.rstrip("/")
        self._timeout = timeout

    def _payload(self, messages, max_tokens, stream, json_mode=False):
        p = {
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": stream,
            "options": {"temperature": 0.1, "num_predict": max_tokens},
        }
        if json_mode:
            p["format"] = "json"
        return p

    async def complete(self, messages, *, json_mode=False, max_tokens=2048) -> Completion:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as c:
                r = await c.post(f"{self._base}/api/chat", json=self._payload(messages, max_tokens, False, json_mode))
        except httpx.TimeoutException as e:
            raise ProviderTimeout("The local model timed out.") from e
        except httpx.HTTPError as e:
            raise ProviderError("Could not reach Ollama. Is it running?", status_code=503) from e
        _raise_for_status(r, "Ollama")
        try:
            data = r.json()
            text = data["message"]["content"]
        except (ValueError, KeyError, TypeError) as e:
            raise ProviderError("Ollama returned an unexpected response shape.") from e
        if "prompt_eval_count" in data:
            return Completion(text, data["prompt_eval_count"], data.get("eval_count", 0), "provider")
        return Completion(text, estimate_tokens(_total(messages)), estimate_tokens(text), "estimate")

    async def stream(self, messages, *, max_tokens=2048) -> AsyncIterator[str]:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as c:
                async with c.stream("POST", f"{self._base}/api/chat", json=self._payload(messages, max_tokens, True)) as r:
                    if r.status_code >= 400:
                        await r.aread()
                    _raise_for_status(r, "Ollama")
                    async for line in r.aiter_lines():
                        if not line:
                            continue
                        try:
                            obj = json.loads(line)
                        except ValueError:
                            continue
                        piece = (obj.get("message") or {}).get("content")
                        if piece:
                            yield piece
                        if obj.get("done"):
                            return
        except httpx.TimeoutException as e:
            raise ProviderTimeout("The local model timed out.") from e
        except httpx.HTTPError as e:
            raise ProviderError("Could not reach Ollama. Is it running?", status_code=503) from e

    async def health(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=3) as c:
                r = await c.get(f"{self._base}/api/tags")
            names = [m["name"] for m in r.json().get("models", [])]
            return {"provider": self.name, "model": self.model, "reachable": True, "installed_models": names}
        except Exception:
            return {"provider": self.name, "model": self.model, "reachable": False}
