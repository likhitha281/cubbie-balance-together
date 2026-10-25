from src.group_chat import (
    privacy_response,
    private_confirmation_message,
    round_to_group_message,
)
from src.protocol import NegotiationMessage, ResponseType


def test_group_message_does_not_identify_rejecting_student():
    responses = [
        NegotiationMessage(
            sender_id="maya",
            response=ResponseType.ACCEPT,
            proposed_slot="Friday",
        ),
        NegotiationMessage(
            sender_id="alex",
            response=ResponseType.REJECT,
            proposed_slot="Friday",
        ),
    ]

    message = round_to_group_message(
        "Friday",
        responses,
    )

    text = message.text.lower()

    assert "alex" not in text
    assert "maya" not in text
    assert "doesn't work for everyone" in text


def test_group_message_does_not_expose_private_reason():
    secret = "work shift at hospital"

    responses = [
        NegotiationMessage(
            sender_id="student-a",
            response=ResponseType.ACCEPT,
            proposed_slot="Friday",
        ),
        NegotiationMessage(
            sender_id="student-b",
            response=ResponseType.REJECT,
            proposed_slot="Friday",
        ),
    ]

    message = round_to_group_message(
        "Friday",
        responses,
    )

    assert secret not in message.text.lower()


def test_who_cannot_make_it_is_private():
    response = privacy_response(
        "Who can't make Friday?"
    )

    assert "individual availability private" in response.text


def test_why_slot_fails_does_not_reveal_reason():
    response = privacy_response(
        "Why can't Friday work?"
    )

    text = response.text.lower()

    assert "private constraints" in text
    assert "work" not in text
    assert "exam" not in text


def test_confirmation_is_private():
    message = private_confirmation_message(
        "student-a",
        "Saturday 6-8 PM",
    )

    assert message.private is True
    assert message.recipient == "student-a"