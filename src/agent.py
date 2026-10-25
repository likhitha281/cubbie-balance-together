from src.models import SlotProposal, StudentProfile
from src.privacy import create_shareable_proposal
from src.protocol import NegotiationMessage, respond_to_slot


class BalanceAgent:
    """
    Represents one student.

    The profile remains private to this agent.
    """

    def __init__(self, profile: StudentProfile):
        self._profile = profile

    @property
    def student_id(self) -> str:
        return self._profile.student_id

    def evaluate_slot(self, slot: str) -> SlotProposal:
        """
        Evaluate a candidate slot locally.

        Only a privacy-safe SlotProposal leaves the agent.
        """

        return create_shareable_proposal(
            self._profile,
            slot,
        )

    def respond_to_proposal(
        self,
        proposed_slot: str,
        candidate_slots: list[str],
    ) -> NegotiationMessage:

        current = self.evaluate_slot(proposed_slot)

        alternatives = [
            self.evaluate_slot(slot)
            for slot in candidate_slots
            if slot != proposed_slot
        ]

        feasible_alternatives = [
            proposal
            for proposal in alternatives
            if proposal.feasible
        ]

        best_alternative = None

        if feasible_alternatives:
            best_alternative = max(
                feasible_alternatives,
                key=lambda proposal: (
                    proposal.preference,
                    proposal.flexibility,
                ),
            )

        return respond_to_slot(
            current,
            best_alternative,
        )