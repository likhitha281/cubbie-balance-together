from dataclasses import dataclass

from src.coordinator import CoordinationOutcome
from src.protocol import ResponseType


@dataclass(frozen=True)
class GroupMessage:
    sender: str
    text: str
    private: bool = False
    recipient: str | None = None


def opening_message() -> GroupMessage:
    return GroupMessage(
        sender="Cubbie",
        text=(
            "I'll check everyone's availability privately. "
            "I'll only share what the group needs to make the plan."
        ),
    )


def round_to_group_message(
    proposed_slot: str,
    responses,
) -> GroupMessage:
    """
    Translate protocol responses into a privacy-safe group message.

    Individual rejections and private reasons are intentionally
    not exposed.
    """

    accepts = sum(
        r.response == ResponseType.ACCEPT
        for r in responses
    )

    rejects = sum(
        r.response == ResponseType.REJECT
        for r in responses
    )

    counters = [
        r.counter_slot
        for r in responses
        if (
            r.response == ResponseType.COUNTER
            and r.counter_slot
        )
    ]

    total = len(responses)

    if accepts == total:
        return GroupMessage(
            sender="Cubbie",
            text=f"{proposed_slot} works for everyone.",
        )

    if rejects:
        if counters:
            best_counter = max(
                set(counters),
                key=counters.count,
            )

            return GroupMessage(
                sender="Cubbie",
                text=(
                    f"{proposed_slot} doesn't work for everyone. "
                    f"{best_counter} looks like a better option."
                ),
            )

        return GroupMessage(
            sender="Cubbie",
            text=(
                f"{proposed_slot} doesn't work for everyone. "
                "I'll check another option."
            ),
        )

    if counters:
        best_counter = max(
            set(counters),
            key=counters.count,
        )

        return GroupMessage(
            sender="Cubbie",
            text=(
                f"{proposed_slot} could work, but "
                f"{best_counter} is a better overall fit."
            ),
        )

    return GroupMessage(
        sender="Cubbie",
        text="I'm checking another option.",
    )


def outcome_to_group_message(
    outcome: CoordinationOutcome,
) -> GroupMessage:

    if outcome.agreed_slot is None:
        return GroupMessage(
            sender="Cubbie",
            text=(
                "I couldn't find a time that works for everyone "
                "without breaking someone's constraints. "
                "Want to try a different day or shorter plan?"
            ),
        )

    return GroupMessage(
        sender="Cubbie",
        text=(
            f"{outcome.agreed_slot} looks like the best fit. "
            "Want me to ask everyone privately to confirm?"
        ),
    )


def private_confirmation_message(
    student_id: str,
    slot: str,
) -> GroupMessage:
    return GroupMessage(
        sender="Cubbie",
        recipient=student_id,
        private=True,
        text=(
            f"The group is considering {slot}. "
            "It fits the constraints you've shared with me. "
            "Confirm, decline, or suggest another time?"
        ),
    )


def final_confirmation_message(
    slot: str,
) -> GroupMessage:
    return GroupMessage(
        sender="Cubbie",
        text=f"Everyone confirmed 🎉 {slot} is on.",
    )


def privacy_response(question: str) -> GroupMessage:
    """
    Handle common attempts to extract another student's
    private scheduling information.
    """

    normalized = question.lower()

    identity_requests = (
        "who can't" in normalized
        or "who cant" in normalized
        or "who rejected" in normalized
        or "who is busy" in normalized
    )

    reason_requests = (
        "why can't" in normalized
        or "why cant" in normalized
        or "why doesn't" in normalized
        or "why doesnt" in normalized
    )

    if identity_requests:
        return GroupMessage(
            sender="Cubbie",
            text=(
                "I keep individual availability private by default. "
                "I can coordinate around it without identifying anyone."
            ),
        )

    if reason_requests:
        return GroupMessage(
            sender="Cubbie",
            text=(
                "That conflicts with private constraints for the group. "
                "I can find a better time, but I won't share anyone's "
                "private schedule details unless they choose to."
            ),
        )

    return GroupMessage(
        sender="Cubbie",
        text=(
            "I only share the minimum information needed "
            "to coordinate the group."
        ),
    )