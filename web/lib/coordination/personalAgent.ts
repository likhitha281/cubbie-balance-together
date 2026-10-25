import { supabase } from "../supabase";

import {
  evaluateCandidates,
  generateWeekendCandidates,
  PrivateConstraint,
} from "./engine";

type EvaluateRequestArgs = {
  requestId: string;
  roomId: string;
  durationMinutes: number;
};

export async function evaluateRequestForCurrentUser({
  requestId,
  roomId,
  durationMinutes,
}: EvaluateRequestArgs) {
  /* ==========================================================
     1. CURRENT AUTHENTICATED USER
     ========================================================== */

  const {
    data: {
      user,
    },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (
    userError ||
    !user
  ) {
    throw new Error(
      "No authenticated personal agent."
    );
  }

  /* ==========================================================
     2. FIND THIS USER'S ROOM MEMBER
     ========================================================== */

  const {
    data: member,
    error: memberError,
  } =
    await supabase
      .from("room_members")
      .select(
        "id, display_name"
      )
      .eq(
        "room_id",
        roomId
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "status",
        "joined"
      )
      .single();

  if (
    memberError ||
    !member
  ) {
    throw new Error(
      "This user is not a joined member of the room."
    );
  }

  /* ==========================================================
     3. READ PRIVATE CONSTRAINTS
     ========================================================== */

  /*
   * We deliberately do NOT filter by
   * user_id here.
   *
   * Supabase RLS is responsible for
   * returning only this authenticated
   * user's private rows.
   *
   * This means privacy does not depend
   * on a client-side filter.
   */

  const {
    data: constraints,
    error: constraintError,
  } =
    await supabase
      .from(
        "private_constraints"
      )
      .select(
        [
          "start_time",
          "end_time",
          "constraint_type",
          "opportunity_cost",
        ].join(",")
      )
      .eq(
        "room_id",
        roomId
      );

  if (constraintError) {
    throw constraintError;
  }

  /* ==========================================================
     4. GENERATE CANDIDATE TIMES
     ========================================================== */

  const candidates =
    generateWeekendCandidates(
      new Date(),
      durationMinutes
    );

  /* ==========================================================
     5. EVALUATE LOCALLY
     ========================================================== */

  const sanitized =
    evaluateCandidates(
      candidates,
      (constraints ??
        []) as unknown as
        PrivateConstraint[]
    );

  /*
   * At this point the private reasons
   * have already disappeared.
   *
   * `sanitized` contains only:
   *
   * feasible
   * preference
   * flexibility
   * opportunity-cost band
   * slot times
   */

  /* ==========================================================
     6. REMOVE THIS MEMBER'S OLD PROPOSALS
     ========================================================== */

  const {
    error: deleteError,
  } =
    await supabase
      .from(
        "agent_proposals"
      )
      .delete()
      .eq(
        "request_id",
        requestId
      )
      .eq(
        "member_id",
        member.id
      );

  if (deleteError) {
    throw deleteError;
  }

  /* ==========================================================
     7. PUBLISH SANITIZED PROPOSALS
     ========================================================== */

  const rows =
    sanitized.map(
      (proposal) => ({
        request_id:
          requestId,

        room_id:
          roomId,

        member_id:
          member.id,

        slot_start:
          proposal.slotStart,

        slot_end:
          proposal.slotEnd,

        feasible:
          proposal.feasible,

        preference:
          proposal.preference,

        flexibility:
          proposal.flexibility,

        opportunity_cost:
          proposal.opportunityCost,
      })
    );

  if (rows.length === 0) {
    return {
      memberId:
        member.id,

      memberName:
        member.display_name,

      proposalCount: 0,
    };
  }

  const {
    error: insertError,
  } =
    await supabase
      .from(
        "agent_proposals"
      )
      .insert(rows);

  if (insertError) {
    throw insertError;
  }

  return {
    memberId:
      member.id,

    memberName:
      member.display_name,

    proposalCount:
      rows.length,
  };
}