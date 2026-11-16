"""The DeepSeek client: what every request sends, the retries, and what stops a run."""

import logging
import traceback

import openai
import pytest
from pydantic import SecretStr

from app.config import Settings
from rag.deepseek import (
    JSON_ATTEMPTS,
    KEY_SETTING,
    MAX_OUTPUT_TOKENS,
    SDK_RETRIES,
    DeepSeek,
    InvalidOutputError,
    MissingKeyError,
    StopRunError,
)
from tests.fake_deepseek import FINGERPRINT, SERVED_MODEL, FakeDeepSeek, api_error

KEY = "sk-test-secret-123"
SYSTEM = "Answer in json."
GOOD = '{"a": 1}'


def keyed_settings() -> Settings:
    return Settings(deepseek_api_key=SecretStr(KEY))


def deepseek(outcomes: list[str | Exception]) -> tuple[DeepSeek, FakeDeepSeek]:
    fake = FakeDeepSeek(outcomes)
    return DeepSeek(keyed_settings(), client=fake), fake


def accept(data: dict) -> None:
    pass


def test_a_request_turns_thinking_off_and_asks_for_json() -> None:
    client, fake = deepseek([GOOD])
    settings = keyed_settings()

    completion = client.complete_json(SYSTEM, "a passage", accept)

    assert fake.calls == [
        {
            "model": settings.deepseek_model,
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": "a passage"},
            ],
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "max_tokens": MAX_OUTPUT_TOKENS,
            "extra_body": {"thinking": {"type": "disabled"}},
        }
    ]
    assert completion.data == {"a": 1}
    assert completion.content == GOOD
    assert (completion.model, completion.system_fingerprint) == (SERVED_MODEL, FINGERPRINT)
    assert completion.attempts == 1


def test_empty_content_is_retried() -> None:
    client, fake = deepseek(["", GOOD])

    completion = client.complete_json(SYSTEM, "a passage", accept)

    assert completion.attempts == 2
    assert completion.data == {"a": 1}


def test_the_tokens_of_every_attempt_are_counted() -> None:
    client, _ = deepseek(["not json", GOOD])

    completion = client.complete_json(SYSTEM, "a passage", accept)

    # The fake counts words: 3 + 2 in each request; 2 words, then 2, in the answers.
    assert (completion.prompt_tokens, completion.completion_tokens) == (10, 4)


@pytest.mark.parametrize("bad", ["{broken", '["a list"]', '"a string"', ""])
def test_invalid_json_three_times_raises(bad: str) -> None:
    client, fake = deepseek([bad] * (JSON_ATTEMPTS + 1))

    with pytest.raises(InvalidOutputError) as raised:
        client.complete_json(SYSTEM, "a passage", accept)

    assert len(fake.calls) == JSON_ATTEMPTS
    assert raised.value.completion.content == bad
    assert raised.value.completion.attempts == JSON_ATTEMPTS
    assert raised.value.completion.model == SERVED_MODEL


def test_a_failed_validation_counts_as_invalid() -> None:
    client, fake = deepseek([GOOD] * JSON_ATTEMPTS)

    def refuse(data: dict) -> None:
        raise ValueError("needs the key b")

    with pytest.raises(InvalidOutputError, match="needs the key b"):
        client.complete_json(SYSTEM, "a passage", refuse)

    assert len(fake.calls) == JSON_ATTEMPTS


@pytest.mark.parametrize("status", [401, 402])
def test_a_bad_key_or_no_balance_stops_the_run_at_once(status: int) -> None:
    client, fake = deepseek([api_error(status), GOOD])

    with pytest.raises(StopRunError, match=str(status)):
        client.complete_json(SYSTEM, "a passage", accept)

    assert len(fake.calls) == 1


def test_the_sdk_is_told_to_retry_429_5xx_and_timeouts() -> None:
    settings = keyed_settings()

    client = DeepSeek(settings).client

    assert client.max_retries == SDK_RETRIES
    assert str(client.base_url).rstrip("/") == settings.deepseek_base_url
    assert client.api_key == KEY


def test_a_rate_limit_left_after_the_sdk_retries_is_raised() -> None:
    client, fake = deepseek([api_error(429), GOOD])

    with pytest.raises(openai.RateLimitError):
        client.complete_json(SYSTEM, "a passage", accept)

    assert len(fake.calls) == 1


@pytest.mark.parametrize("key", [None, SecretStr("")])
def test_a_missing_key_is_named(key: SecretStr | None) -> None:
    with pytest.raises(MissingKeyError, match=KEY_SETTING):
        DeepSeek(Settings(deepseek_api_key=key), client=FakeDeepSeek([]))


def test_the_key_setting_is_the_one_the_settings_read(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(KEY_SETTING, KEY)

    assert Settings().deepseek_api_key.get_secret_value() == KEY


def test_the_key_never_appears_in_errors_or_logs(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    settings = keyed_settings()
    # A real server can repeat the key it refused.
    client, _ = deepseek([api_error(401, f"Incorrect API key provided: {KEY}")])

    with pytest.raises(StopRunError) as raised:
        client.complete_json(SYSTEM, "a passage", accept)

    assert KEY not in "".join(traceback.format_exception(raised.value))
    assert KEY not in caplog.text
    assert KEY not in repr(settings)
    assert KEY not in repr(client)


def test_the_fake_refuses_json_mode_without_the_word_json() -> None:
    client, fake = deepseek([GOOD])

    with pytest.raises(openai.BadRequestError):
        client.complete_json("Answer briefly.", "a passage", accept)

    assert len(fake.calls) == 1
