"use client";

import Link from "next/link";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  Check,
  LockKeyhole,
  MessageCircle,
  X,
} from "lucide-react";

import {
  Suspense,
  useEffect,
  useState,
} from "react";

import {
  getMyPendingConfirmation,
  parseProposedSlot,
  PrivateConfirmation,
  respondToConfirmation,
} from "../../lib/coordination/confirmations";

import { ensureAnonymousUser } from "../../lib/auth";

export default function ConfirmationPage() {
  return (
    <Suspense
      fallback={<Loading />}
    >
      <ConfirmationExperience />
    </Suspense>
  );
}

function ConfirmationExperience() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const code =
    searchParams
      .get("code")
      ?.toUpperCase() ?? "";

  const requestId =
    searchParams.get(
      "request"
    ) ?? "";

  const [
    confirmation,
    setConfirmation,
  ] =
    useState<PrivateConfirmation | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    responding,
    setResponding,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {
    async function load() {
      if (
        !code ||
        !requestId
      ) {
        setError(
          "This confirmation link is incomplete."
        );

        setLoading(false);

        return;
      }

      try {
        await ensureAnonymousUser();

        const pending =
          await getMyPendingConfirmation({
            requestId,
          });

        setConfirmation(
          pending
        );
      } catch (loadError) {
        console.error(
          loadError
        );

        setError(
          "I couldn't load your private confirmation."
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [
    code,
    requestId,
  ]);

  async function respond(
    response:
      | "confirmed"
      | "declined"
  ) {
    if (
      !confirmation ||
      responding
    ) {
      return;
    }

    setResponding(true);
    setError("");

    try {
      await respondToConfirmation({
        confirmationId:
          confirmation.id,

        response,
      });

      router.push(
        `/room?code=${code}`
      );
    } catch (responseError) {
      console.error(
        responseError
      );

      setError(
        "I couldn't save your response."
      );

      setResponding(false);
    }
  }

  if (loading) {
    return <Loading />;
  }

  const slot =
    confirmation
      ? parseProposedSlot(
          confirmation.proposedSlot
        )
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7fb] px-5">

      <div className="w-full max-w-md">

        <Link
          href={`/room?code=${code}`}
          className="mb-5 inline-flex text-sm text-slate-500"
        >
          ← Back to group
        </Link>

        <div className="rounded-[30px] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60">

          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
            <LockKeyhole
              size={22}
            />
          </div>

          <div className="mt-5 text-sm font-medium text-violet-600">
            🔒 You ↔ Cubbie
          </div>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Does this work for you?
          </h1>

          {!confirmation && (
            <div className="mt-6 rounded-2xl bg-slate-50 p-5 text-sm leading-6 text-slate-500">
              You don&apos;t have a pending confirmation for this plan.
            </div>
          )}

          {confirmation &&
            slot && (
              <>
                <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50 p-5">

                  <div className="text-xs font-semibold uppercase tracking-wider text-violet-500">
                    Proposed plan
                  </div>

                  <div className="mt-3 text-xl font-semibold text-violet-950">
                    {formatSlot(
                      slot.start,
                      slot.end
                    )}
                  </div>

                </div>

                <p className="mt-5 text-sm leading-6 text-slate-500">
                  This recommendation was made using your private
                  constraints, but your reason was not shared with
                  the group.
                </p>

                <div className="mt-6 grid grid-cols-2 gap-3">

                  <button
                    type="button"
                    disabled={
                      responding
                    }
                    onClick={() =>
                      respond(
                        "confirmed"
                      )
                    }
                    className="flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3.5 font-semibold text-white shadow-lg shadow-violet-200 disabled:opacity-40"
                  >
                    <Check
                      size={18}
                    />

                    I&apos;m in
                  </button>

                  <button
                    type="button"
                    disabled={
                      responding
                    }
                    onClick={() =>
                      respond(
                        "declined"
                      )
                    }
                    className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-semibold text-slate-600 disabled:opacity-40"
                  >
                    <X
                      size={18}
                    />

                    Can&apos;t make it
                  </button>

                </div>

                <p className="mt-5 text-center text-xs leading-5 text-slate-400">
                  The group sees only whether the plan reached
                  consensus — not who declined or why.
                </p>
              </>
            )}

          {error && (
            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
          <MessageCircle
            size={12}
          />
          Balance Together
        </div>

      </div>

    </main>
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
          "long",

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

  return (
    `${day} · ${startTime}–${endTime}`
  );
}

function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7fb]">

      <div className="text-center">

        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 text-white">
          <LockKeyhole
            size={20}
          />
        </div>

        <div className="mt-4 text-sm font-medium text-slate-500">
          Opening your private confirmation...
        </div>

      </div>

    </main>
  );
}