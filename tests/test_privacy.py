from dataclasses import asdict

from src.agent import BalanceAgent
from src.models import PrivateConstraint, StudentProfile


def test_private_reason_does_not_leave_agent():
    secret = "CSE 543 exam Saturday morning"

    agent = BalanceAgent(
        StudentProfile(
            student_id="student-a",
            acceptable_slots=["Friday 7-9 PM"],
            private_constraints=[
                PrivateConstraint(
                    slot="Friday 7-9 PM",
                    reason=secret,
                    opportunity_cost=0.9,
                )
            ],
        )
    )

    proposal = agent.evaluate_slot("Friday 7-9 PM")

    serialized = str(asdict(proposal))

    assert secret not in serialized
    assert "CSE 543" not in serialized

def test_hard_conflict_only_exposes_infeasibility():
    secret = "Paid work shift at private employer"

    agent = BalanceAgent(
        StudentProfile(
            student_id="student-b",
            private_constraints=[
                PrivateConstraint(
                    slot="Friday 7-9 PM",
                    reason=secret,
                    hard_conflict=True,
                    opportunity_cost=1.0,
                )
            ],
        )
    )

    proposal = agent.evaluate_slot("Friday 7-9 PM")

    assert proposal.feasible is False
    assert proposal.opportunity_cost == "high"
    assert secret not in str(asdict(proposal))