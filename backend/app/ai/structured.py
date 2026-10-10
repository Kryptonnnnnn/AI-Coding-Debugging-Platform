"""Run a model call and validate its output against a Pydantic schema."""
import json
import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.ai.base import AIProvider, ChatMessage, Completion, MalformedOutput

T = TypeVar("T", bound=BaseModel)

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.I)


def extract_json(text: str) -> object:
    text = _FENCE.sub("", text.strip())
    try:
        return json.loads(text)
    except ValueError:
        pass
    start = text.find("{")
    if start == -1:
        raise ValueError("no JSON object found")
    depth, in_str, esc = 0, False, False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
    raise ValueError("unterminated JSON object")


async def run_structured(
    provider: AIProvider, messages: list[ChatMessage], schema: type[T], *, max_tokens: int = 2048, retries: int = 1
) -> tuple[T, list[Completion]]:
    """Returns (validated, completions). Retries once asking the model to repair invalid output."""
    completions: list[Completion] = []
    msgs = list(messages)
    last_err = ""
    for _ in range(retries + 1):
        comp = await provider.complete(msgs, json_mode=True, max_tokens=max_tokens)
        completions.append(comp)
        try:
            return schema.model_validate(extract_json(comp.text)), completions
        except (ValueError, ValidationError) as e:
            last_err = type(e).__name__
            msgs = msgs + [
                ChatMessage("assistant", comp.text[:4000]),
                ChatMessage(
                    "user",
                    "Your previous reply was not valid JSON for the required schema. "
                    "Reply again with ONLY a JSON object matching the schema.",
                ),
            ]
    raise MalformedOutput(f"The model returned output that failed schema validation ({last_err}). Please retry.")
