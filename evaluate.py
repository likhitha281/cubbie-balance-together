from dataclasses import dataclass

from src.fairness import FairnessStrategy, choose_fair_slot
from src.models import SlotProposal


@dataclass
class Scenario:
    name: str
    proposals: list[SlotProposal]


def p(
    student,
    slot,
    preference,
    feasible=True,
    flexibility=0.0,
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


scenarios = [
    Scenario(
        name="balanced_compromise",
        proposals=[
            p("a", "Friday", 1.0),
            p("b", "Friday", 0.6, cost="high"),
            p("c", "Friday", 0.0, feasible=False),

            p("a", "Saturday", 0.6),
            p("b", "Saturday", 1.0),
            p("c", "Saturday", 0.6),
        ],
    ),

    Scenario(
        name="majority_vs_fairness",
        proposals=[
            p("a", "Friday", 1.0),
            p("b", "Friday", 1.0),
            p("c", "Friday", 0.3),

            p("a", "Saturday", 0.7),
            p("b", "Saturday", 0.7),
            p("c", "Saturday", 0.7),
        ],
    ),

    Scenario(
        name="hard_constraint",
        proposals=[
            p("a", "Friday", 1.0),
            p("b", "Friday", 1.0),
            p("c", "Friday", 0.0, feasible=False),

            p("a", "Saturday", 0.6),
            p("b", "Saturday", 0.6),
            p("c", "Saturday", 0.6),
        ],
    ),

    Scenario(
        name="equal_preferences",
        proposals=[
            p("a", "Friday", 0.7),
            p("b", "Friday", 0.7),
            p("c", "Friday", 0.7),

            p("a", "Saturday", 0.6),
            p("b", "Saturday", 0.6),
            p("c", "Saturday", 0.6),
        ],
    ),
]


print("\n=== BALANCE TOGETHER EVALUATION ===")

for scenario in scenarios:

    print(f"\nScenario: {scenario.name}")

    for strategy in FairnessStrategy:

        result = choose_fair_slot(
            scenario.proposals,
            strategy,
        )

        print(
            f"{strategy.value:12} "
            f"slot={str(result.slot):10} "
            f"total={result.total_utility:.2f} "
            f"min={result.minimum_utility:.2f} "
            f"gap={result.utility_gap:.2f}"
        )