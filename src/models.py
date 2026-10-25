from dataclasses import dataclass, field
from typing import List


@dataclass
class PrivateConstraint:
    """
    Information that stays inside a student's personal agent.
    """

    slot: str
    reason: str
    hard_conflict: bool = False
    opportunity_cost: float = 0.0


@dataclass
class StudentProfile:
    """
    Private state owned by one student's Balance agent.
    """

    student_id: str
    preferred_slots: List[str] = field(default_factory=list)
    acceptable_slots: List[str] = field(default_factory=list)
    private_constraints: List[PrivateConstraint] = field(default_factory=list)


@dataclass(frozen=True)
class SlotProposal:
    """
    Privacy-safe information that another agent/coordinator may receive.
    """

    student_id: str
    slot: str
    feasible: bool
    preference: float
    flexibility: float
    opportunity_cost: str


@dataclass
class NegotiationResult:
    slot: str | None
    accepted: bool
    score: float
    explanation: str
    requires_human_confirmation: bool = True