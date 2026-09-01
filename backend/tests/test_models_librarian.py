"""Conversation and Message: the tables the librarian panel persists to."""

from sqlmodel import Session

from app.models import Conversation, Message, User


def test_a_conversation_belongs_to_one_user(session: Session, user: User) -> None:
    conversation = Conversation(user_id=user.id)
    session.add(conversation)
    session.commit()
    session.refresh(conversation)

    assert conversation.id is not None
    assert conversation.title is None
    assert conversation.created_at is not None


def test_a_message_carries_its_role_and_meta(session: Session, user: User) -> None:
    conversation = Conversation(user_id=user.id)
    session.add(conversation)
    session.commit()
    session.refresh(conversation)

    message = Message(
        conversation_id=conversation.id,
        role="librarian",
        content="Dune looks like a good next read.",
        meta={"citation": {"book_id": 1, "title": "Dune"}},
    )
    session.add(message)
    session.commit()
    session.refresh(message)

    assert message.role == "librarian"
    assert message.meta == {"citation": {"book_id": 1, "title": "Dune"}}
    assert message.created_at is not None


def test_a_message_defaults_to_empty_meta(session: Session, user: User) -> None:
    conversation = Conversation(user_id=user.id)
    session.add(conversation)
    session.commit()
    session.refresh(conversation)

    message = Message(conversation_id=conversation.id, role="user", content="Hi")
    session.add(message)
    session.commit()
    session.refresh(message)

    assert message.meta == {}
