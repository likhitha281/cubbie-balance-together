from src.fairness import FairnessStrategy, choose_fair_slot
from src.models import SlotProposal


def make_proposal(student, slot, preference):
    return SlotProposal(
        student_id=student,
        slot=slot,
        feasible=True,
        preference=preference,
        flexibility=0.0,
        opportunity_cost="low",
    )


proposals = [
    # Option A:
    # Excellent for A and B, poor for C.
    make_proposal("student-a", "Friday 7-9 PM", 1.0),
    make_proposal("student-b", "Friday 7-9 PM", 1.0),
    make_proposal("student-c", "Friday 7-9 PM", 0.3),

    # Option B:
    # Nobody gets their favorite, but everybody gets
    # a reasonably good outcome.
    make_proposal("student-a", "Saturday 6-8 PM", 0.7),
    make_proposal("student-b", "Saturday 6-8 PM", 0.7),
    make_proposal("student-c", "Saturday 6-8 PM", 0.7),
]


print("\n=== FAIRNESS STRESS TEST ===")

print("\nFriday:")
print("A = 1.00")
print("B = 1.00")
print("C = 0.30")

print("\nSaturday:")
print("A = 0.70")
print("B = 0.70")
print("C = 0.70")


for strategy in FairnessStrategy:

    result = choose_fair_slot(
        proposals,
        strategy,
    )

    print("\n-------------------------")
    print(f"Strategy: {strategy.value}")
    print(f"Selected: {result.slot}")
    print(f"Score: {result.score}")
    print(f"Total utility: {result.total_utility}")
    print(f"Minimum utility: {result.minimum_utility}")
    print(f"Utility gap: {result.utility_gap}")