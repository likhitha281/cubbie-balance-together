from src.agent import BalanceAgent
from src.models import PrivateConstraint, StudentProfile
from src.negotiation import negotiate


slots = [
    "Friday 7-9 PM",
    "Saturday 6-8 PM",
    "Sunday 6-8 PM",
]


student_a = BalanceAgent(
    StudentProfile(
        student_id="student-a",
        preferred_slots=["Friday 7-9 PM"],
        acceptable_slots=["Saturday 6-8 PM"],
        private_constraints=[
            PrivateConstraint(
                slot="Sunday 6-8 PM",
                reason="Important academic preparation",
                opportunity_cost=0.9,
            )
        ],
    )
)


student_b = BalanceAgent(
    StudentProfile(
        student_id="student-b",
        preferred_slots=["Saturday 6-8 PM"],
        acceptable_slots=[
            "Friday 7-9 PM",
            "Sunday 6-8 PM",
        ],
        private_constraints=[
            PrivateConstraint(
                slot="Friday 7-9 PM",
                reason="Needs protected preparation time",
                opportunity_cost=0.8,
            )
        ],
    )
)


student_c = BalanceAgent(
    StudentProfile(
        student_id="student-c",
        preferred_slots=["Sunday 6-8 PM"],
        acceptable_slots=["Saturday 6-8 PM"],
        private_constraints=[
            PrivateConstraint(
                slot="Friday 7-9 PM",
                reason="Paid work shift",
                hard_conflict=True,
                opportunity_cost=1.0,
            )
        ],
    )
)


agents = [
    student_a,
    student_b,
    student_c,
]


proposals = []

for slot in slots:
    for agent in agents:
        proposal = agent.evaluate_slot(slot)
        proposals.append(proposal)

        print(
            f"{proposal.student_id:10} | "
            f"{proposal.slot:18} | "
            f"feasible={str(proposal.feasible):5} | "
            f"preference={proposal.preference:.1f} | "
            f"cost={proposal.opportunity_cost}"
        )


print("\n--- Negotiation ---")

result = negotiate(proposals)

print(f"Selected: {result.slot}")
print(f"Score: {result.score}")
print(result.explanation)

if result.requires_human_confirmation:
    print("\nHuman confirmation required before scheduling.")

from src.coordinator import Coordinator


print("\n--- Agent-to-Agent Negotiation ---")

coordinator = Coordinator(
    agents=agents,
    candidate_slots=slots,
)

outcome = coordinator.negotiate(
    initial_slot="Friday 7-9 PM"
)

for round_record in outcome.rounds:

    print(
        f"\nRound {round_record.round_number}: "
        f"{round_record.proposed_slot}"
    )

    for response in round_record.responses:

        line = (
            f"  {response.sender_id}: "
            f"{response.response.value}"
        )

        if response.counter_slot:
            line += f" -> {response.counter_slot}"

        print(line)


print("\n--- Outcome ---")

if outcome.agreed_slot:
    print(
        f"Tentative agreement: "
        f"{outcome.agreed_slot}"
    )

    print(
        "Waiting for human confirmation "
        "from all participants."
    )

else:
    print(
        "No agreement reached within "
        "the negotiation limit."
    )

from src.fairness import (
    FairnessStrategy,
    choose_fair_slot,
)


print("\n--- Fairness Strategy Comparison ---")

for strategy in FairnessStrategy:

    result = choose_fair_slot(
        proposals,
        strategy,
    )

    print(f"\nStrategy: {strategy.value}")
    print(f"Selected: {result.slot}")
    print(f"Strategy score: {result.score}")
    print(f"Total utility: {result.total_utility}")
    print(f"Minimum utility: {result.minimum_utility}")
    print(f"Utility gap: {result.utility_gap}")