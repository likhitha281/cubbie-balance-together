from dataclasses import dataclass
from enum import Enum
from math import prod

from src.models import SlotProposal
from src.negotiation import proposal_utility


class FairnessStrategy(str, Enum):
    UTILITARIAN = "utilitarian"
    MAX_MIN = "max_min"
    NASH = "nash"


@dataclass
class FairnessResult:
    slot: str | None
    strategy: FairnessStrategy
    score: float
    total_utility: float
    minimum_utility: float
    utility_gap: float


def evaluate_slot(
    proposals: list[SlotProposal],
    strategy: FairnessStrategy,
) -> float:
    """
    Evaluate one candidate slot using only privacy-safe proposals.
    """

    if not proposals or not all(p.feasible for p in proposals):
        return float("-inf")

    utilities = [proposal_utility(p) for p in proposals]

    if strategy == FairnessStrategy.UTILITARIAN:
        return sum(utilities)

    if strategy == FairnessStrategy.MAX_MIN:
        return min(utilities)

    if strategy == FairnessStrategy.NASH:
        # Shift utilities above zero so products remain meaningful.
        epsilon = 0.01
        shifted = [max(u, 0.0) + epsilon for u in utilities]
        return prod(shifted)

    raise ValueError(f"Unknown strategy: {strategy}")


def choose_fair_slot(
    proposals: list[SlotProposal],
    strategy: FairnessStrategy,
) -> FairnessResult:

    slots = sorted({p.slot for p in proposals})

    best_slot = None
    best_score = float("-inf")
    best_utilities = []

    for slot in slots:
        slot_proposals = [
            p for p in proposals
            if p.slot == slot
        ]

        score = evaluate_slot(
            slot_proposals,
            strategy,
        )

        if score > best_score:
            best_score = score
            best_slot = slot

            if score != float("-inf"):
                best_utilities = [
                    proposal_utility(p)
                    for p in slot_proposals
                ]

    if best_slot is None:
        return FairnessResult(
            slot=None,
            strategy=strategy,
            score=0.0,
            total_utility=0.0,
            minimum_utility=0.0,
            utility_gap=0.0,
        )

    return FairnessResult(
        slot=best_slot,
        strategy=strategy,
        score=round(best_score, 3),
        total_utility=round(sum(best_utilities), 3),
        minimum_utility=round(min(best_utilities), 3),
        utility_gap=round(
            max(best_utilities) - min(best_utilities),
            3,
        ),
    )