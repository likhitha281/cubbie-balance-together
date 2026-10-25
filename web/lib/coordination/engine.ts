export type ConstraintType = "hard" | "soft";

export type OpportunityCostBand =
  | "low"
  | "medium"
  | "high";

export type PrivateConstraint = {
  start_time: string;
  end_time: string;
  constraint_type: ConstraintType;
  opportunity_cost: number;
};

export type CandidateSlot = {
  start: Date;
  end: Date;
};

export type SanitizedProposal = {
  slotStart: string;
  slotEnd: string;
  feasible: boolean;
  preference: number;
  flexibility: number;
  opportunityCost: OpportunityCostBand;
};

export type GroupProposal = {
  memberId: string;
  slotStart: string;
  slotEnd: string;
  feasible: boolean;
  preference: number;
  flexibility: number;
  opportunityCost: OpportunityCostBand;
};

export type RankedSlot = {
  start: string;
  end: string;
  totalUtility: number;
  minimumUtility: number;
  utilityGap: number;
  feasibleForEveryone: boolean;
  score: number;
};

/* ============================================================
   CANDIDATE GENERATION
   ============================================================ */

export function generateWeekendCandidates(
  now: Date,
  durationMinutes = 120
): CandidateSlot[] {
  const candidates: CandidateSlot[] = [];

  const friday = new Date(now);

  const currentDay =
    friday.getDay();

  let daysUntilFriday =
    (5 - currentDay + 7) % 7;

  /*
   * If it is already Friday evening,
   * coordinate for the following weekend.
   */
  if (
    daysUntilFriday === 0 &&
    friday.getHours() >= 20
  ) {
    daysUntilFriday = 7;
  }

  friday.setDate(
    friday.getDate() +
      daysUntilFriday
  );

  /*
   * Friday, Saturday and Sunday.
   *
   * Generate several evening options
   * instead of hardcoding one slot.
   */
  for (
    let dayOffset = 0;
    dayOffset < 3;
    dayOffset++
  ) {
    const day =
      new Date(friday);

    day.setDate(
      friday.getDate() +
        dayOffset
    );

    for (
      const hour of [17, 18, 19]
    ) {
      const start =
        new Date(day);

      start.setHours(
        hour,
        0,
        0,
        0
      );

      const end =
        new Date(
          start.getTime() +
            durationMinutes *
              60 *
              1000
        );

      if (start > now) {
        candidates.push({
          start,
          end,
        });
      }
    }
  }

  return candidates;
}

/* ============================================================
   PERSONAL AGENT EVALUATION
   ============================================================ */

export function evaluateCandidates(
  candidates: CandidateSlot[],
  constraints: PrivateConstraint[]
): SanitizedProposal[] {
  return candidates.map(
    (candidate) =>
      evaluateCandidate(
        candidate,
        constraints
      )
  );
}

function evaluateCandidate(
  candidate: CandidateSlot,
  constraints: PrivateConstraint[]
): SanitizedProposal {
  let feasible = true;
  let preference = 1;
  let flexibility = 1;
  let maximumCost = 0;

  for (
    const constraint
    of constraints
  ) {
    const constraintStart =
      new Date(
        constraint.start_time
      );

    const constraintEnd =
      new Date(
        constraint.end_time
      );

    const overlaps =
      candidate.start <
        constraintEnd &&
      candidate.end >
        constraintStart;

    if (!overlaps) {
      continue;
    }

    const cost =
      clamp(
        Number(
          constraint.opportunity_cost
        ),
        0,
        1
      );

    maximumCost =
      Math.max(
        maximumCost,
        cost
      );

    /*
     * Hard constraint:
     *
     * This slot is impossible.
     *
     * Notice that the reason for the
     * constraint is not part of this
     * function's output.
     */
    if (
      constraint.constraint_type ===
      "hard"
    ) {
      feasible = false;
      preference = 0;
      flexibility = 0;

      break;
    }

    /*
     * Soft constraint:
     *
     * The slot remains possible,
     * but its utility decreases.
     */
    preference =
      Math.min(
        preference,
        Math.max(
          0.1,
          1 - cost
        )
      );

    flexibility =
      Math.min(
        flexibility,
        Math.max(
          0.1,
          1 - cost * 0.7
        )
      );
  }

  return {
    slotStart:
      candidate.start
        .toISOString(),

    slotEnd:
      candidate.end
        .toISOString(),

    feasible,

    preference:
      round(preference),

    flexibility:
      round(flexibility),

    opportunityCost:
      opportunityCostBand(
        maximumCost
      ),
  };
}

/* ============================================================
   GROUP FAIRNESS
   ============================================================ */

export function rankGroupSlots(
  proposals: GroupProposal[],
  expectedMembers: number
): RankedSlot[] {
  const grouped =
    new Map<
      string,
      GroupProposal[]
    >();

  for (
    const proposal
    of proposals
  ) {
    const key =
      `${proposal.slotStart}|${proposal.slotEnd}`;

    const existing =
      grouped.get(key) ?? [];

    existing.push(
      proposal
    );

    grouped.set(
      key,
      existing
    );
  }

  const results:
    RankedSlot[] = [];

  for (
    const [
      key,
      slotProposals,
    ] of grouped.entries()
  ) {
    const uniqueMembers =
      new Set(
        slotProposals.map(
          (proposal) =>
            proposal.memberId
        )
      );

    /*
     * Do not rank a slot until all
     * joined members have evaluated it.
     */
    if (
      uniqueMembers.size <
      expectedMembers
    ) {
      continue;
    }

    const [
      start,
      end,
    ] = key.split("|");

    const feasibleForEveryone =
      slotProposals.every(
        (proposal) =>
          proposal.feasible
      );

    const utilities =
      slotProposals.map(
        proposalUtility
      );

    const totalUtility =
      utilities.reduce(
        (sum, value) =>
          sum + value,
        0
      );

    const minimumUtility =
      Math.min(
        ...utilities
      );

    const maximumUtility =
      Math.max(
        ...utilities
      );

    const utilityGap =
      maximumUtility -
      minimumUtility;

    /*
     * Fairness-aware objective:
     *
     * reward total satisfaction
     * +
     * protect the worst-off member
     * -
     * penalize unequal burden
     *
     * Hard-conflict slots can never win.
     */
    const score =
      feasibleForEveryone
        ? totalUtility +
          minimumUtility -
          utilityGap
        : Number.NEGATIVE_INFINITY;

    results.push({
      start,
      end,

      totalUtility:
        round(
          totalUtility
        ),

      minimumUtility:
        round(
          minimumUtility
        ),

      utilityGap:
        round(
          utilityGap
        ),

      feasibleForEveryone,

      score:
        score ===
        Number.NEGATIVE_INFINITY
          ? score
          : round(score),
    });
  }

  return results.sort(
    (a, b) =>
      b.score -
      a.score
  );
}

/* ============================================================
   UTILITY
   ============================================================ */

export function proposalUtility(
  proposal: GroupProposal
) {
  if (!proposal.feasible) {
    return 0;
  }

  const penalty =
    proposal.opportunityCost ===
    "high"
      ? 0.2
      : proposal.opportunityCost ===
        "medium"
      ? 0.1
      : 0;

  /*
   * Preference is dominant.
   *
   * Flexibility adds a smaller bonus
   * so flexible slots are slightly
   * preferred when satisfaction is
   * otherwise similar.
   */
  return Math.max(
    0,
    proposal.preference +
      proposal.flexibility *
        0.15 -
      penalty
  );
}

/* ============================================================
   EXPLANATION
   ============================================================ */

export function explainRankedSlot(
  winner: RankedSlot,
  runnerUp?: RankedSlot
) {
  if (
    !winner.feasibleForEveryone
  ) {
    return (
      "I couldn't find a candidate time " +
      "that keeps everyone feasible."
    );
  }

  if (!runnerUp) {
    return (
      "This is the strongest time that " +
      "keeps everyone feasible."
    );
  }

  if (
    winner.minimumUtility >
    runnerUp.minimumUtility
  ) {
    return (
      "This option keeps everyone feasible " +
      "and avoids putting most of the " +
      "inconvenience on one person."
    );
  }

  if (
    winner.utilityGap <
    runnerUp.utilityGap
  ) {
    return (
      "This option spreads the compromise " +
      "more evenly across the group."
    );
  }

  return (
    "This option gives the group the " +
    "strongest overall fit while keeping " +
    "everyone feasible."
  );
}

/* ============================================================
   HELPERS
   ============================================================ */

function opportunityCostBand(
  value: number
): OpportunityCostBand {
  if (value >= 0.7) {
    return "high";
  }

  if (value >= 0.35) {
    return "medium";
  }

  return "low";
}

function clamp(
  value: number,
  minimum: number,
  maximum: number
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value
    )
  );
}

function round(
  value: number
) {
  return (
    Math.round(
      value * 1000
    ) / 1000
  );
}