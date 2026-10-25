from collections import defaultdict
from typing import Iterable

from src.models import NegotiationResult, SlotProposal


COST_PENALTY = {
    "low": 0.0,
    "medium": 0.2,
    "high": 0.5,
}


def proposal_utility(proposal: SlotProposal) -> float:
    """
    Utility visible to the coordinator.

    The coordinator operates only on sanitized proposals.
    """

    if not proposal.feasible:
        return float("-inf")

    penalty = COST_PENALTY[proposal.opportunity_cost]

    return (
        proposal.preference
        + 0.25 * proposal.flexibility
        - penalty
    )


def negotiate(
    proposals: Iterable[SlotProposal],
) -> NegotiationResult:

    grouped = defaultdict(list)

    for proposal in proposals:
        grouped[proposal.slot].append(proposal)

    best_slot = None
    best_score = float("-inf")

    for slot, slot_proposals in grouped.items():

        # A single hard conflict eliminates the slot.
        if not all(p.feasible for p in slot_proposals):
            continue

        utilities = [
            proposal_utility(p)
            for p in slot_proposals
        ]

        total_utility = sum(utilities)

        # Fairness penalty:
        # avoid solutions where one student gets a terrible outcome.
        unfairness = max(utilities) - min(utilities)

        score = total_utility - 0.5 * unfairness

        if score > best_score:
            best_score = score
            best_slot = slot

    if best_slot is None:
        return NegotiationResult(
            slot=None,
            accepted=False,
            score=0.0,
            explanation=(
                "No candidate slot satisfies every student's "
                "hard constraints."
            ),
        )

    return NegotiationResult(
        slot=best_slot,
        accepted=True,
        score=round(best_score, 3),
        explanation=(
            f"{best_slot} provides the strongest feasible "
            "compromise across the participating agents."
        ),
    )