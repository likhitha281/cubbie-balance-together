import { supabase } from "../supabase";

export type ConfirmationStatus =
  | "pending"
  | "confirmed"
  | "declined";

export type PrivateConfirmation = {
  id: string;

  requestId: string;
  roomId: string;
  memberId: string;

  proposedSlot: string;

  status: ConfirmationStatus;

  createdAt: string;
  respondedAt: string | null;
};

type ConfirmationRow = {
  id: string;

  request_id: string;
  room_id: string;
  member_id: string;

  proposed_slot: string;

  status: ConfirmationStatus;

  created_at: string;
  responded_at: string | null;
};

/* ============================================================
   CREATE PRIVATE CONFIRMATION REQUESTS
   ============================================================ */

export async function createPrivateConfirmations({
  requestId,
  roomId,
  slotStart,
  slotEnd,
}: {
  requestId: string;
  roomId: string;
  slotStart: string;
  slotEnd: string;
}) {
  /*
   * Only joined members with a real
   * anonymous identity participate.
   */

  const {
    data: members,
    error: memberError,
  } = await supabase
    .from("room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("status", "joined")
    .not("user_id", "is", null);

  if (memberError) {
    throw memberError;
  }

  if (
    !members ||
    members.length === 0
  ) {
    throw new Error(
      "No joined members are available for confirmation."
    );
  }

  const proposedSlot =
    JSON.stringify({
      start: slotStart,
      end: slotEnd,
    });

  const rows =
    members.map(
      (member) => ({
        request_id:
          requestId,

        room_id:
          roomId,

        member_id:
          member.id,

        proposed_slot:
          proposedSlot,

        status:
          "pending",
      })
    );

  const {
    error,
  } = await supabase
    .from(
      "plan_confirmations"
    )
    .upsert(
      rows,
      {
        onConflict:
          "request_id,member_id",

        ignoreDuplicates:
          true,
      }
    );

  if (error) {
    throw error;
  }
}

/* ============================================================
   LOAD CURRENT USER'S PRIVATE CONFIRMATION
   ============================================================ */

export async function getMyPendingConfirmation({
  requestId,
}: {
  requestId: string;
}): Promise<
  PrivateConfirmation | null
> {
  const {
    data: { user },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (
    userError ||
    !user
  ) {
    throw new Error(
      "No authenticated user."
    );
  }

  /*
   * RLS ensures this query can return
   * only this student's confirmation.
   */

  const {
    data,
    error,
  } = await supabase
    .from(
      "plan_confirmations"
    )
    .select("*")
    .eq(
      "request_id",
      requestId
    )
    .eq(
      "status",
      "pending"
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapConfirmation(
    data as ConfirmationRow
  );
}

/* ============================================================
   RESPOND
   ============================================================ */

export async function respondToConfirmation({
  confirmationId,
  response,
}: {
  confirmationId: string;

  response:
    | "confirmed"
    | "declined";
}) {
  const {
    data,
    error,
  } = await supabase
    .from(
      "plan_confirmations"
    )
    .update({
      status:
        response,

      responded_at:
        new Date()
          .toISOString(),
    })
    .eq(
      "id",
      confirmationId
    )
    .select("*")
    .single();

  if (
    error ||
    !data
  ) {
    throw (
      error ??
      new Error(
        "Could not save confirmation."
      )
    );
  }

  return mapConfirmation(
    data as ConfirmationRow
  );
}

/* ============================================================
   REQUESTER CHECKS GROUP RESULT
   ============================================================ */

export async function getConfirmationSummary({
  requestId,
  roomId,
}: {
  requestId: string;
  roomId: string;
}) {
  /*
   * Because confirmation rows are
   * intentionally private, ordinary
   * clients cannot read everyone else's
   * individual response.
   *
   * We therefore derive aggregate state
   * through the coordination request.
   *
   * For this prototype, the requester
   * checks completion using an RPC added
   * below in the SQL migration.
   */

  const {
    data,
    error,
  } = await supabase.rpc(
    "confirmation_summary",
    {
      p_request_id:
        requestId,

      p_room_id:
        roomId,
    }
  );

  if (error) {
    throw error;
  }

  const row =
    Array.isArray(data)
      ? data[0]
      : data;

  return {
    total:
      Number(
        row?.total_count ??
          0
      ),

    pending:
      Number(
        row?.pending_count ??
          0
      ),

    confirmed:
      Number(
        row?.confirmed_count ??
          0
      ),

    declined:
      Number(
        row?.declined_count ??
          0
      ),
  };
}

/* ============================================================
   SLOT PARSING
   ============================================================ */

export function parseProposedSlot(
  value: string
) {
  try {
    const parsed =
      JSON.parse(value);

    if (
      typeof parsed.start !==
        "string" ||
      typeof parsed.end !==
        "string"
    ) {
      return null;
    }

    return {
      start:
        parsed.start as string,

      end:
        parsed.end as string,
    };
  } catch {
    return null;
  }
}

/* ============================================================
   MAP DATABASE ROW
   ============================================================ */

function mapConfirmation(
  row: ConfirmationRow
): PrivateConfirmation {
  return {
    id:
      row.id,

    requestId:
      row.request_id,

    roomId:
      row.room_id,

    memberId:
      row.member_id,

    proposedSlot:
      row.proposed_slot,

    status:
      row.status,

    createdAt:
      row.created_at,

    respondedAt:
      row.responded_at,
  };
}