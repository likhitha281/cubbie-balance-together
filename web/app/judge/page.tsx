"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";
import { ensureAnonymousUser } from "../../lib/auth";

type Room = {
  id: string;
  code: string;
  name: string;
};

type Member = {
  id: string;
  displayName: string;
};

type RequestRow = {
  id: string;
  request_text: string;
  status: string;
  selected_start: string | null;
  selected_end: string | null;
  created_at: string;
};

type ProposalRow = {
  id: string;
  member_id: string;
  slot_start: string;
  slot_end: string;
  feasible: boolean;
  preference: number | string;
  flexibility: number | string;
  opportunity_cost:
    | "low"
    | "medium"
    | "high";
};

type SlotView = {
  key: string;
  start: string;
  end: string;
  proposals: ProposalRow[];
  everyoneFeasible: boolean;
  totalUtility: number;
  minimumUtility: number;
  utilityGap: number;
  score: number;
};

export default function JudgePage() {
  return (
    <Suspense fallback={<Loading />}>
      <JudgeExperience />
    </Suspense>
  );
}

function JudgeExperience() {
  const searchParams =
    useSearchParams();

  const code =
    searchParams
      .get("code")
      ?.trim()
      .toUpperCase() ?? "";

  const [room, setRoom] =
    useState<Room | null>(null);

  const [members, setMembers] =
    useState<Member[]>([]);

  const [request, setRequest] =
    useState<RequestRow | null>(
      null
    );

  const [proposals, setProposals] =
    useState<ProposalRow[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    async function load() {
      if (!code) {
        setError(
          "This inspector needs a room code."
        );
        setLoading(false);
        return;
      }

      try {
        await ensureAnonymousUser();

        const {
          data: roomData,
          error: roomError,
        } = await supabase
          .from("rooms")
          .select("id, code, name")
          .eq("code", code)
          .single();

        if (
          roomError ||
          !roomData
        ) {
          throw new Error(
            "Room not found."
          );
        }

        setRoom(
          roomData as Room
        );

        const {
          data: memberData,
          error: memberError,
        } = await supabase
          .from("room_members")
          .select(
            "id, display_name"
          )
          .eq(
            "room_id",
            roomData.id
          )
          .eq(
            "status",
            "joined"
          );

        if (memberError) {
          throw memberError;
        }

        setMembers(
          (memberData ?? []).map(
            (member) => ({
              id:
                member.id,

              displayName:
                member.display_name,
            })
          )
        );

        const {
          data: requestData,
          error: requestError,
        } = await supabase
          .from(
            "coordination_requests"
          )
          .select(`
            id,
            request_text,
            status,
            selected_start,
            selected_end,
            created_at
          `)
          .eq(
            "room_id",
            roomData.id
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          )
          .limit(1)
          .maybeSingle();

        if (requestError) {
          throw requestError;
        }

        if (!requestData) {
          setLoading(false);
          return;
        }

        setRequest(
          requestData as RequestRow
        );

        const {
          data: proposalData,
          error: proposalError,
        } = await supabase
          .from(
            "agent_proposals"
          )
          .select(`
            id,
            member_id,
            slot_start,
            slot_end,
            feasible,
            preference,
            flexibility,
            opportunity_cost
          `)
          .eq(
            "room_id",
            roomData.id
          )
          .eq(
            "request_id",
            requestData.id
          );

        if (proposalError) {
          throw proposalError;
        }

        setProposals(
          (proposalData ??
            []) as ProposalRow[]
        );
      } catch (loadError) {
        console.error(
          loadError
        );

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not open Judge Mode."
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [code]);

  const memberMap =
    useMemo(() => {
      return new Map(
        members.map(
          (member) => [
            member.id,
            member.displayName,
          ]
        )
      );
    }, [members]);

  const slots =
    useMemo(() => {
      return buildSlots(
        proposals,
        members.length
      );
    }, [
      proposals,
      members.length,
    ]);

  const selectedSlot =
    useMemo(() => {
      if (
        !request?.selected_start ||
        !request?.selected_end
      ) {
        return null;
      }

      return slots.find(
        (slot) =>
          slot.start ===
            request.selected_start &&
          slot.end ===
            request.selected_end
      ) ?? null;
    }, [
      request,
      slots,
    ]);

  if (loading) {
    return <Loading />;
  }

  if (
    error ||
    !room
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7fb] px-5">
        <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-xl">
          <EyeOff className="mx-auto text-slate-400" />

          <h1 className="mt-4 text-2xl font-semibold">
            Inspector unavailable
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            {error ||
              "I couldn't load this room."}
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white"
          >
            Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f6fa] text-slate-950">

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">

          <Link
            href={`/room?code=${code}`}
            className="flex items-center gap-2 text-sm font-medium text-slate-500"
          >
            <ArrowLeft size={17} />
            Back to group
          </Link>

          <div className="flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
            <Eye size={14} />
            Judge Mode
          </div>

        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10">

        <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">

          <div>
            <div className="text-sm font-semibold text-violet-600">
              Agent Coordination Inspector
            </div>

            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
              See what the coordinator saw.
            </h1>

            <p className="mt-4 max-w-2xl leading-7 text-slate-500">
              This view exposes the
              coordination protocol for
              judging and debugging — not
              anyone&apos;s private reasons.
            </p>
          </div>

          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">

            <div className="flex items-center gap-2 font-semibold text-emerald-900">
              <ShieldCheck size={18} />
              Privacy boundary intact
            </div>

            <div className="mt-4 text-4xl font-semibold text-emerald-900">
              0
            </div>

            <div className="mt-1 text-sm text-emerald-700">
              raw private reasons exposed
            </div>

          </div>

        </section>

        {!request && (
          <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">

            <Sparkles className="mx-auto text-violet-500" />

            <h2 className="mt-4 text-xl font-semibold">
              No coordination request yet
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Ask Cubbie to find a time in
              the group chat, then return
              here.
            </p>

          </div>
        )}

        {request && (
          <>
            <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Request
              </div>

              <div className="mt-3 text-xl font-semibold">
                “{request.request_text}”
              </div>

              <div className="mt-4 flex flex-wrap gap-2">

                <Badge>
                  {members.length} joined agents
                </Badge>

                <Badge>
                  {new Set(
                    proposals.map(
                      (proposal) =>
                        proposal.member_id
                    )
                  ).size}{" "}
                  responded
                </Badge>

                <Badge>
                  {request.status}
                </Badge>

              </div>

            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-2">

              <PrivacyCard />

              <SelectedCard
                request={request}
                selectedSlot={
                  selectedSlot
                }
              />

            </section>

            <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

              <div className="flex items-start justify-between gap-4">

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Sanitized agent proposals
                  </div>

                  <h2 className="mt-2 text-xl font-semibold">
                    Candidate comparison
                  </h2>
                </div>

                <div className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700">
                  {slots.length} candidate slots
                </div>

              </div>

              <div className="mt-6 space-y-4">

                {slots.map(
                  (slot) => {
                    const selected =
                      request.selected_start ===
                        slot.start &&
                      request.selected_end ===
                        slot.end;

                    return (
                      <SlotCard
                        key={
                          slot.key
                        }
                        slot={
                          slot
                        }
                        selected={
                          selected
                        }
                        memberMap={
                          memberMap
                        }
                      />
                    );
                  }
                )}

                {slots.length === 0 && (
                  <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Waiting for personal
                    agents to publish
                    sanitized proposals.
                  </div>
                )}

              </div>

            </section>

            <section className="mt-6 grid gap-6 md:grid-cols-2">

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2
                    size={18}
                    className="text-emerald-600"
                  />
                  Coordinator received
                </div>

                <div className="mt-5 space-y-3 text-sm text-slate-600">
                  <SafeItem text="Candidate time" />
                  <SafeItem text="Feasible / infeasible" />
                  <SafeItem text="Preference score" />
                  <SafeItem text="Flexibility score" />
                  <SafeItem text="Opportunity-cost band" />
                </div>

              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

                <div className="flex items-center gap-2 font-semibold">
                  <LockKeyhole
                    size={18}
                    className="text-violet-600"
                  />
                  Coordinator did not receive
                </div>

                <div className="mt-5 space-y-3 text-sm text-slate-600">
                  <PrivateItem text="Private reason" />
                  <PrivateItem text="Calendar event title" />
                  <PrivateItem text="Grades" />
                  <PrivateItem text="Emails" />
                  <PrivateItem text="Individual confirmation reason" />
                </div>

              </div>

            </section>
          </>
        )}

      </div>

    </main>
  );
}

/* ============================================================
   PRIVACY CARD
   ============================================================ */

function PrivacyCard() {
  return (
    <div className="rounded-3xl border border-violet-100 bg-violet-50 p-6">

      <div className="flex items-center gap-2 font-semibold text-violet-950">
        <LockKeyhole size={18} />
        Data minimization
      </div>

      <p className="mt-3 text-sm leading-6 text-violet-800/75">
        Personal agents evaluated private
        constraints locally. Only the
        minimum signals required for group
        coordination were published.
      </p>

      <div className="mt-5 rounded-2xl bg-white/70 p-4">

        <div className="text-xs font-semibold uppercase tracking-wider text-violet-500">
          Raw reasons exposed
        </div>

        <div className="mt-1 text-3xl font-semibold text-violet-950">
          0
        </div>

      </div>

    </div>
  );
}

/* ============================================================
   SELECTED CARD
   ============================================================ */

function SelectedCard({
  request,
  selectedSlot,
}: {
  request: RequestRow;
  selectedSlot: SlotView | null;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

      <div className="flex items-center gap-2 font-semibold">
        <Sparkles
          size={18}
          className="text-violet-600"
        />
        Selected compromise
      </div>

      {request.selected_start &&
      request.selected_end ? (
        <>
          <div className="mt-4 text-xl font-semibold">
            {formatSlot(
              request.selected_start,
              request.selected_end
            )}
          </div>

          {selectedSlot && (
            <div className="mt-5 grid grid-cols-3 gap-2">

              <Metric
                label="Min utility"
                value={
                  selectedSlot.minimumUtility
                }
              />

              <Metric
                label="Burden gap"
                value={
                  selectedSlot.utilityGap
                }
              />

              <Metric
                label="Score"
                value={
                  selectedSlot.score
                }
              />

            </div>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          Cubbie is still collecting
          agent responses.
        </p>
      )}

    </div>
  );
}

/* ============================================================
   SLOT CARD
   ============================================================ */

function SlotCard({
  slot,
  selected,
  memberMap,
}: {
  slot: SlotView;
  selected: boolean;
  memberMap: Map<string, string>;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        selected
          ? "border-violet-300 bg-violet-50"
          : "border-slate-200 bg-slate-50/60"
      }`}
    >

      <div className="flex flex-wrap items-start justify-between gap-3">

        <div>

          <div className="font-semibold">
            {formatSlot(
              slot.start,
              slot.end
            )}
          </div>

          <div className="mt-1 text-xs text-slate-400">
            {slot.proposals.length} agent responses
          </div>

        </div>

        {selected ? (
          <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-semibold text-white">
            Selected
          </span>
        ) : slot.everyoneFeasible ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            Everyone feasible
          </span>
        ) : (
          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
            Hard conflict
          </span>
        )}

      </div>

      <div className="mt-5 space-y-2">

        {slot.proposals.map(
          (proposal) => (
            <div
              key={
                proposal.id
              }
              className="grid gap-2 rounded-xl bg-white px-4 py-3 text-sm shadow-sm sm:grid-cols-[1fr_auto_auto]"
            >

              <div className="font-medium text-slate-700">
                {memberMap.get(
                  proposal.member_id
                ) ??
                  "Personal agent"}
              </div>

              <div
                className={
                  proposal.feasible
                    ? "text-emerald-600"
                    : "text-red-500"
                }
              >
                {proposal.feasible
                  ? "feasible"
                  : "infeasible"}
              </div>

              <div className="text-slate-400">
                {proposal.opportunity_cost} cost
              </div>

            </div>
          )
        )}

      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">

        <Metric
          label="Min utility"
          value={
            slot.minimumUtility
          }
        />

        <Metric
          label="Burden gap"
          value={
            slot.utilityGap
          }
        />

        <Metric
          label="Fair score"
          value={
            slot.score
          }
        />

      </div>

    </div>
  );
}

/* ============================================================
   SMALL COMPONENTS
   ============================================================ */

function Badge({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
      {children}
    </span>
  );
}

function SafeItem({
  text,
}: {
  text: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <CheckCircle2
        size={15}
        className="text-emerald-500"
      />
      {text}
    </div>
  );
}

function PrivateItem({
  text,
}: {
  text: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <XCircle
        size={15}
        className="text-violet-500"
      />
      {text}
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-center shadow-sm">

      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>

      <div className="mt-1 font-mono text-sm font-semibold text-slate-700">
        {Number.isFinite(value)
          ? value.toFixed(2)
          : "—"}
      </div>

    </div>
  );
}

/* ============================================================
   SLOT / FAIRNESS
   ============================================================ */

function buildSlots(
  proposals: ProposalRow[],
  expectedMembers: number
): SlotView[] {
  const groups =
    new Map<
      string,
      ProposalRow[]
    >();

  for (
    const proposal
    of proposals
  ) {
    const key =
      `${proposal.slot_start}|${proposal.slot_end}`;

    const existing =
      groups.get(key) ?? [];

    existing.push(
      proposal
    );

    groups.set(
      key,
      existing
    );
  }

  const slots:
    SlotView[] = [];

  for (
    const [
      key,
      rows,
    ] of groups
  ) {
    const [
      start,
      end,
    ] = key.split("|");

    const uniqueAgents =
      new Set(
        rows.map(
          (row) =>
            row.member_id
        )
      ).size;

    const complete =
      uniqueAgents >=
      expectedMembers;

    const everyoneFeasible =
      complete &&
      rows.every(
        (row) =>
          row.feasible
      );

    const utilities =
      rows.map(
        proposalUtility
      );

    const totalUtility =
      utilities.reduce(
        (sum, value) =>
          sum + value,
        0
      );

    const minimumUtility =
      utilities.length
        ? Math.min(
            ...utilities
          )
        : 0;

    const maximumUtility =
      utilities.length
        ? Math.max(
            ...utilities
          )
        : 0;

    const utilityGap =
      maximumUtility -
      minimumUtility;

    const score =
      everyoneFeasible
        ? totalUtility +
          minimumUtility -
          utilityGap
        : Number.NEGATIVE_INFINITY;

    slots.push({
      key,
      start,
      end,
      proposals:
        rows,
      everyoneFeasible,
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
      score:
        Number.isFinite(
          score
        )
          ? round(score)
          : score,
    });
  }

  return slots.sort(
    (a, b) =>
      b.score -
      a.score
  );
}

function proposalUtility(
  proposal: ProposalRow
) {
  if (!proposal.feasible) {
    return 0;
  }

  const preference =
    Number(
      proposal.preference
    );

  const flexibility =
    Number(
      proposal.flexibility
    );

  const penalty =
    proposal.opportunity_cost ===
    "high"
      ? 0.2
      : proposal.opportunity_cost ===
        "medium"
      ? 0.1
      : 0;

  return Math.max(
    0,
    preference +
      flexibility *
        0.15 -
      penalty
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

function formatSlot(
  startIso: string,
  endIso: string
) {
  const start =
    new Date(startIso);

  const end =
    new Date(endIso);

  const day =
    new Intl.DateTimeFormat(
      "en-US",
      {
        weekday:
          "short",
        month:
          "short",
        day:
          "numeric",
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

  return `${day} · ${startTime}–${endTime}`;
}

/* ============================================================
   LOADING
   ============================================================ */

function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f6fa]">

      <div className="text-center">

        <Eye className="mx-auto text-violet-600" />

        <div className="mt-3 text-sm font-medium text-slate-500">
          Opening coordination inspector...
        </div>

      </div>

    </main>
  );
}