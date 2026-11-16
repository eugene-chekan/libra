"""A DeepSeek chat client that follows the experiment's descriptor protocol."""

import json
import time
from collections.abc import Callable
from dataclasses import dataclass

import openai

from app.config import Settings

KEY_SETTING = "LIBRA_DEEPSEEK_API_KEY"
JSON_ATTEMPTS = 3
MAX_OUTPUT_TOKENS = 300
SDK_RETRIES = 5
TIMEOUT_SECONDS = 120
_PAYMENT_REQUIRED = 402


@dataclass(frozen=True)
class Completion:
    """One answer, with what the log needs; tokens and seconds cover every attempt."""

    content: str
    data: dict
    model: str
    system_fingerprint: str | None
    prompt_tokens: int
    completion_tokens: int
    seconds: float
    attempts: int


class MissingKeyError(Exception):
    """No API key is set."""


class StopRunError(Exception):
    """DeepSeek refused the key or the balance, so no later request can work."""


class InvalidOutputError(Exception):
    """Every attempt gave an answer that is not JSON, or JSON of the wrong shape."""

    def __init__(self, message: str, completion: Completion) -> None:
        super().__init__(message)
        # The last attempt's content, with empty `data`.
        self.completion = completion


class DeepSeek:
    """Asks the configured DeepSeek model for JSON, with thinking off and temperature 0."""

    def __init__(self, settings: Settings, client: openai.OpenAI | None = None) -> None:
        """Check the key and build the SDK client.

        Args:
            settings: Names the key, the base URL and the model.
            client: Used in place of the SDK client; tests pass a fake.

        Raises:
            MissingKeyError: The key is not set.
        """
        if settings.deepseek_api_key is None:
            raise MissingKeyError(f"set {KEY_SETTING} to a DeepSeek API key")
        self.model = settings.deepseek_model
        self.client = client or openai.OpenAI(
            api_key=settings.deepseek_api_key.get_secret_value(),
            base_url=settings.deepseek_base_url,
            max_retries=SDK_RETRIES,
            timeout=TIMEOUT_SECONDS,
        )

    def complete_json(
        self, system: str, user: str, validate: Callable[[dict], object]
    ) -> Completion:
        """Send one prompt, and ask again while the answer is not usable JSON.

        Args:
            system: The instructions. JSON mode needs the word "json" in them.
            user: The text the instructions are about.
            validate: Raises `ValueError` for a JSON object of the wrong shape.

        Returns:
            The first answer that `validate` accepts.

        Raises:
            InvalidOutputError: `JSON_ATTEMPTS` answers in a row were not usable.
            StopRunError: The key was refused (401) or the balance is empty (402).
            openai.APIError: Any other failure the SDK's own retries did not cure.
        """
        started = time.perf_counter()
        prompt_tokens = completion_tokens = 0
        for attempt in range(1, JSON_ATTEMPTS + 1):
            response = self._request(system, user)
            prompt_tokens += response.usage.prompt_tokens
            completion_tokens += response.usage.completion_tokens
            content = response.choices[0].message.content or ""
            data, problem = _parse(content, validate)
            completion = Completion(
                content=content,
                data=data,
                model=response.model,
                system_fingerprint=response.system_fingerprint,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                seconds=time.perf_counter() - started,
                attempts=attempt,
            )
            if problem is None:
                return completion
        raise InvalidOutputError(
            f"no usable answer in {JSON_ATTEMPTS} attempts: {problem}", completion
        )

    def _request(self, system: str, user: str) -> openai.types.chat.ChatCompletion:
        try:
            return self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0,
                response_format={"type": "json_object"},
                max_tokens=MAX_OUTPUT_TOKENS,
                extra_body={"thinking": {"type": "disabled"}},
            )
        except openai.APIStatusError as exc:
            if not _stops_the_run(exc):
                raise
            status = exc.status_code
        # Raised outside the handler, and without the server's message: both the chained
        # error and the message can repeat the key.
        raise StopRunError(
            f"DeepSeek answered {status}: check {KEY_SETTING} and the account's balance"
        )


def _stops_the_run(exc: openai.APIStatusError) -> bool:
    return isinstance(exc, openai.AuthenticationError) or exc.status_code == _PAYMENT_REQUIRED


def _parse(content: str, validate: Callable[[dict], object]) -> tuple[dict, str | None]:
    """The answer as a checked JSON object, or an empty one and what is wrong with it."""
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        return {}, f"the answer is not JSON ({exc.msg})"
    if not isinstance(data, dict):
        return {}, "the answer is not a JSON object"
    try:
        validate(data)
    except ValueError as exc:
        return {}, str(exc)
    return data, None
