"use client";

import Link from "next/link";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  ArrowLeft,
  CalendarClock,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import {
  Suspense,
  useEffect,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";
import { ensureAnonymousUser } from "../../lib/auth";

type Room = {
  id: string;
  code: string;
  name: string;
};

type Constraint = {
  id: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  type: "hard" | "soft";
  reason: string;
  cost: number;
};

function blankConstraint(): Constraint {
  const today = new Date()
    .toISOString()
    .slice(0, 10);

  return {
    id: crypto.randomUUID(),
    startDate: today,
    startTime: "18:00",
    endDate: today,
    endTime: "20:00",
    type: "hard",
    reason: "",
    cost: 1,
  };
}

export default function PrivateSetupPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PrivateSetup />
    </Suspense>
  );
}

function PrivateSetup() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const code =
    searchParams
      .get("code")
      ?.trim()
      .toUpperCase() ?? "";

  const [room, setRoom] =
    useState<Room | null>(null);

  const [displayName, setDisplayName] =
    useState("");

  const [constraints, setConstraints] =
    useState<Constraint[]>([
      blankConstraint(),
    ]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    async function load() {
      if (!code) {
        setLoading(false);
        return;
      }

      try {
        const user =
          await ensureAnonymousUser();

        if (!user) {
          setError(
            "I couldn't load your private identity."
          );
          setLoading(false);
          return;
        }

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
          setError(
            "I couldn't find this group."
          );
          setLoading(false);
          return;
        }

        setRoom(roomData);

        const {
          data: memberData,
        } = await supabase
          .from("room_members")
          .select("display_name")
          .eq(
            "room_id",
            roomData.id
          )
          .eq(
            "user_id",
            user.id
          )
          .maybeSingle();

        setDisplayName(
          memberData?.display_name ??
            "You"
        );

        /*
         * Load ONLY this user's
         * constraints.
         *
         * RLS independently enforces
         * the same rule.
         */
        const {
          data: existing,
          error: constraintError,
        } = await supabase
          .from(
            "private_constraints"
          )
          .select("*")
          .eq(
            "room_id",
            roomData.id
          )
          .order(
            "start_time",
            {
              ascending: true,
            }
          );

        if (constraintError) {
          console.error(
            constraintError
          );
        }

        if (
          existing &&
          existing.length > 0
        ) {
          setConstraints(
            existing.map(
              (item) => {
                const start =
                  new Date(
                    item.start_time
                  );

                const end =
                  new Date(
                    item.end_time
                  );

                return {
                  id:
                    item.id,

                  startDate:
                    localDate(start),

                  startTime:
                    localTime(start),

                  endDate:
                    localDate(end),

                  endTime:
                    localTime(end),

                  type:
                    item.constraint_type,

                  reason:
                    item.reason ?? "",

                  cost:
                    Number(
                      item.opportunity_cost
                    ),
                };
              }
            )
          );
        }

        setLoading(false);
      } catch (loadError) {
        console.error(loadError);

        setError(
          "I couldn't load your private setup."
        );

        setLoading(false);
      }
    }

    load();
  }, [code]);

  function updateConstraint(
    id: string,
    field: keyof Constraint,
    value: string | number
  ) {
    setConstraints(
      (current) =>
        current.map(
          (constraint) =>
            constraint.id === id
              ? {
                  ...constraint,
                  [field]: value,
                }
              : constraint
        )
    );
  }

  function addConstraint() {
    setConstraints(
      (current) => [
        ...current,
        blankConstraint(),
      ]
    );
  }

  function removeConstraint(
    id: string
  ) {
    setConstraints(
      (current) =>
        current.filter(
          (constraint) =>
            constraint.id !== id
        )
    );
  }

  async function savePrivateSetup() {
    if (!room) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const user =
        await ensureAnonymousUser();

      if (!user) {
        throw new Error(
          "Missing anonymous user"
        );
      }

      for (
        const constraint
        of constraints
      ) {
        const start =
          combineDateTime(
            constraint.startDate,
            constraint.startTime
          );

        const end =
          combineDateTime(
            constraint.endDate,
            constraint.endTime
          );

        if (
          Number.isNaN(
            start.getTime()
          ) ||
          Number.isNaN(
            end.getTime()
          )
        ) {
          setError(
            "Check the date and time for each constraint."
          );
          setSaving(false);
          return;
        }

        if (end <= start) {
          setError(
            "Each end time must be after its start time."
          );
          setSaving(false);
          return;
        }
      }

      /*
       * Replace this user's room
       * constraints atomically enough
       * for our prototype.
       *
       * RLS prevents deleting anyone
       * else's rows.
       */
      const {
        error: deleteError,
      } = await supabase
        .from(
          "private_constraints"
        )
        .delete()
        .eq(
          "room_id",
          room.id
        );

      if (deleteError) {
        throw deleteError;
      }

      if (
        constraints.length > 0
      ) {
        const rows =
          constraints.map(
            (constraint) => ({
              user_id:
                user.id,

              room_id:
                room.id,

              start_time:
                combineDateTime(
                  constraint.startDate,
                  constraint.startTime
                ).toISOString(),

              end_time:
                combineDateTime(
                  constraint.endDate,
                  constraint.endTime
                ).toISOString(),

              constraint_type:
                constraint.type,

              reason:
                constraint.reason
                  .trim() ||
                null,

              opportunity_cost:
                constraint.cost,
            })
          );

        const {
          error: insertError,
        } = await supabase
          .from(
            "private_constraints"
          )
          .insert(rows);

        if (insertError) {
          throw insertError;
        }
      }

      router.push(
        `/room?code=${room.code}`
      );
    } catch (saveError) {
      console.error(saveError);

      setError(
        "I couldn't save your private setup."
      );

      setSaving(false);
    }
  }

  if (loading) {
    return <Loading />;
  }

  if (!room) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7fb] px-5">
        <div className="max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
          <h1 className="text-2xl font-semibold">
            Group not found
          </h1>

          <p className="mt-2 text-slate-500">
            Check your invite and try again.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link
            href={`/room?code=${code}`}
            className="flex items-center gap-2 text-sm text-slate-500"
          >
            <ArrowLeft size={17} />
            Group
          </Link>

          <div className="flex items-center gap-2 text-xs font-medium text-violet-700">
            <ShieldCheck size={14} />
            Private to you
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-2xl px-5 py-10">
        <div className="rounded-[30px] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
            <LockKeyhole
              size={22}
            />
          </div>

          <div className="mt-5">
            <div className="text-sm font-medium text-violet-600">
              {displayName} ↔ Cubbie
            </div>

            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              What should I protect?
            </h1>

            <p className="mt-3 leading-7 text-slate-500">
              Add times that are difficult or impossible for this plan.
              Reasons are optional and stay private to your Cubbie.
            </p>
          </div>

          <div className="mt-7 rounded-2xl border border-violet-100 bg-violet-50 p-4">
            <div className="flex gap-3">
              <LockKeyhole
                size={18}
                className="mt-0.5 shrink-0 text-violet-600"
              />

              <div>
                <div className="text-sm font-semibold text-violet-950">
                  The group will never see these reasons
                </div>

                <p className="mt-1 text-sm leading-6 text-violet-800/75">
                  Your agent converts this private context into
                  minimum coordination signals such as
                  available / unavailable and preference strength.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-7 space-y-4">
            {constraints.map(
              (constraint, index) => (
                <ConstraintCard
                  key={constraint.id}
                  constraint={constraint}
                  index={index}
                  removable={
                    constraints.length > 1
                  }
                  onUpdate={
                    updateConstraint
                  }
                  onRemove={
                    removeConstraint
                  }
                />
              )
            )}
          </div>

          <button
            type="button"
            onClick={addConstraint}
            className="mt-4 inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-violet-600 hover:bg-violet-50"
          >
            <Plus size={17} />
            Add another constraint
          </button>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={
              savePrivateSetup
            }
            disabled={saving}
            className="mt-7 w-full rounded-2xl bg-violet-600 py-4 font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:opacity-40"
          >
            {saving
              ? "Saving privately..."
              : "Save privately"}
          </button>
        </div>
      </div>
    </main>
  );
}

function ConstraintCard({
  constraint,
  index,
  removable,
  onUpdate,
  onRemove,
}: {
  constraint: Constraint;
  index: number;
  removable: boolean;
  onUpdate: (
    id: string,
    field: keyof Constraint,
    value: string | number
  ) => void;
  onRemove: (
    id: string
  ) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock
            size={17}
            className="text-violet-600"
          />

          <span className="text-sm font-semibold">
            Constraint {index + 1}
          </span>
        </div>

        {removable && (
          <button
            type="button"
            onClick={() =>
              onRemove(
                constraint.id
              )
            }
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2
              size={16}
            />
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label>
          <span className="text-xs font-medium text-slate-500">
            Starts
          </span>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="date"
              value={
                constraint.startDate
              }
              onChange={(event) =>
                onUpdate(
                  constraint.id,
                  "startDate",
                  event.target.value
                )
              }
              className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400"
            />

            <input
              type="time"
              value={
                constraint.startTime
              }
              onChange={(event) =>
                onUpdate(
                  constraint.id,
                  "startTime",
                  event.target.value
                )
              }
              className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400"
            />
          </div>
        </label>

        <label>
          <span className="text-xs font-medium text-slate-500">
            Ends
          </span>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="date"
              value={
                constraint.endDate
              }
              onChange={(event) =>
                onUpdate(
                  constraint.id,
                  "endDate",
                  event.target.value
                )
              }
              className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400"
            />

            <input
              type="time"
              value={
                constraint.endTime
              }
              onChange={(event) =>
                onUpdate(
                  constraint.id,
                  "endTime",
                  event.target.value
                )
              }
              className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400"
            />
          </div>
        </label>
      </div>

      <div className="mt-4">
        <div className="text-xs font-medium text-slate-500">
          How firm is this?
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              onUpdate(
                constraint.id,
                "type",
                "hard"
              );

              onUpdate(
                constraint.id,
                "cost",
                1
              );
            }}
            className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
              constraint.type ===
              "hard"
                ? "border-violet-400 bg-violet-50 text-violet-800"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <strong>
              Can&apos;t move
            </strong>

            <div className="mt-1 text-xs opacity-70">
              Treat this as unavailable.
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onUpdate(
                constraint.id,
                "type",
                "soft"
              );

              onUpdate(
                constraint.id,
                "cost",
                0.65
              );
            }}
            className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
              constraint.type ===
              "soft"
                ? "border-violet-400 bg-violet-50 text-violet-800"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <strong>
              Prefer not to move
            </strong>

            <div className="mt-1 text-xs opacity-70">
              Possible, but inconvenient.
            </div>
          </button>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-medium text-slate-500">
          Reason{" "}
          <span className="font-normal text-slate-400">
            (optional · private)
          </span>
        </span>

        <input
          value={
            constraint.reason
          }
          onChange={(event) =>
            onUpdate(
              constraint.id,
              "reason",
              event.target.value
            )
          }
          placeholder="Work shift, exam prep, appointment..."
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
        />
      </label>
    </div>
  );
}

function combineDateTime(
  date: string,
  time: string
) {
  return new Date(
    `${date}T${time}:00`
  );
}

function localDate(
  date: Date
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function localTime(
  date: Date
) {
  const hours =
    String(
      date.getHours()
    ).padStart(2, "0");

  const minutes =
    String(
      date.getMinutes()
    ).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7fb]">
      <div className="text-sm font-medium text-slate-500">
        Opening your private Cubbie...
      </div>
    </main>
  );
}