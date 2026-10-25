from dataclasses import asdict

from src.agent import BalanceAgent
from src.coordinator import Coordinator
from src.models import PrivateConstraint, StudentProfile
from src.protocol import ResponseType


def make_agents():
    student_a = BalanceAgent(
        StudentProfile(
            student_id="student-a",
            preferred_slots=["Friday"],
            acceptable_slots=["Saturday"],
        )
    )

    student_b = BalanceAgent(
        StudentProfile(
            student_id="student-b",
            preferred_slots=["Saturday"],
            acceptable_slots=["Friday"],
            private_constraints=[
                PrivateConstraint(
                    slot="Friday",
                    reason="Private exam preparation",
                    opportunity_cost=0.9,
                )
            ],
        )
    )

    student_c = BalanceAgent(
        StudentProfile(
            student_id="student-c",
            preferred_slots=["Saturday"],
            private_constraints=[
                PrivateConstraint(
                    slot="Friday",
                    reason="Private paid work shift",
                    hard_conflict=True,
                    opportunity_cost=1.0,
                )
            ],
        )
    )

    return student_a, student_b, student_c


def test_private_reason_never_appears_in_protocol_message():
    _, student_b, _ = make_agents()

    message = student_b.respond_to_proposal(
        "Friday",
        ["Friday", "Saturday"],
    )

    serialized = str(asdict(message))

    assert "exam" not in serialized.lower()
    assert "preparation" not in serialized.lower()


def test_hard_conflict_produces_reject_without_reason():
    _, _, student_c = make_agents()

    message = student_c.respond_to_proposal(
        "Friday",
        ["Friday", "Saturday"],
    )

    assert message.response == ResponseType.REJECT

    serialized = str(asdict(message))

    assert "work" not in serialized.lower()
    assert "shift" not in serialized.lower()


def test_costly_slot_can_generate_counterproposal():
    _, student_b, _ = make_agents()

    message = student_b.respond_to_proposal(
        "Friday",
        ["Friday", "Saturday"],
    )

    assert message.response == ResponseType.COUNTER
    assert message.counter_slot == "Saturday"


def test_agents_can_reach_second_round_agreement():
    agents = list(make_agents())

    coordinator = Coordinator(
        agents=agents,
        candidate_slots=["Friday", "Saturday"],
    )

    outcome = coordinator.negotiate(
        initial_slot="Friday",
    )

    assert outcome.agreed_slot == "Saturday"
    assert len(outcome.rounds) == 2

    assert all(
        response.response == ResponseType.ACCEPT
        for response in outcome.rounds[1].responses
    )


def test_agent_agreement_still_requires_human_confirmation():
    agents = list(make_agents())

    coordinator = Coordinator(
        agents=agents,
        candidate_slots=["Friday", "Saturday"],
    )

    outcome = coordinator.negotiate(
        initial_slot="Friday",
    )

    assert outcome.agreed_slot == "Saturday"
    assert outcome.requires_human_confirmation is True