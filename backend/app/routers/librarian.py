import json
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app import librarian, library
from app.auth import current_user
from app.db import get_session
from app.logging_config import get_logger
from app.models import ConversationRead, MessageCreate, User

router = APIRouter(prefix="/conversations", tags=["librarian"])

log = get_logger(__name__)


@router.get("/mine", response_model=ConversationRead)
def get_my_conversation(
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> ConversationRead:
    """The reader's one implicit conversation, created on first access."""
    conversation = library.my_conversation(session, user)
    messages = library.conversation_messages(session, conversation.id)
    return ConversationRead(id=conversation.id, messages=messages)


@router.post("/{conversation_id}/messages")
def send_message(
    conversation_id: int,
    message: MessageCreate,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> StreamingResponse:
    """Persist the reader's message, then stream the librarian's canned reply."""
    if not message.content.strip():
        raise HTTPException(status_code=422, detail="Message must not be empty")

    try:
        library.add_question(session, conversation_id, user, message.content)
    except library.ConversationNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Conversation not found") from exc
    # The question itself is private, so only its length is logged.
    log.info(
        "User %s asked the librarian a question",
        user.id,
        extra={
            "event": "librarian_question",
            "conversation_id": conversation_id,
            "user_id": user.id,
            "length": len(message.content),
        },
    )

    def stream() -> Iterator[str]:
        # A fresh session, opened and closed entirely inside this generator:
        # `session` above belongs to the request and is gone by the time
        # this code runs, since a StreamingResponse's body is read after
        # the route handler has already returned.
        with Session(session.get_bind()) as stream_session:
            reply_text = ""
            meta: dict = {}
            for chunk in librarian.generate_reply(stream_session, message.content):
                if chunk["type"] == "token":
                    reply_text += chunk["text"]
                elif chunk["type"] == "citation":
                    meta["citation"] = {"book_id": chunk["book_id"], "title": chunk["title"]}
                elif chunk["type"] == "tool_status" and chunk["status"] == "done":
                    meta["tool_call"] = {"summary": chunk["summary"]}
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

            reply = library.add_reply(stream_session, conversation_id, reply_text.strip(), meta)
            done = {"type": "done", "message_id": reply.id}
            yield f"data: {json.dumps(done, ensure_ascii=False)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
