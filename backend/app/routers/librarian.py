import json
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, col, select

from app import librarian
from app.auth import current_user
from app.db import get_session
from app.models import Conversation, ConversationRead, Message, MessageCreate, User

router = APIRouter(prefix="/conversations", tags=["librarian"])


def _get_or_create_conversation(session: Session, user: User) -> Conversation:
    conversation = session.exec(select(Conversation).where(Conversation.user_id == user.id)).first()
    if conversation is not None:
        return conversation
    conversation = Conversation(user_id=user.id)
    session.add(conversation)
    session.commit()
    session.refresh(conversation)
    return conversation


@router.get("/mine", response_model=ConversationRead)
def get_my_conversation(
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> ConversationRead:
    """The reader's one implicit conversation, created on first access."""
    conversation = _get_or_create_conversation(session, user)
    messages = session.exec(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(col(Message.created_at), col(Message.id))
    ).all()
    return ConversationRead(id=conversation.id, messages=list(messages))


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

    conversation = session.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    session.add(Message(conversation_id=conversation_id, role="user", content=message.content))
    session.commit()

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

            reply = Message(
                conversation_id=conversation_id,
                role="librarian",
                content=reply_text.strip(),
                meta=meta,
            )
            stream_session.add(reply)
            stream_session.commit()
            stream_session.refresh(reply)
            done = {"type": "done", "message_id": reply.id}
            yield f"data: {json.dumps(done, ensure_ascii=False)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
