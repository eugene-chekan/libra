"""A stand-in for the OpenAI SDK client pointed at DeepSeek, so tests never call the API."""

from collections.abc import Callable
from types import SimpleNamespace

import httpx2
import openai

SERVED_MODEL = "DeepSeek-V4-Pro-0813"
FINGERPRINT = "fp_fake"

_ERRORS = {
    400: openai.BadRequestError,
    401: openai.AuthenticationError,
    429: openai.RateLimitError,
    500: openai.InternalServerError,
}


def api_error(status: int, message: str = "the fake server refused") -> openai.APIStatusError:
    """The SDK's own exception for an HTTP status, as a real response would raise it."""
    request = httpx2.Request("POST", "https://api.deepseek.com/chat/completions")
    response = httpx2.Response(status, request=request)
    return _ERRORS.get(status, openai.APIStatusError)(message, response=response, body=None)


class FakeDeepSeek:
    """Answers `chat.completions.create` from a list, one outcome per request.

    Like the real server, it refuses JSON mode when no message holds the word "json".
    """

    def __init__(
        self,
        outcomes: list[str | Exception],
        on_request: Callable[[], None] | None = None,
    ) -> None:
        self.outcomes = list(outcomes)
        self.on_request = on_request
        self.calls: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs: object) -> SimpleNamespace:
        self.calls.append(kwargs)
        if self.on_request is not None:
            self.on_request()
        messages = kwargs["messages"]
        json_mode = kwargs.get("response_format") == {"type": "json_object"}
        if json_mode and not any("json" in message["content"].lower() for message in messages):
            raise api_error(400, "Prompt must contain the word 'json' to use response_format")
        if not self.outcomes:
            raise AssertionError("the code sent more requests than the test expected")
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=outcome))],
            model=SERVED_MODEL,
            system_fingerprint=FINGERPRINT,
            usage=SimpleNamespace(
                prompt_tokens=sum(len(message["content"].split()) for message in messages),
                completion_tokens=len(outcome.split()),
            ),
        )
