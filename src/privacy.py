from src.models import PrivateConstraint, SlotProposal, StudentProfile


def opportunity_cost_bucket(value: float) -> str:
    """Convert private numeric cost into a coarse shareable category."""

    if value < 0.34:
        return "low"

    if value < 0.67:
        return "medium"

    return "high"


def get_constraint(
    profile: StudentProfile,
    slot: str,
) -> PrivateConstraint | None:

    for constraint in profile.private_constraints:
        if constraint.slot == slot:
            return constraint

    return None


def create_shareable_proposal(
    profile: StudentProfile,
    slot: str,
) -> SlotProposal:
    """
    Convert private student context into the minimum information
    necessary for negotiation.

    Private reasons never leave this function.
    """

    constraint = get_constraint(profile, slot)

    if constraint and constraint.hard_conflict:
        return SlotProposal(
            student_id=profile.student_id,
            slot=slot,
            feasible=False,
            preference=0.0,
            flexibility=0.0,
            opportunity_cost="high",
        )

    if slot in profile.preferred_slots:
        preference = 1.0
    elif slot in profile.acceptable_slots:
        preference = 0.6
    else:
        preference = 0.3

    private_cost = (
        constraint.opportunity_cost
        if constraint
        else 0.0
    )

    flexibility = max(0.0, 1.0 - private_cost)

    return SlotProposal(
        student_id=profile.student_id,
        slot=slot,
        feasible=True,
        preference=preference,
        flexibility=flexibility,
        opportunity_cost=opportunity_cost_bucket(private_cost),
    )