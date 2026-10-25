from dataclasses import dataclass, field

from src.agent import BalanceAgent
from src.protocol import NegotiationMessage, ResponseType


@dataclass
class NegotiationRound:
    round_number: int
    proposed_slot: str
    responses: list[NegotiationMessage] = field(default_factory=list)


@dataclass
class CoordinationOutcome:
    agreed_slot: str | None
    rounds: list[NegotiationRound]
    requires_human_confirmation: bool = True


class Coordinator:
    """
    Coordinates negotiation without receiving private student profiles.
    """

    def __init__(
        self,
        agents: list[BalanceAgent],
        candidate_slots: list[str],
    ):
        self.agents = agents
        self.candidate_slots = candidate_slots

    def negotiate(
        self,
        initial_slot: str,
        max_rounds: int = 5,
    ) -> CoordinationOutcome:

        proposed_slot = initial_slot
        rounds = []
        attempted = set()

        for round_number in range(1, max_rounds + 1):

            attempted.add(proposed_slot)

            responses = [
                agent.respond_to_proposal(
                    proposed_slot,
                    self.candidate_slots,
                )
                for agent in self.agents
            ]

            round_record = NegotiationRound(
                round_number=round_number,
                proposed_slot=proposed_slot,
                responses=responses,
            )

            rounds.append(round_record)

            # Everybody accepts.
            if all(
                response.response == ResponseType.ACCEPT
                for response in responses
            ):
                return CoordinationOutcome(
                    agreed_slot=proposed_slot,
                    rounds=rounds,
                )

            # Gather counterproposals.
            counters = [
                response.counter_slot
                for response in responses
                if (
                    response.response == ResponseType.COUNTER
                    and response.counter_slot is not None
                )
            ]

            # Prefer the most common counterproposal.
            if counters:
                proposed_slot = max(
                    set(counters),
                    key=counters.count,
                )

                if proposed_slot not in attempted:
                    continue

            # Otherwise try another unattempted candidate.
            remaining = [
                slot
                for slot in self.candidate_slots
                if slot not in attempted
            ]

            if not remaining:
                break

            proposed_slot = remaining[0]

        return CoordinationOutcome(
            agreed_slot=None,
            rounds=rounds,
        )