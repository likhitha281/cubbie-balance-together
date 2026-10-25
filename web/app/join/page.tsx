"use client";

import Link from "next/link";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  ArrowLeft,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Users,
} from "lucide-react";

import {
  Suspense,
  useEffect,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";
import { ensureAnonymousUser } from "../../lib/auth";

/* ============================================================
   TYPES
   ============================================================ */

type Room = {
  id: string;
  code: string;
  name: string;
};

type Member = {
  id: string;
  display_name: string;
  status: "invited" | "joined";
  user_id?: string | null;
};

/* ============================================================
   PAGE
   ============================================================ */

export default function JoinPage() {
  return (
    <Suspense fallback={<JoinLoading />}>
      <JoinExperience />
    </Suspense>
  );
}

/* ============================================================
   JOIN EXPERIENCE
   ============================================================ */

function JoinExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialCode =
    searchParams
      .get("code")
      ?.trim()
      .toUpperCase() ?? "";

  const [code, setCode] =
    useState(initialCode);

  const [room, setRoom] =
    useState<Room | null>(null);

  const [members, setMembers] =
    useState<Member[]>([]);

  const [displayName, setDisplayName] =
    useState("");

  const [loading, setLoading] =
    useState(Boolean(initialCode));

  const [joining, setJoining] =
    useState(false);

  const [error, setError] =
    useState("");

  /* ==========================================================
     AUTO-LOOKUP WHEN OPENED FROM INVITE LINK
     ========================================================== */

  useEffect(() => {
    if (!initialCode) {
      return;
    }

    findRoom(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  /* ==========================================================
     FIND ROOM
     ========================================================== */

  async function findRoom(
    roomCode?: string
  ) {
    const targetCode =
      (roomCode ?? code)
        .trim()
        .toUpperCase();

    if (!targetCode) {
      setError(
        "Enter a room code."
      );

      return;
    }

    setLoading(true);
    setError("");
    setRoom(null);

    /* ------------------------
       Find room
       ------------------------ */

    const {
      data: roomData,
      error: roomError,
    } = await supabase
      .from("rooms")
      .select(
        "id, code, name"
      )
      .eq(
        "code",
        targetCode
      )
      .single();

    if (
      roomError ||
      !roomData
    ) {
      console.error(
        "Room lookup failed:",
        roomError
      );

      setError(
        "I couldn't find that group. Check the invite code and try again."
      );

      setLoading(false);

      return;
    }

    /* ------------------------
       Load current members
       ------------------------ */

    const {
      data: memberData,
      error: memberError,
    } = await supabase
      .from("room_members")
      .select(
        "id, display_name, status, user_id"
      )
      .eq(
        "room_id",
        roomData.id
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (memberError) {
      console.error(
        "Member lookup failed:",
        memberError
      );

      setError(
        "I found the group, but couldn't load its members."
      );

      setLoading(false);

      return;
    }

    setCode(targetCode);

    setRoom({
      id: roomData.id,
      code: roomData.code,
      name: roomData.name,
    });

    setMembers(
      (memberData ?? []) as Member[]
    );

    setLoading(false);
  }

  /* ==========================================================
     JOIN ROOM
     ========================================================== */

  async function joinRoom() {
    if (
      !room ||
      !displayName.trim() ||
      joining
    ) {
      return;
    }

    setJoining(true);
    setError("");

    /* ------------------------
       1. Get anonymous identity
       ------------------------ */

    let user;

    try {
      user =
        await ensureAnonymousUser();
    } catch (authError) {
      console.error(
        "Anonymous auth failed:",
        authError
      );

      setError(
        "I couldn't create your private identity. Please try again."
      );

      setJoining(false);

      return;
    }

    if (!user) {
      setError(
        "I couldn't create your private identity. Please try again."
      );

      setJoining(false);

      return;
    }

    const name =
      displayName.trim();

    /* ------------------------
       2. Check whether this user
          already belongs to room
       ------------------------ */

    const existingByUser =
      members.find(
        (member) =>
          member.user_id ===
          user.id
      );

    if (existingByUser) {
      /*
       * This browser has already
       * claimed a member identity.
       */

      localStorage.setItem(
        `balance-current-user-${room.code}`,
        existingByUser.display_name
      );

      router.push(
        `/room?code=${room.code}`
      );

      return;
    }

    /* ------------------------
       3. Look for matching invite
       ------------------------ */

    const invitedMember =
      members.find(
        (member) =>
          member.display_name
            .trim()
            .toLowerCase() ===
            name.toLowerCase()
      );

    if (invitedMember) {
      /*
       * Claim the invitation.
       *
       * THIS is the important
       * identity-binding step.
       */

      const {
        error: updateError,
      } = await supabase
        .from("room_members")
        .update({
          user_id: user.id,
          status: "joined",
          joined_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          invitedMember.id
        );

      if (updateError) {
        console.error(
          "Could not claim invite:",
          updateError
        );

        setError(
          "I couldn't join the group. Please try again."
        );

        setJoining(false);

        return;
      }
    } else {
      /*
       * No pre-created invite with
       * this display name.
       *
       * Add the person as a new
       * joined member.
       */

      const {
        error: insertError,
      } = await supabase
        .from("room_members")
        .insert({
          room_id: room.id,
          user_id: user.id,
          display_name: name,
          phone: null,
          role: "member",
          status: "joined",
          joined_at:
            new Date()
              .toISOString(),
        });

      if (insertError) {
        console.error(
          "Could not create member:",
          insertError
        );

        setError(
          "I couldn't join the group. Please try again."
        );

        setJoining(false);

        return;
      }
    }

    /* ------------------------
       4. Remember identity locally

       This stores only the display
       name used by this browser.

       Supabase auth remains the
       authoritative user identity.
       ------------------------ */

    localStorage.setItem(
      `balance-current-user-${room.code}`,
      name
    );

    /* ------------------------
       5. Add group-safe system
          message.

       No private schedule or phone
       information is exposed.
       ------------------------ */

    const {
      error: messageError,
    } = await supabase
      .from("messages")
      .insert({
        room_id: room.id,
        sender_name: "Cubbie",
        sender_type: "system",
        body:
          `${name} joined the group`,
      });

    if (messageError) {
      /*
       * Joining succeeded even if
       * this cosmetic system message
       * fails, so do not block entry.
       */

      console.error(
        "Join message failed:",
        messageError
      );
    }

    /* ------------------------
       6. Enter room
       ------------------------ */

    router.push(
      `/room?code=${room.code}`
    );
  }

  /* ==========================================================
     UI
     ========================================================== */

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">

      {/* =====================================================
          NAV
          ===================================================== */}

      <nav className="border-b border-slate-200 bg-white">

        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">

          <Link
            href="/"
            className="flex items-center gap-3"
          >

            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-md shadow-violet-200">

              <MessageCircle
                size={20}
              />

            </div>

            <div>

              <div className="font-semibold">
                Balance Together
              </div>

              <div className="text-xs text-slate-400">
                powered by Cubbie
              </div>

            </div>

          </Link>

          <div className="hidden items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 sm:flex">

            <ShieldCheck
              size={14}
            />

            Private by default

          </div>

        </div>

      </nav>

      {/* =====================================================
          CONTENT
          ===================================================== */}

      <div className="mx-auto max-w-xl px-5 py-12">

        <Link
          href="/"
          className="mb-7 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >

          <ArrowLeft
            size={17}
          />

          Back

        </Link>

        <div className="rounded-[30px] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60">

          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">

            <Users
              size={22}
            />

          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-tight">
            Join a group
          </h1>

          {/* =================================================
              ROOM CODE ENTRY
              ================================================= */}

          {!room && (
            <>

              <p className="mt-2 leading-7 text-slate-500">
                Enter the invite code your friend shared.
              </p>

              <label className="mt-6 block">

                <span className="text-sm font-medium text-slate-700">
                  Room code
                </span>

                <input
                  value={code}
                  onChange={(event) => {
                    setCode(
                      event.target.value
                        .toUpperCase()
                    );

                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      findRoom();
                    }
                  }}
                  maxLength={6}
                  placeholder="ABC123"
                  autoComplete="off"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3.5 font-mono uppercase tracking-[0.2em] outline-none transition placeholder:text-slate-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
                />

              </label>

              <button
                type="button"
                onClick={() =>
                  findRoom()
                }
                disabled={
                  loading ||
                  !code.trim()
                }
                className="mt-4 w-full rounded-2xl bg-violet-600 py-3.5 font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
              >

                {loading
                  ? "Finding group..."
                  : "Continue"}

              </button>

            </>
          )}

          {/* =================================================
              ROOM FOUND
              ================================================= */}

          {room && (
            <>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">

                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  You&apos;re joining
                </div>

                <div className="mt-2 text-xl font-semibold">
                  {room.name}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">

                  <span>
                    {members.length}{" "}
                    {members.length === 1
                      ? "member"
                      : "members"}
                  </span>

                  <span>·</span>

                  <span className="font-mono font-medium tracking-wider">
                    {room.code}
                  </span>

                </div>

                {members.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">

                    {members
                      .slice(0, 5)
                      .map(
                        (member) => (
                          <span
                            key={
                              member.id
                            }
                            className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600 shadow-sm ring-1 ring-slate-200"
                          >
                            {
                              member.display_name
                            }
                          </span>
                        )
                      )}

                    <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                      Cubbie
                    </span>

                  </div>
                )}

              </div>

              {/* =============================================
                  DISPLAY NAME
                  ============================================= */}

              <label className="mt-6 block">

                <span className="text-sm font-medium text-slate-700">
                  Your name
                </span>

                <p className="mt-1 text-xs leading-5 text-slate-400">
                  If you were already invited,
                  use the same name from the
                  invitation.
                </p>

                <input
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(
                      event.target.value
                    );

                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key ===
                      "Enter" &&
                      displayName.trim()
                    ) {
                      joinRoom();
                    }
                  }}
                  placeholder="Maya"
                  autoComplete="name"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3.5 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
                />

              </label>

              {/* =============================================
                  PRIVACY EXPLANATION
                  ============================================= */}

              <div className="mt-5 flex gap-3 rounded-2xl border border-violet-100 bg-violet-50 p-4">

                <LockKeyhole
                  size={18}
                  className="mt-0.5 shrink-0 text-violet-600"
                />

                <div>

                  <div className="text-sm font-semibold text-violet-950">
                    Your private context stays yours
                  </div>

                  <p className="mt-1 text-sm leading-6 text-violet-800/75">
                    Joining does not expose
                    your private schedule.
                    Your browser gets its own
                    private Cubbie identity,
                    and only the minimum
                    coordination information
                    will be shared with the group.
                  </p>

                </div>

              </div>

              {/* =============================================
                  JOIN BUTTON
                  ============================================= */}

              <button
                type="button"
                onClick={joinRoom}
                disabled={
                  !displayName.trim() ||
                  joining
                }
                className="mt-6 w-full rounded-2xl bg-violet-600 py-3.5 font-semibold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
              >

                {joining
                  ? "Joining..."
                  : `Join ${room.name}`}

              </button>

              <button
                type="button"
                onClick={() => {
                  setRoom(null);
                  setMembers([]);
                  setDisplayName("");
                  setError("");
                }}
                className="mt-3 w-full py-2 text-sm font-medium text-slate-400 transition hover:text-slate-700"
              >
                Use a different code
              </button>

            </>
          )}

          {/* =================================================
              ERROR
              ================================================= */}

          {error && (
            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-700">
              {error}
            </div>
          )}

        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400">

          <LockKeyhole
            size={12}
          />

          Phone numbers and private reasons
          are never shown in the group chat.

        </div>

      </div>

    </main>
  );
}

/* ============================================================
   LOADING
   ============================================================ */

function JoinLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7fb]">

      <div className="text-center">

        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200">
          <Users
            size={20}
          />
        </div>

        <div className="mt-4 text-sm font-medium text-slate-600">
          Opening invite...
        </div>

      </div>

    </main>
  );
}