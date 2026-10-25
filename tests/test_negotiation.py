from src.models import SlotProposal
from src.negotiation import negotiate


def proposal(
    student,
    slot,
    feasible=True,
    preference=0.6,
    flexibility=0.5,
    cost="low",
):
    return SlotProposal(
        student_id=student,
        slot=slot,
        feasible=feasible,
        preference=preference,
        flexibility=flexibility,
        opportunity_cost=cost,
    )


def test_hard_conflict_eliminates_slot():
    proposals = [
        proposal("a", "Friday", preference=1.0),
        proposal("b", "Friday", preference=1.0),
        proposal("c", "Friday", feasible=False),

        proposal("a", "Saturday"),
        proposal("b", "Saturday"),
        proposal("c", "Saturday"),
    ]

    result = negotiate(proposals)

    assert result.slot == "Saturday"
    assert result.accepted is True


def test_no_feasible_slot_requires_new_negotiation():
    proposals = [
        proposal("a", "Friday"),
        proposal("b", "Friday", feasible=False),

        proposal("a", "Saturday", feasible=False),
        proposal("b", "Saturday"),
    ]

    result = negotiate(proposals)

    assert result.accepted is False
    assert result.slot is None


def test_result_requires_human_confirmation():
    proposals = [
        proposal("a", "Saturday"),
        proposal("b", "Saturday"),
    ]

    result = negotiate(proposals)

    assert result.requires_human_confirmation is True