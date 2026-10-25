"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  LockKeyhole,
  MessageCircle,
  MoreVertical,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  FormEvent,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";

/* ============================================================
   TYPES
   ============================================================ */

type RoomMember = {
  id: string;
  name: string;
  phone: string;
  role: "creator" | "member";
  status: "joined" | "invited";
};

type StoredRoom = {
  id: string;
  code: string;
  name: string;
  createdAt: string;
  members: RoomMember[];
};

type MessageKind = "human" | "cubbie" | "system";

type Message = {
  id: string;
  sender: string;
  body: string;
  kind: MessageKind;
  mine?: boolean;
  time: string;
};

/* ============================================================
   HELPERS
   ============================================================ */

function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(
    typeof value === "string"
      ? new Date(value)
      : value
  );
}

function makeMessageId() {
  return crypto.randomUUID();
}

/* ============================================================
   PAGE
   ============================================================ */

export default function RoomPage() {
  return (
    <Suspense fallback={<RoomLoading />}>
      <RoomExperience />
    </Suspense>
  );
}

/* ============================================================
   ROOM EXPERIENCE
   ============================================================ */

function RoomExperience() {
  const searchParams = useSearchParams();

  const code =
    searchParams.get("code")?.toUpperCase() ?? "";

  const [room, setRoom] =
    useState<StoredRoom | null>(null);

  const [currentUser, setCurrentUser] =
    useState("");

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [composer, setComposer] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [sending, setSending] =
    useState(false);

  const [cubbieTyping, setCubbieTyping] =
    useState(false);

  const [copied, setCopied] =
    useState(false);

  const bottomRef =
    useRef<HTMLDivElement | null>(null);

  /* ==========================================================
     LOAD ROOM FROM SUPABASE
     ========================================================== */

  useEffect(() => {
  if (!room) {
    return;
  }

  const channel = supabase
    .channel(`room-messages-${room.id}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `room_id=eq.${room.id}`,
      },
      (payload) => {
        const row = payload.new;

        const incoming: Message = {
          id: row.id,
          sender: row.sender_name,
          body: row.body,
          kind: row.sender_type as MessageKind,
          mine: row.sender_name === currentUser,
          time: formatTime(row.created_at),
        };

        setMessages((current) => {
          if (
            current.some(
              (message) => message.id === incoming.id
            )
          ) {
            return current;
          }

          return [...current, incoming];
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [room, currentUser]);

  useEffect(() => {
    if (!code) {
      setLoading(false);
      return;
    }

    async function loadRoom() {
      setLoading(true);

      /* ------------------------
         1. Find room
         ------------------------ */

      const {
        data: roomData,
        error: roomError,
      } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code)
        .single();

      if (roomError || !roomData) {
        console.error(
          "Room lookup failed:",
          roomError
        );

        setRoom(null);
        setLoading(false);

        return;
      }

      /* ------------------------
         2. Load members
         ------------------------ */

      const {
        data: memberData,
        error: memberError,
      } = await supabase
        .from("room_members")
        .select("*")
        .eq("room_id", roomData.id)
        .order("created_at", {
          ascending: true,
        });

      if (memberError) {
        console.error(
          "Member lookup failed:",
          memberError
        );

        setRoom(null);
        setLoading(false);

        return;
      }

      const loadedRoom: StoredRoom = {
        id: roomData.id,
        code: roomData.code,
        name: roomData.name,
        createdAt: roomData.created_at,

        members: (memberData ?? []).map(
          (member) => ({
            id: member.id,
            name: member.display_name,
            phone: member.phone ?? "",
            role: member.role,
            status: member.status,
          })
        ),
      };

      setRoom(loadedRoom);

      /* ------------------------
         3. Current browser user
         ------------------------ */

      const storedUser =
        localStorage.getItem(
          `balance-current-user-${code}`
        );

      const fallbackCreator =
        loadedRoom.members.find(
          (member) =>
            member.role === "creator"
        )?.name;

      setCurrentUser(
        storedUser ||
          fallbackCreator ||
          "You"
      );

      /* ------------------------
         4. Load messages
         ------------------------ */

      const {
        data: messageData,
        error: messageError,
      } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", roomData.id)
        .order("created_at", {
          ascending: true,
        });

      if (messageError) {
        console.error(
          "Message lookup failed:",
          messageError
        );
      }

      if (
        messageData &&
        messageData.length > 0
      ) {
        setMessages(
          messageData.map(
            (message) => ({
              id: message.id,

              sender:
                message.sender_name,

              body:
                message.body,

              kind:
                message.sender_type as MessageKind,

              mine:
                message.sender_name ===
                storedUser,

              time:
                formatTime(
                  message.created_at
                ),
            })
          )
        );
      } else {
        /*
         * First opening of this room.
         * Create shared welcome messages.
         */

        const welcomeMessages = [
          {
            room_id: roomData.id,

            sender_name: "Cubbie",

            sender_type: "cubbie",

            body:
              `group's ready 🎉 ` +
              `code: ${code}`,
          },

          {
            room_id: roomData.id,

            sender_name: "Cubbie",

            sender_type: "cubbie",

            body:
              "need help planning? " +
              "just @ me. i'll check " +
              "with everyone privately.",
          },
        ];

        const {
          data: insertedMessages,
          error: welcomeError,
        } = await supabase
          .from("messages")
          .insert(welcomeMessages)
          .select();

        if (welcomeError) {
          console.error(
            "Welcome messages failed:",
            welcomeError
          );
        } else if (insertedMessages) {
          setMessages(
            insertedMessages.map(
              (message) => ({
                id: message.id,

                sender:
                  message.sender_name,

                body:
                  message.body,

                kind:
                  message.sender_type as MessageKind,

                mine: false,

                time:
                  formatTime(
                    message.created_at
                  ),
              })
            )
          );
        }
      }

      setLoading(false);
    }

    loadRoom();
  }, [code]);

  /* ==========================================================
     SCROLL TO NEWEST MESSAGE
     ========================================================== */

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, cubbieTyping]);

  /* ==========================================================
     MEMBER NAMES
     ========================================================== */

  const memberNames =
    useMemo(() => {
      if (!room) {
        return [];
      }

      return room.members.map(
        (member) => member.name
      );
    }, [room]);

  /* ==========================================================
     INVITE LINK
     ========================================================== */

  const inviteLink =
    typeof window !== "undefined" &&
    code
      ? `${window.location.origin}/join?code=${code}`
      : "";

  async function copyInvite() {
    if (!inviteLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        inviteLink
      );

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch (error) {
      console.error(
        "Could not copy invite:",
        error
      );
    }
  }

  /* ==========================================================
     INSERT MESSAGE INTO SUPABASE
     ========================================================== */

  async function insertMessage({
    sender,
    body,
    kind,
  }: {
    sender: string;
    body: string;
    kind: MessageKind;
  }) {
    if (!room) {
      return null;
    }

    const {
      data,
      error,
    } = await supabase
      .from("messages")
      .insert({
        room_id: room.id,
        sender_name: sender,
        sender_type: kind,
        body,
      })
      .select()
      .single();

    if (error || !data) {
      console.error(
        "Message insert failed:",
        error
      );

      return null;
    }

    const newMessage: Message = {
      id: data.id,
      sender: data.sender_name,
      body: data.body,

      kind:
        data.sender_type as MessageKind,

      mine:
        data.sender_name ===
        currentUser,

      time:
        formatTime(data.created_at),
    };

    setMessages((current) => {
      /*
       * Prevent accidental duplicate
       * rendering when we later add
       * Supabase Realtime.
       */
      if (
        current.some(
          (message) =>
            message.id ===
            newMessage.id
        )
      ) {
        return current;
      }

      return [
        ...current,
        newMessage,
      ];
    });

    return newMessage;
  }

  /* ==========================================================
     PRIVACY BOUNDARY
     ========================================================== */

  function answerPrivacyQuestion(
    text: string
  ) {
    const normalized =
      text.toLowerCase();

    const identityQuestion =
      normalized.includes(
        "who can't"
      ) ||
      normalized.includes(
        "who cant"
      ) ||
      normalized.includes(
        "who cannot"
      ) ||
      normalized.includes(
        "who is busy"
      ) ||
      normalized.includes(
        "who rejected"
      );

    const reasonQuestion =
      normalized.includes(
        "why can't"
      ) ||
      normalized.includes(
        "why cant"
      ) ||
      normalized.includes(
        "why doesn't"
      ) ||
      normalized.includes(
        "why doesnt"
      ) ||
      normalized.includes(
        "why not"
      );

    if (identityQuestion) {
      return (
        "i keep individual availability " +
        "private by default. i can work " +
        "around it without identifying anyone."
      );
    }

    if (reasonQuestion) {
      return (
        "that conflicts with private " +
        "constraints in the group. " +
        "i can find a better option, " +
        "but i won't share anyone's " +
        "schedule details unless they " +
        "choose to."
      );
    }

    return null;
  }

  /* ==========================================================
     TEMPORARY COORDINATION RESPONSE
     ========================================================== */

  function buildCoordinationResponse() {
    /*
     * IMPORTANT:
     *
     * This response does NOT fabricate
     * a recommended time.
     *
     * The actual TypeScript negotiation
     * engine will replace this in the
     * next milestone.
     */

    return (
      "checking everyone's constraints " +
      "privately — give me a sec. " +
      "i'll only bring the group the " +
      "options that work."
    );
  }

  /* ==========================================================
     CUBBIE RESPONSE
     ========================================================== */

  async function handleCubbieRequest(
    text: string
  ) {
    const privacyAnswer =
      answerPrivacyQuestion(text);

    setCubbieTyping(true);

    await new Promise((resolve) =>
      window.setTimeout(
        resolve,
        700
      )
    );

    setCubbieTyping(false);

    await insertMessage({
      sender: "Cubbie",

      body:
        privacyAnswer ??
        buildCoordinationResponse(),

      kind: "cubbie",
    });

    if (!privacyAnswer) {
      setCubbieTyping(true);

      await new Promise((resolve) =>
        window.setTimeout(
          resolve,
          900
        )
      );

      setCubbieTyping(false);

      await insertMessage({
        sender: "Cubbie",

        body:
          "i'm ready to compare times. " +
          "once everyone has private " +
          "availability set up, i'll " +
          "negotiate the best fit without " +
          "posting anyone's reasons.",

        kind: "cubbie",
      });
    }
  }

  /* ==========================================================
     SEND HUMAN MESSAGE
     ========================================================== */

  async function sendMessage(
    event: FormEvent
  ) {
    event.preventDefault();

    const body =
      composer.trim();

    if (
      !body ||
      !room ||
      sending
    ) {
      return;
    }

    setComposer("");
    setSending(true);

    const inserted =
      await insertMessage({
        sender:
          currentUser || "You",

        body,

        kind: "human",
      });

    setSending(false);

    if (!inserted) {
      /*
       * Restore message if insert failed.
       */
      setComposer(body);
      return;
    }

    const normalized =
      body.toLowerCase();

    const shouldAskCubbie =
      normalized.includes(
        "@cubbie"
      ) ||
      normalized.includes(
        "who can't"
      ) ||
      normalized.includes(
        "who cant"
      ) ||
      normalized.includes(
        "who cannot"
      ) ||
      normalized.includes(
        "who is busy"
      ) ||
      normalized.includes(
        "who rejected"
      ) ||
      normalized.includes(
        "why can't"
      ) ||
      normalized.includes(
        "why cant"
      ) ||
      normalized.includes(
        "why doesn't"
      ) ||
      normalized.includes(
        "why doesnt"
      ) ||
      normalized.includes(
        "why not"
      );

    if (shouldAskCubbie) {
      await handleCubbieRequest(
        body
      );
    }
  }

  /* ==========================================================
     STATES
     ========================================================== */

  if (loading) {
    return <RoomLoading />;
  }

  if (!code || !room) {
    return (
      <RoomNotFound code={code} />
    );
  }

  /* ==========================================================
     UI
     ========================================================== */

  return (
    <main className="min-h-screen bg-[#eef0f5] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-7xl items-stretch justify-center md:px-6 md:py-6">
        <div className="grid w-full overflow-hidden bg-white shadow-2xl shadow-slate-300/50 md:min-h-[calc(100vh-48px)] md:max-w-6xl md:grid-cols-[280px_1fr] md:rounded-[30px]">

          {/* =================================================
              DESKTOP SIDEBAR
              ================================================= */}

          <aside className="hidden border-r border-slate-200 bg-[#fafafa] md:flex md:flex-col">

            <div className="border-b border-slate-200 p-5">
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
            </div>

            <div className="p-4">
              <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                This group
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">

                <div className="font-semibold">
                  {room.name}
                </div>

                <div className="mt-1 text-xs text-slate-400">
                  {room.members.length + 1}{" "}
                  participants
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">

                  {memberNames.map(
                    (name) => (
                      <span
                        key={name}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                      >
                        {name}
                      </span>
                    )
                  )}

                  <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                    Cubbie
                  </span>

                </div>
              </div>
            </div>

            <div className="mt-auto p-4">
              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">

                <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
                  <ShieldCheck
                    size={16}
                  />
                  Private by default
                </div>

                <p className="mt-2 text-xs leading-5 text-violet-700/70">
                  The group sees
                  coordination results,
                  not private reasons or
                  schedule details.
                </p>

              </div>
            </div>

          </aside>

          {/* =================================================
              CHAT
              ================================================= */}

          <section className="flex min-h-screen min-w-0 flex-col bg-[#f4f5f8] md:min-h-0">

            {/* HEADER */}

            <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-5">

              <Link
                href="/"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 md:hidden"
              >
                <ArrowLeft
                  size={20}
                />
              </Link>

              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-rose-100 text-xl">
                💬
              </div>

              <div className="min-w-0 flex-1">

                <div className="truncate font-semibold">
                  {room.name}
                </div>

                <div className="truncate text-xs text-slate-400">
                  {[
                    ...memberNames,
                    "Cubbie",
                  ].join(" · ")}
                </div>

              </div>

              <button
                type="button"
                onClick={copyInvite}
                className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 sm:flex"
              >
                {copied ? (
                  <Check size={15} />
                ) : (
                  <Copy size={15} />
                )}

                {copied
                  ? "Copied"
                  : "Invite"}
              </button>

              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100"
                aria-label="More options"
              >
                <MoreVertical
                  size={20}
                />
              </button>

            </header>

            {/* ROOM CODE */}

            <div className="border-b border-slate-200 bg-white px-4 py-2.5">

              <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 text-xs text-slate-400">

                <Users size={13} />

                Room code

                <span className="font-mono font-semibold tracking-wider text-slate-700">
                  {code}
                </span>

                <span>·</span>

                <button
                  type="button"
                  onClick={copyInvite}
                  className="font-medium text-violet-600 hover:text-violet-700"
                >
                  {copied
                    ? "Invite copied"
                    : "Copy invite"}
                </button>

              </div>

            </div>

            {/* MESSAGES */}

            <div className="flex-1 overflow-y-auto px-4 py-6">

              <div className="mx-auto max-w-3xl space-y-4">

                <div className="flex justify-center">

                  <div className="rounded-full bg-white px-3 py-1.5 text-[11px] text-slate-400 shadow-sm ring-1 ring-slate-200">
                    Today
                  </div>

                </div>

                {messages.map(
                  (message) => (
                    <ChatBubble
                      key={message.id}
                      message={message}
                    />
                  )
                )}

                {cubbieTyping && (
                  <CubbieTyping />
                )}

                <div ref={bottomRef} />

              </div>

            </div>

            {/* PRIVACY HINT */}

            <div className="border-t border-slate-200 bg-white/70 px-4 py-2">

              <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 text-[11px] text-slate-400">

                <LockKeyhole
                  size={12}
                />

                Cubbie won&apos;t reveal
                why someone is unavailable
                unless they choose to
                share it.

              </div>

            </div>

            {/* COMPOSER */}

            <form
              onSubmit={sendMessage}
              className="border-t border-slate-200 bg-white p-3 md:p-4"
            >

              <div className="mx-auto flex max-w-3xl items-end gap-2">

                <button
                  type="button"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-500 transition hover:bg-slate-200"
                >
                  +
                </button>

                <div className="flex min-h-11 flex-1 items-center rounded-[22px] bg-slate-100 px-4">

                  <input
                    value={composer}
                    onChange={(event) =>
                      setComposer(
                        event.target.value
                      )
                    }
                    placeholder={
                      `Message ${room.name}...`
                    }
                    className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-400"
                  />

                </div>

                <button
                  type="submit"
                  disabled={
                    !composer.trim() ||
                    sending
                  }
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-md shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                >
                  <Send size={18} />
                </button>

              </div>

              <div className="mx-auto mt-2 max-w-3xl px-14 text-[11px] text-slate-400">

                Try:{" "}

                <span className="font-medium text-violet-600">
                  @Cubbie find a time
                  for us this weekend
                </span>

              </div>

            </form>

          </section>

        </div>
      </div>
    </main>
  );
}

/* ============================================================
   CHAT BUBBLE
   ============================================================ */

function ChatBubble({
  message,
}: {
  message: Message;
}) {
  if (message.kind === "system") {
    return (
      <div className="flex justify-center">

        <div className="rounded-full bg-white px-3 py-1.5 text-xs text-slate-400 shadow-sm ring-1 ring-slate-200">
          {message.body}
        </div>

      </div>
    );
  }

  const isCubbie =
    message.kind === "cubbie";

  if (isCubbie) {
    return (
      <div className="max-w-[88%] md:max-w-[72%]">

        <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium text-violet-600">

          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[8px] text-white">
            C
          </div>

          Cubbie

          <span className="font-normal text-slate-400">
            {message.time}
          </span>

        </div>

        <div className="rounded-2xl rounded-tl-md bg-violet-600 px-4 py-3 text-sm leading-6 text-white shadow-md shadow-violet-100">
          {message.body}
        </div>

      </div>
    );
  }

  return (
    <div
      className={`flex ${
        message.mine
          ? "justify-end"
          : "justify-start"
      }`}
    >

      <div className="max-w-[82%] md:max-w-[68%]">

        <div
          className={`mb-1 flex items-center gap-2 px-1 text-[11px] ${
            message.mine
              ? "justify-end text-slate-400"
              : "text-slate-500"
          }`}
        >

          <span className="font-medium">
            {message.sender}
          </span>

          <span>
            {message.time}
          </span>

        </div>

        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm ${
            message.mine
              ? "rounded-tr-md bg-[#d9fdd3]"
              : "rounded-tl-md bg-white"
          }`}
        >
          {message.body}
        </div>

      </div>

    </div>
  );
}

/* ============================================================
   CUBBIE TYPING
   ============================================================ */

function CubbieTyping() {
  return (
    <div className="max-w-[70%]">

      <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium text-violet-600">

        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[8px] text-white">
          C
        </div>

        Cubbie

      </div>

      <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-violet-600 px-4 py-3 shadow-md shadow-violet-100">

        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-200 [animation-delay:-0.3s]" />

        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-200 [animation-delay:-0.15s]" />

        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-200" />

      </div>

    </div>
  );
}

/* ============================================================
   LOADING
   ============================================================ */

function RoomLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f5f8]">

      <div className="text-center">

        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200">
          <Sparkles size={22} />
        </div>

        <div className="mt-4 font-medium text-slate-700">
          Opening your group...
        </div>

      </div>

    </main>
  );
}

/* ============================================================
   NOT FOUND
   ============================================================ */

function RoomNotFound({
  code,
}: {
  code: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7fb] px-5">

      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/70">

        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <MessageCircle
            size={22}
          />
        </div>

        <h1 className="mt-5 text-2xl font-semibold">
          Group not found
        </h1>

        <p className="mt-2 leading-7 text-slate-500">

          {code
            ? `I couldn't find room ${code}. Check the invite code and try again.`
            : "This invite is missing a room code."}

        </p>

        <p className="mt-3 text-sm leading-6 text-slate-400">
          This room may have been
          removed, or the invite code
          may be incorrect.
        </p>

        <Link
          href="/create"
          className="mt-6 inline-flex rounded-2xl bg-violet-600 px-5 py-3 font-medium text-white"
        >
          Create a group
        </Link>

      </div>

    </main>
  );
}