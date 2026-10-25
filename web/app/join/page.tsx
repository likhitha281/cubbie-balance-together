"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  LockKeyhole,
  MessageCircle,
  Users,
} from "lucide-react";
import {
  Suspense,
  useEffect,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";

type Room = {
  id: string;
  code: string;
  name: string;
};

type Member = {
  id: string;
  display_name: string;
  status: string;
};

export default function JoinPage() {
  return (
    <Suspense fallback={<JoinLoading />}>
      <JoinExperience />
    </Suspense>
  );
}

function JoinExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialCode =
    searchParams.get("code")?.toUpperCase() ?? "";

  const [code, setCode] = useState(initialCode);
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(Boolean(initialCode));
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!initialCode) {
      return;
    }

    findRoom(initialCode);
  }, [initialCode]);

  async function findRoom(roomCode?: string) {
    const targetCode = (roomCode ?? code)
      .trim()
      .toUpperCase();

    if (!targetCode) {
      setError("Enter a room code.");
      return;
    }

    setLoading(true);
    setError("");
    setRoom(null);

    const { data: roomData, error: roomError } =
      await supabase
        .from("rooms")
        .select("id, code, name")
        .eq("code", targetCode)
        .single();

    if (roomError || !roomData) {
      setError("I couldn't find that group.");
      setLoading(false);
      return;
    }

    const { data: memberData } =
      await supabase
        .from("room_members")
        .select("id, display_name, status")
        .eq("room_id", roomData.id)
        .order("created_at", {
          ascending: true,
        });

    setCode(targetCode);
    setRoom(roomData);
    setMembers(memberData ?? []);
    setLoading(false);
  }

  async function joinRoom() {
    if (!room || !displayName.trim()) {
      return;
    }

    setJoining(true);
    setError("");

    const name = displayName.trim();

    /*
     * If the creator already invited this display name,
     * claim that existing invitation instead of creating
     * a duplicate member.
     */
    const invitedMember = members.find(
      (member) =>
        member.display_name.toLowerCase() ===
        name.toLowerCase()
    );

    if (invitedMember) {
      const { error: updateError } =
        await supabase
          .from("room_members")
          .update({
            status: "joined",
            joined_at: new Date().toISOString(),
          })
          .eq("id", invitedMember.id);

      if (updateError) {
        console.error(updateError);
        setError("I couldn't join the group.");
        setJoining(false);
        return;
      }
    } else {
      const { error: insertError } =
        await supabase
          .from("room_members")
          .insert({
            room_id: room.id,
            display_name: name,
            phone: null,
            role: "member",
            status: "joined",
            joined_at: new Date().toISOString(),
          });

      if (insertError) {
        console.error(insertError);
        setError("I couldn't join the group.");
        setJoining(false);
        return;
      }
    }

    localStorage.setItem(
      `balance-current-user-${room.code}`,
      name
    );

    await supabase
      .from("messages")
      .insert({
        room_id: room.id,
        sender_name: "Cubbie",
        sender_type: "system",
        body: `${name} joined the group`,
      });

    router.push(`/room?code=${room.code}`);
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center px-5 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-600 text-white">
              <MessageCircle size={20} />
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
        </div>
      </nav>

      <div className="mx-auto max-w-xl px-5 py-12">
        <Link
          href="/"
          className="mb-7 inline-flex items-center gap-2 text-sm text-slate-500"
        >
          <ArrowLeft size={17} />
          Back
        </Link>

        <div className="rounded-[30px] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
            <Users size={22} />
          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-tight">
            Join a group
          </h1>

          {!room && (
            <>
              <p className="mt-2 text-slate-500">
                Enter the invite code your friend shared.
              </p>

              <input
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.toUpperCase())
                }
                maxLength={6}
                placeholder="ABC123"
                className="mt-6 w-full rounded-2xl border border-slate-200 px-4 py-3.5 font-mono uppercase tracking-[0.2em] outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
              />

              <button
                type="button"
                onClick={() => findRoom()}
                disabled={loading}
                className="mt-4 w-full rounded-2xl bg-violet-600 py-3.5 font-semibold text-white"
              >
                {loading ? "Finding group..." : "Continue"}
              </button>
            </>
          )}

          {room && (
            <>
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  You're joining
                </div>

                <div className="mt-2 text-xl font-semibold">
                  {room.name}
                </div>

                <div className="mt-1 text-sm text-slate-500">
                  {members.length} members · {room.code}
                </div>
              </div>

              <label className="mt-6 block">
                <span className="text-sm font-medium text-slate-700">
                  Your name
                </span>

                <input
                  value={displayName}
                  onChange={(event) =>
                    setDisplayName(event.target.value)
                  }
                  placeholder="Maya"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3.5 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
                />
              </label>

              <div className="mt-5 flex gap-3 rounded-2xl border border-violet-100 bg-violet-50 p-4">
                <LockKeyhole
                  size={18}
                  className="mt-0.5 shrink-0 text-violet-600"
                />

                <p className="text-sm leading-6 text-violet-800">
                  Joining the group does not expose your private
                  schedule. You'll set up what your Cubbie can use
                  privately after joining.
                </p>
              </div>

              <button
                type="button"
                onClick={joinRoom}
                disabled={!displayName.trim() || joining}
                className="mt-6 w-full rounded-2xl bg-violet-600 py-3.5 font-semibold text-white disabled:opacity-40"
              >
                {joining
                  ? "Joining..."
                  : `Join ${room.name}`}
              </button>
            </>
          )}

          {error && (
            <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function JoinLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7fb]">
      <div className="text-slate-500">
        Opening invite...
      </div>
    </main>
  );
}