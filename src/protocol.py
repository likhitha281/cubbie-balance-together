from dataclasses import dataclass
from enum import Enum

from src.models import SlotProposal


class ResponseType(str, Enum):
    ACCEPT = "ACCEPT"
    REJECT = "REJECT"
    COUNTER = "COUNTER"


@dataclass(frozen=True)
class NegotiationMessage:
    sender_id: str
    response: ResponseType
    proposed_slot: str
    counter_slot: str | None = None


def respond_to_slot(
    proposal: SlotProposal,
    best_alternative: SlotProposal | None = None,
) -> NegotiationMessage:
    """
    Convert a privacy-safe slot evaluation into a negotiation response.

    No private reason is included in the message.
    """

    if not proposal.feasible:
        return NegotiationMessage(
            sender_id=proposal.student_id,
            response=ResponseType.REJECT,
            proposed_slot=proposal.slot,
        )

    # Strong enough to accept directly.
    if (
        proposal.preference >= 0.6
        and proposal.opportunity_cost != "high"
    ):
        return NegotiationMessage(
            sender_id=proposal.student_id,
            response=ResponseType.ACCEPT,
            proposed_slot=proposal.slot,
        )

    # Current slot is possible but costly.
    # Counter with a better feasible alternative if one exists.
    if (
        best_alternative
        and best_alternative.feasible
        and best_alternative.preference > proposal.preference
    ):
        return NegotiationMessage(
            sender_id=proposal.student_id,
            response=ResponseType.COUNTER,
            proposed_slot=proposal.slot,
            counter_slot=best_alternative.slot,
        )

    return NegotiationMessage(
        sender_id=proposal.student_id,
        response=ResponseType.ACCEPT,
        proposed_slot=proposal.slot,
    )