"""The librarian panel's two endpoints: fetching the implicit conversation,
and sending a message that streams a canned reply back over SSE.
"""

import json

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models import Message


def _sse_events(response) -> list[dict]:
    """Parse a `text/event-stream` body into the JSON payload of each frame."""
    events = []
    for line in response.text.split("\n\n"):
        if line.startswith("data: "):
            events.append(json.loads(line.removeprefix("data: ")))
    return events


def test_fetching_the_conversation_creates_it_on_first_access(client: TestClient) -> None:
    response = client.get("/conversations/mine")

    assert response.status_code == 200
    body = response.json()
    assert body["messages"] == []


def test_fetching_twice_returns_the_same_conversation(client: TestClient) -> None:
    first = client.get("/conversations/mine").json()
    second = client.get("/conversations/mine").json()

    assert first["id"] == second["id"]


def test_two_readers_get_two_different_conversations(
    client: TestClient, other_client: TestClient
) -> None:
    mine = client.get("/conversations/mine").json()
    theirs = other_client.get("/conversations/mine").json()

    assert mine["id"] != theirs["id"]


def test_sending_a_message_persists_it_and_streams_a_reply(client: TestClient) -> None:
    conversation_id = client.get("/conversations/mine").json()["id"]

    response = client.post(
        f"/conversations/{conversation_id}/messages", json={"content": "What should I read next?"}
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = _sse_events(response)
    assert events[0]["type"] == "tool_status"
    assert events[-1]["type"] == "done"
    assert isinstance(events[-1]["message_id"], int)


def test_the_reader_message_and_the_reply_both_land_in_the_conversation(
    client: TestClient, session: Session
) -> None:
    conversation_id = client.get("/conversations/mine").json()["id"]
    client.post(f"/conversations/{conversation_id}/messages", json={"content": "next?"})

    messages = session.exec(select(Message).where(Message.conversation_id == conversation_id)).all()

    assert [m.role for m in messages] == ["user", "librarian"]
    assert messages[0].content == "next?"


def test_fetching_after_sending_shows_the_full_history(client: TestClient) -> None:
    conversation_id = client.get("/conversations/mine").json()["id"]
    client.post(f"/conversations/{conversation_id}/messages", json={"content": "next?"})

    body = client.get("/conversations/mine").json()

    assert len(body["messages"]) == 2
    assert body["messages"][0]["role"] == "user"
    assert body["messages"][1]["role"] == "librarian"


def test_sending_to_another_readers_conversation_is_a_404(
    client: TestClient, other_client: TestClient
) -> None:
    theirs = other_client.get("/conversations/mine").json()["id"]

    response = client.post(f"/conversations/{theirs}/messages", json={"content": "hi"})

    assert response.status_code == 404


def test_sending_blank_content_is_rejected(client: TestClient) -> None:
    conversation_id = client.get("/conversations/mine").json()["id"]

    response = client.post(f"/conversations/{conversation_id}/messages", json={"content": "   "})

    assert response.status_code == 422


def test_signed_out_is_401(anon_client: TestClient) -> None:
    response = anon_client.get("/conversations/mine")
    assert response.status_code == 401


def test_sse_frames_are_not_ascii_escaped(client: TestClient) -> None:
    """The wire format's ellipsis and middle dot are load-bearing for a later
    task's client-side parser, so the raw bytes must carry the real
    characters rather than a `\\uXXXX` escape.
    """
    conversation_id = client.get("/conversations/mine").json()["id"]

    response = client.post(f"/conversations/{conversation_id}/messages", json={"content": "next?"})

    assert "…" in response.text
    assert "\\u2026" not in response.text
