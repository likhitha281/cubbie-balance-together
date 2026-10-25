import { supabase } from "../supabase";

import {
  explainRankedSlot,
  GroupProposal,
  OpportunityCostBand,
  rankGroupSlots,
  RankedSlot,
} from "./engine";

/* ============================================================
   TYPES
   ============================================================ */

export type CoordinationRequest = {
  id: string;
  room_id: string;
  requested_by: string;
  request_text: string;
  duration_minutes: number;

  status:
    | "collecting"
    | "ready"
    | "proposed"
    | "confirmed"
    | "cancelled";

  selected_start: string | null;
  selected_end: string | null;

  created_at: string;
};

export type CoordinationResult = {
  ready: boolean;

  joinedMembers: number;
  respondingMembers: number;

  winner: RankedSlot | null;

  explanation: string | null;
};

type JoinedMemberRow = {
  id: string;
};

type ProposalRow = {
  member_id: string;

  slot_start: string;
  slot_end: string;

  feasible: boolean;

  preference: number | string;
  flexibility: number | string;

  opportunity_cost:
    OpportunityCostBand;
};

/* ============================================================
   CREATE COORDINATION REQUEST
   ============================================================ */

export async function createCoordinationRequest({
  roomId,
  text,
  durationMinutes = 120,
}: {
  roomId: string;
  text: string;
  durationMinutes?: number;
}): Promise<CoordinationRequest> {
  /* ----------------------------------------------------------
     Get authenticated requester
     ---------------------------------------------------------- */

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (
    userError ||
    !user
  ) {
    throw new Error(
      "You need a personal Cubbie identity before coordinating."
    );
  }

  /* ----------------------------------------------------------
     Create shared request
     ---------------------------------------------------------- */

  const {
    data,
    error,
  } = await supabase
    .from(
      "coordination_requests"
    )
    .insert({
      room_id:
        roomId,

      requested_by:
        user.id,

      request_text:
        text,

      duration_minutes:
        durationMinutes,

      status:
        "collecting",
    })
    .select(
      `
        id,
        room_id,
        requested_by,
        request_text,
        duration_minutes,
        status,
        selected_start,
        selected_end,
        created_at
      `
    )
    .single();

  if (
    error ||
    !data
  ) {
    console.error(
      "Coordination request creation failed:",
      error
    );

    throw new Error(
      "Could not create the coordination request."
    );
  }

  return (
    data as CoordinationRequest
  );
}

/* ============================================================
   GET COORDINATION RESULT
   ============================================================ */

export async function getCoordinationResult(
  requestId: string,
  roomId: string
): Promise<CoordinationResult> {
  /* ==========================================================
     1. FIND JOINED AGENTS
     ========================================================== */

  const {
    data: memberData,
    error: memberError,
  } = await supabase
    .from("room_members")
    .select("id")
    .eq(
      "room_id",
      roomId
    )
    .eq(
      "status",
      "joined"
    )
    .not(
      "user_id",
      "is",
      null
    );

  if (memberError) {
    console.error(
      "Could not load joined members:",
      memberError
    );

    throw memberError;
  }

  const members =
    (memberData ??
      []) as JoinedMemberRow[];

  const joinedMembers =
    members.length;

  /* ==========================================================
     2. LOAD SANITIZED AGENT PROPOSALS
     ========================================================== */

  /*
   * IMPORTANT:
   *
   * This query does NOT touch
   * private_constraints.
   *
   * The coordinator sees only:
   *
   * - member ID
   * - candidate time
   * - feasibility
   * - preference
   * - flexibility
   * - opportunity-cost band
   *
   * It never receives:
   *
   * - reason
   * - calendar title
   * - course
   * - grade
   * - employer
   * - email
   */

  const {
    data: rawProposalData,
    error: proposalError,
  } = await supabase
    .from(
      "agent_proposals"
    )
    .select(
      `
        member_id,
        slot_start,
        slot_end,
        feasible,
        preference,
        flexibility,
        opportunity_cost
      `
    )
    .eq(
      "request_id",
      requestId
    )
    .eq(
      "room_id",
      roomId
    );

  if (proposalError) {
    console.error(
      "Could not load agent proposals:",
      proposalError
    );

    throw proposalError;
  }

  /*
   * Supabase's generic client cannot
   * infer these database row types
   * because this project does not yet
   * use generated Database types.
   *
   * We therefore validate/cast the
   * known sanitized row shape here.
   */

  const proposalRows =
    (rawProposalData ??
      []) as unknown as ProposalRow[];

  /* ==========================================================
     3. COUNT RESPONDING PERSONAL AGENTS
     ========================================================== */

  const respondingMemberIds =
    new Set<string>();

  for (
    const proposal
    of proposalRows
  ) {
    respondingMemberIds.add(
      proposal.member_id
    );
  }

  const respondingMembers =
    respondingMemberIds.size;

  /* ==========================================================
     4. WAIT UNTIL EVERY JOINED AGENT RESPONDS
     ========================================================== */

  if (
    joinedMembers === 0 ||
    respondingMembers <
      joinedMembers
  ) {
    return {
      ready: false,

      joinedMembers,

      respondingMembers,

      winner: null,

      explanation: null,
    };
  }

  /* ==========================================================
     5. CONVERT DATABASE ROWS TO ENGINE INPUT
     ========================================================== */

  const proposals:
    GroupProposal[] =
      proposalRows.map(
        (row) => ({
          memberId:
            row.member_id,

          slotStart:
            row.slot_start,

          slotEnd:
            row.slot_end,

          feasible:
            Boolean(
              row.feasible
            ),

          preference:
            Number(
              row.preference
            ),

          flexibility:
            Number(
              row.flexibility
            ),

          opportunityCost:
            normalizeOpportunityCost(
              row.opportunity_cost
            ),
        })
      );

  /* ==========================================================
     6. RANK CANDIDATE TIMES
     ========================================================== */

  const ranked =
    rankGroupSlots(
      proposals,
      joinedMembers
    );

  /*
   * Hard-conflict slots cannot win.
   */

  const feasibleSlots =
    ranked.filter(
      (slot) =>
        slot.feasibleForEveryone &&
        Number.isFinite(
          slot.score
        )
    );

  const winner =
    feasibleSlots[0] ??
    null;

  const runnerUp =
    feasibleSlots[1];

  /* ==========================================================
     7. NO FEASIBLE AGREEMENT
     ========================================================== */

  if (!winner) {
    return {
      ready: true,

      joinedMembers,

      respondingMembers,

      winner: null,

      explanation:
        "I couldn't find a candidate time that keeps everyone feasible.",
    };
  }

  /* ==========================================================
     8. SUCCESS
     ========================================================== */

  return {
    ready: true,

    joinedMembers,

    respondingMembers,

    winner,

    explanation:
      explainRankedSlot(
        winner,
        runnerUp
      ),
  };
}

/* ============================================================
   MARK REQUEST AS PROPOSED
   ============================================================ */

export async function markRequestProposed({
  requestId,
  winner,
}: {
  requestId: string;
  winner: RankedSlot;
}) {
  const {
    error,
  } = await supabase
    .from(
      "coordination_requests"
    )
    .update({
      status:
        "proposed",

      selected_start:
        winner.start,

      selected_end:
        winner.end,
    })
    .eq(
      "id",
      requestId
    );

  if (error) {
    console.error(
      "Could not mark request proposed:",
      error
    );

    throw error;
  }
}

/* ============================================================
   FORMAT SLOT FOR GROUP CHAT
   ============================================================ */

export function formatSlotForChat(
  startIso: string,
  endIso: string
) {
  const start =
    new Date(
      startIso
    );

  const end =
    new Date(
      endIso
    );

  const day =
    new Intl.DateTimeFormat(
      "en-US",
      {
        weekday:
          "long",
      }
    ).format(start);

  const startTime =
    new Intl.DateTimeFormat(
      "en-US",
      {
        hour:
          "numeric",

        minute:
          "2-digit",
      }
    ).format(start);

  const endTime =
    new Intl.DateTimeFormat(
      "en-US",
      {
        hour:
          "numeric",

        minute:
          "2-digit",
      }
    ).format(end);

  return (
    `${day} ${startTime}–${endTime}`
  );
}

/* ============================================================
   FORMAT PROGRESS
   ============================================================ */

export function formatAgentProgress({
  respondingMembers,
  joinedMembers,
}: {
  respondingMembers: number;
  joinedMembers: number;
}) {
  if (
    joinedMembers === 0
  ) {
    return (
      "waiting for group members..."
    );
  }

  if (
    respondingMembers >=
    joinedMembers
  ) {
    return (
      "everyone's agent responded"
    );
  }

  return (
    `${respondingMembers}/${joinedMembers} ` +
    `personal agents responded`
  );
}

/* ============================================================
   NORMALIZE DATABASE VALUE
   ============================================================ */

function normalizeOpportunityCost(
  value: unknown
): OpportunityCostBand {
  if (
    value === "high"
  ) {
    return "high";
  }

  if (
    value === "medium"
  ) {
    return "medium";
  }

  return "low";
}