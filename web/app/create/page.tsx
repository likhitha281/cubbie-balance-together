"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  ArrowLeft,
  Copy,
  LockKeyhole,
  MessageCircle,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { ensureAnonymousUser } from "../../lib/auth";

type Invitee = {
  id: number;
  name: string;
  phone: string;
};

type RoomMember = {
  name: string;
  phone: string;
  role: "creator" | "member";
  status: "joined" | "invited";
};

type StoredRoom = {
  code: string;
  name: string;
  createdAt: string;
  members: RoomMember[];
};

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  return Array.from({ length: 6 }, () => {
    return chars[Math.floor(Math.random() * chars.length)];
  }).join("");
}

function cleanPhone(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function looksLikePhone(phone: string) {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length >= 7;
}

export default function CreateGroupPage() {
  const router = useRouter();

  const [creatorName, setCreatorName] = useState("");
  const [groupName, setGroupName] = useState("");

  const [invitees, setInvitees] = useState<Invitee[]>([
    {
      id: 1,
      name: "",
      phone: "",
    },
  ]);

  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  function addInvitee() {
    setInvitees((current) => {
      const nextId =
        current.length === 0
          ? 1
          : Math.max(...current.map((item) => item.id)) + 1;

      return [
        ...current,
        {
          id: nextId,
          name: "",
          phone: "",
        },
      ];
    });
  }

  function updateInvitee(
    id: number,
    field: "name" | "phone",
    value: string
  ) {
    setInvitees((current) =>
      current.map((invitee) =>
        invitee.id === id
          ? {
              ...invitee,
              [field]: value,
            }
          : invitee
      )
    );
  }

  function removeInvitee(id: number) {
    setInvitees((current) =>
      current.filter((invitee) => invitee.id !== id)
    );
  }

  function validate() {
    if (!creatorName.trim()) {
      return "Enter your name.";
    }

    if (!groupName.trim()) {
      return "Give your group a name.";
    }

    const partiallyFilled = invitees.find((invitee) => {
      const hasName = Boolean(invitee.name.trim());
      const hasPhone = Boolean(invitee.phone.trim());

      return hasName !== hasPhone;
    });

    if (partiallyFilled) {
      return "For each invite, enter both a name and phone number.";
    }

    const invalidPhone = invitees.find(
      (invitee) =>
        invitee.phone.trim() && !looksLikePhone(invitee.phone)
    );

    if (invalidPhone) {
      return `Check the phone number for ${
        invalidPhone.name || "one of your invitees"
      }.`;
    }

    return "";
  }

  async function createGroup() {
    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setCreating(true);

    let user;

try {
  user = await ensureAnonymousUser();
} catch (authError) {
  console.error("Anonymous auth failed:", authError);

  setError(
    "I couldn't create your private identity. Please try again."
  );

  setCreating(false);
  return;
}

if (!user) {
  setError(
    "I couldn't create your private identity. Please try again."
  );

  setCreating(false);
  return;
}

    const code = makeRoomCode();

    const invitedMembers: RoomMember[] = invitees
      .filter(
        (invitee) =>
          invitee.name.trim() && invitee.phone.trim()
      )
      .map((invitee) => ({
        name: invitee.name.trim(),
        phone: cleanPhone(invitee.phone),
        role: "member",
        status: "invited",
      }));

    const { data: createdRoom, error: roomError } =
  await supabase
    .from("rooms")
    .insert({
      code,
      name: groupName.trim(),
      created_by_name: creatorName.trim(),
    })
    .select()
    .single();

if (roomError || !createdRoom) {
  console.error(roomError);

  setError(
    "I couldn't create the group. Please try again."
  );

  setCreating(false);
  return;
}

const members = [
  {
    room_id: createdRoom.id,
    user_id: user.id,
    display_name: creatorName.trim(),
    phone: null,
    role: "creator",
    status: "joined",
    joined_at: new Date().toISOString(),
  },

  ...invitedMembers.map((member) => ({
    room_id: createdRoom.id,
    display_name: member.name,
    phone: member.phone || null,
    role: "member",
    status: "invited",
    joined_at: null,
  })),
];

const { error: memberError } =
  await supabase
    .from("room_members")
    .insert(members);

if (memberError) {
  console.error(memberError);

  setError(
    "The room was created, but I couldn't add all members."
  );

  setCreating(false);
  return;
}

localStorage.setItem(
  `balance-current-user-${code}`,
  creatorName.trim()
);

router.push(`/room?code=${code}`);
  }

  const activeInvitees = invitees.filter(
    (invitee) =>
      invitee.name.trim() || invitee.phone.trim()
  );

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      {/* Top navigation */}
      <nav className="border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
          <Link
            href="/"
            className="flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200">
              <MessageCircle size={20} />
            </div>

            <div>
              <div className="font-semibold tracking-tight">
                Balance Together
              </div>

              <div className="text-xs text-slate-400">
                powered by Cubbie
              </div>
            </div>
          </Link>

          <div className="hidden items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 sm:flex">
            <ShieldCheck size={14} />
            Private by default
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-5 py-10 md:px-8 md:py-14">
        <Link
          href="/"
          className="mb-7 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft size={17} />
          Back
        </Link>

        <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_80px_-35px_rgba(15,23,42,0.28)]">
          {/* Header */}
          <div className="border-b border-slate-100 px-6 py-7 md:px-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <Users size={23} />
            </div>

            <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
              Create a group
            </h1>

            <p className="mt-2 max-w-xl leading-7 text-slate-500">
              Start the chat now. Friends can join with an invite
              link or room code once the group is created.
            </p>
          </div>

          <div className="space-y-8 p-6 md:p-8">
            {/* Creator */}
            <section>
              <SectionLabel
                number="1"
                title="Who are you?"
                description="This is the name your friends will see in the group."
              />

              <input
                value={creatorName}
                onChange={(event) => {
                  setCreatorName(event.target.value);
                  setError("");
                }}
                placeholder="Your name"
                autoComplete="name"
                className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
              />
            </section>

            {/* Group */}
            <section>
              <SectionLabel
                number="2"
                title="What's the group called?"
                description="Make it recognizable — just like a normal group chat."
              />

              <input
                value={groupName}
                onChange={(event) => {
                  setGroupName(event.target.value);
                  setError("");
                }}
                placeholder="Friday Night 🍕"
                className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
              />
            </section>

            {/* Invitees */}
            <section>
              <SectionLabel
                number="3"
                title="Who's in?"
                description="Add people now, or invite more after creating the group."
              />

              <div className="mt-4 space-y-3">
                {invitees.map((invitee, index) => (
                  <InviteCard
                    key={invitee.id}
                    invitee={invitee}
                    index={index}
                    removable={invitees.length > 1}
                    onUpdate={updateInvitee}
                    onRemove={removeInvitee}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={addInvitee}
                className="mt-4 inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-violet-600 transition hover:bg-violet-50"
              >
                <Plus size={17} />
                Add another person
              </button>
            </section>

            {/* Privacy */}
            <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
              <div className="flex gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm">
                  <LockKeyhole size={16} />
                </div>

                <div>
                  <div className="text-sm font-semibold text-violet-950">
                    Phone numbers stay out of the group chat
                  </div>

                  <p className="mt-1 text-sm leading-6 text-violet-800/70">
                    They&apos;re only used for invitations and
                    identity. Cubbie coordinates using private
                    agent information without posting why someone
                    is busy.
                  </p>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            {/* Summary */}
            {(creatorName.trim() ||
              groupName.trim() ||
              activeInvitees.length > 0) && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Group preview
                </div>

                <div className="mt-2 font-semibold">
                  {groupName.trim() || "Untitled group"}
                </div>

                <div className="mt-1 text-sm text-slate-500">
                  {[
                    creatorName.trim(),
                    ...activeInvitees.map((item) =>
                      item.name.trim()
                    ),
                    "Cubbie",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              type="button"
              onClick={createGroup}
              disabled={
                creating ||
                !creatorName.trim() ||
                !groupName.trim()
              }
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-4 font-semibold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              <Users size={18} />

              {creating ? "Creating..." : "Create group"}
            </button>

            <p className="text-center text-xs leading-5 text-slate-400">
              You&apos;ll get a shareable room code after creating
              the group.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function SectionLabel({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
        {number}
      </div>

      <div>
        <h2 className="font-semibold text-slate-900">
          {title}
        </h2>

        <p className="mt-0.5 text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}

function InviteCard({
  invitee,
  index,
  removable,
  onUpdate,
  onRemove,
}: {
  invitee: Invitee;
  index: number;
  removable: boolean;
  onUpdate: (
    id: number,
    field: "name" | "phone",
    value: string
  ) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Person {index + 1}
        </span>

        {removable && (
          <button
            type="button"
            onClick={() => onRemove(invitee.id)}
            aria-label={`Remove person ${index + 1}`}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={invitee.name}
          onChange={(event) =>
            onUpdate(
              invitee.id,
              "name",
              event.target.value
            )
          }
          placeholder="Name"
          autoComplete="off"
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
        />

        <input
          value={invitee.phone}
          onChange={(event) =>
            onUpdate(
              invitee.id,
              "phone",
              event.target.value
            )
          }
          placeholder="+1 480 555 0123"
          type="tel"
          autoComplete="off"
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
        />
      </div>
    </div>
  );
}