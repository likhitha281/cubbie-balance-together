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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";
import { ensureAnonymousUser } from "../../lib/auth";

import {
  CoordinationRequest,
  createCoordinationRequest,
  formatAgentProgress,
  formatSlotForChat,
  getCoordinationResult,
  markRequestProposed,
} from "../../lib/coordination/coordinator";

import {
  evaluateRequestForCurrentUser,
} from "../../lib/coordination/personalAgent";

import {
  createPrivateConfirmations,
  getConfirmationSummary,
  getMyPendingConfirmation,
  PrivateConfirmation,
  respondToConfirmation,
} from "../../lib/coordination/confirmations";

/* ============================================================
   TYPES
   ============================================================ */

type RoomMember = {
  id: string;
  name: string;
  phone: string;
  role: "creator" | "member";
  status: "joined" | "invited";
  userId: string | null;
};

type StoredRoom = {
  id: string;
  code: string;
  name: string;
  createdAt: string;
  members: RoomMember[];
};

type MessageKind =
  | "human"
  | "cubbie"
  | "system";

type Message = {
  id: string;
  sender: string;
  body: string;
  kind: MessageKind;
  mine?: boolean;
  time: string;
};

type ProposedPlan = {
  requestId: string;
  start: string;
  end: string;
};

/* ============================================================
   HELPERS
   ============================================================ */

function formatTime(
  value: string | Date
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      hour: "numeric",
      minute: "2-digit",
    }
  ).format(
    typeof value === "string"
      ? new Date(value)
      : value
  );
}

function sleep(
  milliseconds: number
) {
  return new Promise<void>(
    (resolve) => {
      window.setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}

/* ============================================================
   PAGE
   ============================================================ */

export default function RoomPage() {
  return (
    <Suspense
      fallback={<RoomLoading />}
    >
      <RoomExperience />
    </Suspense>
  );
}

/* ============================================================
   ROOM
   ============================================================ */

function RoomExperience() {
  const searchParams =
    useSearchParams();

  const code =
    searchParams
      .get("code")
      ?.trim()
      .toUpperCase() ?? "";

  const [room, setRoom] =
    useState<StoredRoom | null>(
      null
    );

  const [
    currentUser,
    setCurrentUser,
  ] = useState("");

  const [
    currentUserId,
    setCurrentUserId,
  ] = useState("");

  const [
    currentMemberId,
    setCurrentMemberId,
  ] = useState("");

  const [
    messages,
    setMessages,
  ] = useState<Message[]>([]);

  const [
    composer,
    setComposer,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    sending,
    setSending,
  ] = useState(false);

  const [
    cubbieTyping,
    setCubbieTyping,
  ] = useState(false);

  const [
    copied,
    setCopied,
  ] = useState(false);

  const [
    activeRequest,
    setActiveRequest,
  ] =
    useState<CoordinationRequest | null>(
      null
    );

  const [
    proposedPlan,
    setProposedPlan,
  ] =
    useState<ProposedPlan | null>(
      null
    );

  const [
    coordinationProgress,
    setCoordinationProgress,
  ] = useState("");

  const [
    coordinationBusy,
    setCoordinationBusy,
  ] = useState(false);

  const [
    confirmationStarted,
    setConfirmationStarted,
  ] = useState(false);

  const [
    myConfirmation,
    setMyConfirmation,
  ] =
    useState<PrivateConfirmation | null>(
      null
    );

  const [
    confirmationProgress,
    setConfirmationProgress,
  ] = useState("");

  const [
    confirmationBusy,
    setConfirmationBusy,
  ] = useState(false);

  const processedRequests =
    useRef<Set<string>>(
      new Set()
    );

  const finalizedRequests =
    useRef<Set<string>>(
      new Set()
    );

  const finalizedConfirmations =
    useRef<Set<string>>(
      new Set()
    );

  const bottomRef =
    useRef<HTMLDivElement | null>(
      null
    );

  /* ==========================================================
     INSERT MESSAGE
     ========================================================== */

  const insertMessage =
    useCallback(
      async ({
        roomId,
        sender,
        body,
        kind,
      }: {
        roomId: string;
        sender: string;
        body: string;
        kind: MessageKind;
      }) => {
        const {
          data,
          error,
        } = await supabase
          .from("messages")
          .insert({
            room_id: roomId,
            sender_name: sender,
            sender_type: kind,
            body,
          })
          .select("*")
          .single();

        if (
          error ||
          !data
        ) {
          console.error(
            "Message insert failed:",
            error
          );

          return null;
        }

        const message:
          Message = {
          id: data.id,
          sender:
            data.sender_name,
          body:
            data.body,
          kind:
            data.sender_type as MessageKind,
          mine:
            data.sender_name ===
            currentUser,
          time:
            formatTime(
              data.created_at
            ),
        };

        setMessages(
          (current) => {
            if (
              current.some(
                (item) =>
                  item.id ===
                  message.id
              )
            ) {
              return current;
            }

            return [
              ...current,
              message,
            ];
          }
        );

        return message;
      },
      [currentUser]
    );

  /* ==========================================================
     LOAD ROOM
     ========================================================== */

  useEffect(() => {
    if (!code) {
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);

      try {
        const authUser =
          await ensureAnonymousUser();

        if (!authUser) {
          throw new Error(
            "Missing identity"
          );
        }

        setCurrentUserId(
          authUser.id
        );

        const {
          data: roomData,
          error: roomError,
        } = await supabase
          .from("rooms")
          .select("*")
          .eq(
            "code",
            code
          )
          .single();

        if (
          roomError ||
          !roomData
        ) {
          setRoom(null);
          setLoading(false);
          return;
        }

        const {
          data: memberData,
          error: memberError,
        } = await supabase
          .from(
            "room_members"
          )
          .select(`
            id,
            display_name,
            phone,
            role,
            status,
            user_id,
            created_at
          `)
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
          throw memberError;
        }

        const members:
          RoomMember[] =
          (
            memberData ?? []
          ).map(
            (member) => ({
              id:
                member.id,

              name:
                member.display_name,

              phone:
                member.phone ?? "",

              role:
                member.role,

              status:
                member.status,

              userId:
                member.user_id ??
                null,
            })
          );

        const loadedRoom:
          StoredRoom = {
          id:
            roomData.id,

          code:
            roomData.code,

          name:
            roomData.name,

          createdAt:
            roomData.created_at,

          members,
        };

        setRoom(
          loadedRoom
        );

        const ownMember =
          members.find(
            (member) =>
              member.userId ===
              authUser.id
          );

        const storedName =
          localStorage.getItem(
            `balance-current-user-${code}`
          );

        const name =
          ownMember?.name ??
          storedName ??
          "You";

        setCurrentUser(
          name
        );

        if (ownMember) {
          setCurrentMemberId(
            ownMember.id
          );

          localStorage.setItem(
            `balance-current-user-${code}`,
            ownMember.name
          );
        }

        /* ------------------------
           Messages
           ------------------------ */

        const {
          data: messageData,
          error: messageError,
        } = await supabase
          .from("messages")
          .select("*")
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

        if (messageError) {
          throw messageError;
        }

        if (
          messageData &&
          messageData.length > 0
        ) {
          setMessages(
            messageData.map(
              (message) => ({
                id:
                  message.id,

                sender:
                  message.sender_name,

                body:
                  message.body,

                kind:
                  message.sender_type as MessageKind,

                mine:
                  message.sender_name ===
                  name,

                time:
                  formatTime(
                    message.created_at
                  ),
              })
            )
          );
        } else {
          await supabase
            .from("messages")
            .insert([
              {
                room_id:
                  roomData.id,

                sender_name:
                  "Cubbie",

                sender_type:
                  "cubbie",

                body:
                  `group's ready 🎉 code: ${code}`,
              },
              {
                room_id:
                  roomData.id,

                sender_name:
                  "Cubbie",

                sender_type:
                  "cubbie",

                body:
                  "need help planning? just @ me. i'll check with everyone privately.",
              },
            ]);
        }

        /* ------------------------
           Latest request
           ------------------------ */

        const {
          data: requestData,
        } = await supabase
          .from(
            "coordination_requests"
          )
          .select("*")
          .eq(
            "room_id",
            roomData.id
          )
          .in(
            "status",
            [
              "collecting",
              "ready",
              "proposed",
            ]
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          )
          .limit(1)
          .maybeSingle();

        if (requestData) {
          const request =
            requestData as
              CoordinationRequest;

          if (
            request.status ===
            "collecting" ||
            request.status ===
            "ready"
          ) {
            setActiveRequest(
              request
            );
          }

          if (
            request.status ===
              "proposed" &&
            request.selected_start &&
            request.selected_end
          ) {
            setProposedPlan({
              requestId:
                request.id,

              start:
                request.selected_start,

              end:
                request.selected_end,
            });

            /*
             * See whether THIS user has
             * a pending confirmation.
             */
            try {
              const pending =
                await getMyPendingConfirmation({
                  requestId:
                    request.id,
                });

              if (pending) {
                setMyConfirmation(
                  pending
                );

                setConfirmationStarted(
                  true
                );
              }
            } catch {
              /*
               * Confirmation may not
               * have been created yet.
               */
            }
          }
        }

        setLoading(false);
      } catch (error) {
        console.error(
          "Room loading failed:",
          error
        );

        setRoom(null);
        setLoading(false);
      }
    }

    load();
  }, [code]);

  /* ==========================================================
     REALTIME MESSAGES
     ========================================================== */

  useEffect(() => {
    if (!room) {
      return;
    }

    const channel =
      supabase
        .channel(
          `messages-${room.id}`
        )
        .on(
          "postgres_changes",
          {
            event:
              "INSERT",

            schema:
              "public",

            table:
              "messages",

            filter:
              `room_id=eq.${room.id}`,
          },
          (payload) => {
            const row =
              payload.new;

            const incoming:
              Message = {
              id:
                row.id,

              sender:
                row.sender_name,

              body:
                row.body,

              kind:
                row.sender_type as MessageKind,

              mine:
                row.sender_name ===
                currentUser,

              time:
                formatTime(
                  row.created_at
                ),
            };

            setMessages(
              (current) => {
                if (
                  current.some(
                    (message) =>
                      message.id ===
                      incoming.id
                  )
                ) {
                  return current;
                }

                return [
                  ...current,
                  incoming,
                ];
              }
            );
          }
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [
    room,
    currentUser,
  ]);

  /* ==========================================================
     REALTIME COORDINATION REQUESTS
     ========================================================== */

  useEffect(() => {
    if (!room) {
      return;
    }

    const channel =
      supabase
        .channel(
          `requests-${room.id}`
        )
        .on(
          "postgres_changes",
          {
            event:
              "*",

            schema:
              "public",

            table:
              "coordination_requests",

            filter:
              `room_id=eq.${room.id}`,
          },
          (payload) => {
            const request =
              payload.new as
                CoordinationRequest;

            if (!request?.id) {
              return;
            }

            if (
              request.status ===
                "collecting" ||
              request.status ===
                "ready"
            ) {
              setActiveRequest(
                request
              );
            }

            if (
              request.status ===
                "proposed" &&
              request.selected_start &&
              request.selected_end
            ) {
              setActiveRequest(
                null
              );

              setProposedPlan({
                requestId:
                  request.id,

                start:
                  request.selected_start,

                end:
                  request.selected_end,
              });
            }

            if (
              request.status ===
                "confirmed" ||
              request.status ===
                "cancelled"
            ) {
              setActiveRequest(
                null
              );
            }
          }
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [room]);

  /* ==========================================================
     PERSONAL AGENT EVALUATION
     ========================================================== */

  useEffect(() => {
    if (
      !room ||
      !activeRequest ||
      !currentUserId ||
      !currentMemberId
    ) {
      return;
    }

    if (
      activeRequest.status !==
      "collecting"
    ) {
      return;
    }

    if (
      processedRequests.current.has(
        activeRequest.id
      )
    ) {
      return;
    }

    processedRequests.current.add(
      activeRequest.id
    );

    async function evaluate() {
      try {
        setCoordinationProgress(
          "your Cubbie is checking privately..."
        );

        await evaluateRequestForCurrentUser({
          requestId:
            activeRequest!.id,

          roomId:
            room!.id,

          durationMinutes:
            activeRequest!
              .duration_minutes,
        });

        setCoordinationProgress(
          "your Cubbie checked in ✓"
        );
      } catch (error) {
        console.error(
          error
        );

        processedRequests.current.delete(
          activeRequest!.id
        );

        setCoordinationProgress(
          "your Cubbie couldn't evaluate this request — check your private setup."
        );
      }
    }

    evaluate();
  }, [
    room,
    activeRequest,
    currentUserId,
    currentMemberId,
  ]);

  /* ==========================================================
     PROPOSALS → WINNER
     ========================================================== */

  useEffect(() => {
    if (
      !room ||
      !activeRequest
    ) {
      return;
    }

    async function check() {
      try {
        const result =
          await getCoordinationResult(
            activeRequest!.id,
            room!.id
          );

        setCoordinationProgress(
          formatAgentProgress({
            respondingMembers:
              result.respondingMembers,

            joinedMembers:
              result.joinedMembers,
          })
        );

        if (!result.ready) {
          return;
        }

        /*
         * Only the requester posts
         * the final recommendation.
         */
        if (
          activeRequest!
            .requested_by !==
          currentUserId
        ) {
          return;
        }

        if (
          finalizedRequests.current.has(
            activeRequest!.id
          )
        ) {
          return;
        }

        finalizedRequests.current.add(
          activeRequest!.id
        );

        if (!result.winner) {
          await insertMessage({
            roomId:
              room!.id,

            sender:
              "Cubbie",

            kind:
              "cubbie",

            body:
              result.explanation ??
              "i couldn't find a time that keeps everyone feasible.",
          });

          await supabase
            .from(
              "coordination_requests"
            )
            .update({
              status:
                "cancelled",
            })
            .eq(
              "id",
              activeRequest!.id
            );

          return;
        }

        await markRequestProposed({
          requestId:
            activeRequest!.id,

          winner:
            result.winner,
        });

        setProposedPlan({
          requestId:
            activeRequest!.id,

          start:
            result.winner.start,

          end:
            result.winner.end,
        });

        const slot =
          formatSlotForChat(
            result.winner.start,
            result.winner.end
          );

        await insertMessage({
          roomId:
            room!.id,

          sender:
            "Cubbie",

          kind:
            "cubbie",

          body:
            `${slot} looks best ✨\n\n${result.explanation ?? "This is the strongest overall fit."}\n\nI used only coordination signals — not anyone's private reason.`,
        });

        setCoordinationProgress(
          ""
        );
      } catch (error) {
        console.error(
          "Coordination failed:",
          error
        );
      }
    }

    check();

    const channel =
      supabase
        .channel(
          `proposals-${activeRequest.id}`
        )
        .on(
          "postgres_changes",
          {
            event:
              "INSERT",

            schema:
              "public",

            table:
              "agent_proposals",

            filter:
              `request_id=eq.${activeRequest.id}`,
          },
          () => {
            check();
          }
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [
    room,
    activeRequest,
    currentUserId,
    insertMessage,
  ]);

  /* ==========================================================
     REALTIME CONFIRMATIONS
     ========================================================== */

  useEffect(() => {
    if (
      !room ||
      !proposedPlan
    ) {
      return;
    }

    async function refreshOwnConfirmation() {
      try {
        const pending =
          await getMyPendingConfirmation({
            requestId:
              proposedPlan!.requestId,
          });

        setMyConfirmation(
          pending
        );

        if (pending) {
          setConfirmationStarted(
            true
          );
        }
      } catch {
        /*
         * No visible confirmation yet.
         */
      }
    }

    async function refreshSummary() {
      try {
        const summary =
          await getConfirmationSummary({
            requestId:
              proposedPlan!.requestId,

            roomId:
              room!.id,
          });

        if (
          summary.total === 0
        ) {
          return;
        }

        setConfirmationStarted(
          true
        );

        if (
          summary.declined > 0
        ) {
          setConfirmationProgress(
            "the current plan needs another option"
          );
        } else if (
          summary.pending > 0
        ) {
          setConfirmationProgress(
            `${summary.confirmed}/${summary.total} confirmed`
          );
        } else if (
          summary.confirmed ===
          summary.total
        ) {
          setConfirmationProgress(
            "everyone confirmed ✓"
          );

          /*
           * Only the original requester
           * posts the final group result.
           */

          const {
            data: request,
          } = await supabase
            .from(
              "coordination_requests"
            )
            .select(
              "requested_by"
            )
            .eq(
              "id",
              proposedPlan!
                .requestId
            )
            .single();

          if (
            request?.requested_by ===
              currentUserId &&
            !finalizedConfirmations
              .current
              .has(
                proposedPlan!
                  .requestId
              )
          ) {
            finalizedConfirmations
              .current
              .add(
                proposedPlan!
                  .requestId
              );

            const slot =
              formatSlotForChat(
                proposedPlan!.start,
                proposedPlan!.end
              );

            await insertMessage({
              roomId:
                room!.id,

              sender:
                "Cubbie",

              kind:
                "cubbie",

              body:
                `everyone's in 🎉\n\n${slot}\n\nplan confirmed.`,
            });

            await supabase
              .from(
                "coordination_requests"
              )
              .update({
                status:
                  "confirmed",
              })
              .eq(
                "id",
                proposedPlan!
                  .requestId
              );
          }
        }
      } catch (error) {
        console.error(
          "Confirmation summary failed:",
          error
        );
      }
    }

    refreshOwnConfirmation();
    refreshSummary();

    const channel =
      supabase
        .channel(
          `confirmations-${proposedPlan.requestId}-${currentUserId}`
        )
        .on(
          "postgres_changes",
          {
            event:
              "*",

            schema:
              "public",

            table:
              "plan_confirmations",
          },
          () => {
            refreshOwnConfirmation();
            refreshSummary();
          }
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [
    room,
    proposedPlan,
    currentUserId,
    insertMessage,
  ]);

  /* ==========================================================
     MEMBER DATA
     ========================================================== */

  const memberNames =
    useMemo(() => {
      return (
        room?.members.map(
          (member) =>
            member.name
        ) ?? []
      );
    }, [room]);

  const joinedMembers =
    useMemo(() => {
      return (
        room?.members.filter(
          (member) =>
            member.status ===
            "joined" &&
            member.userId
        ) ?? []
      );
    }, [room]);

  /* ==========================================================
     SCROLL
     ========================================================== */

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [
    messages,
    cubbieTyping,
    coordinationProgress,
    confirmationProgress,
    myConfirmation,
  ]);

  /* ==========================================================
     INVITE
     ========================================================== */

  const inviteLink =
    typeof window !==
      "undefined" &&
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

      window.setTimeout(
        () =>
          setCopied(false),
        1800
      );
    } catch (error) {
      console.error(error);
    }
  }

  /* ==========================================================
     PRIVACY QUESTIONS
     ========================================================== */

  function privacyAnswer(
    text: string
  ) {
    const value =
      text.toLowerCase();

    if (
      value.includes(
        "who can't"
      ) ||
      value.includes(
        "who cant"
      ) ||
      value.includes(
        "who cannot"
      ) ||
      value.includes(
        "who is busy"
      ) ||
      value.includes(
        "who rejected"
      ) ||
      value.includes(
        "who declined"
      )
    ) {
      return (
        "nice try 😭 i keep individual availability and responses private. i can coordinate around them without identifying anyone."
      );
    }

    if (
      value.includes(
        "why can't"
      ) ||
      value.includes(
        "why cant"
      ) ||
      value.includes(
        "why not"
      ) ||
      value.includes(
        "why did"
      )
    ) {
      return (
        "i can explain the group tradeoff, but i won't share anyone's private schedule, reason, or confirmation response."
      );
    }

    return null;
  }

  /* ==========================================================
     START COORDINATION
     ========================================================== */

  async function startCoordination(
    text: string
  ) {
    if (!room) {
      return;
    }

    if (
      joinedMembers.length <
      2
    ) {
      await insertMessage({
        roomId:
          room.id,

        sender:
          "Cubbie",

        kind:
          "cubbie",

        body:
          "i need at least two joined people before i can coordinate a group plan.",
      });

      return;
    }

    if (activeRequest) {
      await insertMessage({
        roomId:
          room.id,

        sender:
          "Cubbie",

        kind:
          "cubbie",

        body:
          "i'm already checking a plan with everyone's agents 👀",
      });

      return;
    }

    try {
      setCoordinationBusy(
        true
      );

      setCubbieTyping(
        true
      );

      await sleep(550);

      setCubbieTyping(
        false
      );

      await insertMessage({
        roomId:
          room.id,

        sender:
          "Cubbie",

        kind:
          "cubbie",

        body:
          "checking with everyone's Cubbie privately 👀\n\nprivate reasons stay with each person.",
      });

      const request =
        await createCoordinationRequest({
          roomId:
            room.id,

          text,

          durationMinutes:
            120,
        });

      setActiveRequest(
        request
      );

      setProposedPlan(
        null
      );

      setConfirmationStarted(
        false
      );

      setMyConfirmation(
        null
      );

      setConfirmationProgress(
        ""
      );

      setCoordinationProgress(
        `0/${joinedMembers.length} personal agents responded`
      );
    } catch (error) {
      console.error(error);

      await insertMessage({
        roomId:
          room.id,

        sender:
          "Cubbie",

        kind:
          "cubbie",

        body:
          "i couldn't start the private check. make sure everyone has joined and try again.",
      });
    } finally {
      setCoordinationBusy(
        false
      );
    }
  }

  /* ==========================================================
     START PRIVATE CONFIRMATIONS
     ========================================================== */

  async function startConfirmations() {
    if (
      !room ||
      !proposedPlan ||
      confirmationBusy
    ) {
      return;
    }

    setConfirmationBusy(
      true
    );

    try {
      await createPrivateConfirmations({
        requestId:
          proposedPlan.requestId,

        roomId:
          room.id,

        slotStart:
          proposedPlan.start,

        slotEnd:
          proposedPlan.end,
      });

      setConfirmationStarted(
        true
      );

      const pending =
        await getMyPendingConfirmation({
          requestId:
            proposedPlan.requestId,
        });

      setMyConfirmation(
        pending
      );

      setConfirmationProgress(
        `0/${joinedMembers.length} confirmed`
      );

      await insertMessage({
        roomId:
          room.id,

        sender:
          "Cubbie",

        kind:
          "cubbie",

        body:
          "sent everyone a private confirmation 🔒\n\ni'll tell the group when we have consensus — not who said what.",
      });
    } catch (error) {
      console.error(
        "Could not start confirmations:",
        error
      );
    } finally {
      setConfirmationBusy(
        false
      );
    }
  }

  /* ==========================================================
     RESPOND INLINE
     ========================================================== */

  async function respondInline(
    response:
      | "confirmed"
      | "declined"
  ) {
    if (
      !myConfirmation ||
      confirmationBusy
    ) {
      return;
    }

    setConfirmationBusy(
      true
    );

    try {
      await respondToConfirmation({
        confirmationId:
          myConfirmation.id,

        response,
      });

      setMyConfirmation(
        null
      );

      if (
        response ===
        "confirmed"
      ) {
        setConfirmationProgress(
          "your response is in ✓"
        );
      } else {
        setConfirmationProgress(
          "your response is private ✓"
        );
      }
    } catch (error) {
      console.error(
        "Confirmation failed:",
        error
      );
    } finally {
      setConfirmationBusy(
        false
      );
    }
  }

  /* ==========================================================
     SEND MESSAGE
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
        roomId:
          room.id,

        sender:
          currentUser ||
          "You",

        body,

        kind:
          "human",
      });

    setSending(false);

    if (!inserted) {
      setComposer(body);
      return;
    }

    const answer =
      privacyAnswer(body);

    if (answer) {
      setCubbieTyping(
        true
      );

      await sleep(500);

      setCubbieTyping(
        false
      );

      await insertMessage({
        roomId:
          room.id,

        sender:
          "Cubbie",

        kind:
          "cubbie",

        body:
          answer,
      });

      return;
    }

    if (
      body
        .toLowerCase()
        .includes(
          "@cubbie"
        )
    ) {
      await startCoordination(
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

  if (
    !room ||
    !code
  ) {
    return (
      <RoomNotFound
        code={code}
      />
    );
  }

  /* ==========================================================
     UI
     ========================================================== */

  return (
    <main className="min-h-screen bg-[#eef0f5] text-slate-950">

      <div className="mx-auto flex min-h-screen max-w-7xl items-stretch justify-center md:px-6 md:py-6">

        <div className="grid w-full overflow-hidden bg-white shadow-2xl shadow-slate-300/50 md:min-h-[calc(100vh-48px)] md:max-w-6xl md:grid-cols-[280px_1fr] md:rounded-[30px]">

          {/* SIDEBAR */}

          <aside className="hidden border-r border-slate-200 bg-[#fafafa] md:flex md:flex-col">

            <div className="border-b border-slate-200 p-5">

              <Link
                href="/"
                className="flex items-center gap-3"
              >

                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-600 text-white">
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
                  {room.members.length + 1} participants
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">

                  {room.members.map(
                    (member) => (
                      <span
                        key={
                          member.id
                        }
                        className={`rounded-full px-2.5 py-1 text-xs ${
                          member.status ===
                          "joined"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {member.name}
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
                  Raw constraints and individual
                  confirmation responses stay
                  private.
                </p>

                <Link
                  href={`/private?code=${code}`}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2.5 text-xs font-semibold text-white"
                >
                  <LockKeyhole
                    size={14}
                  />
                  My private setup
                </Link>

              </div>

            </div>

          </aside>

          {/* CHAT */}

          <section className="flex min-h-screen min-w-0 flex-col bg-[#f4f5f8] md:min-h-0">

            <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-5">

              <Link
                href="/"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 md:hidden"
              >
                <ArrowLeft
                  size={20}
                />
              </Link>

              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-rose-100 text-xl">
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
                onClick={
                  copyInvite
                }
                className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs sm:flex"
              >
                {copied ? (
                  <Check
                    size={15}
                  />
                ) : (
                  <Copy
                    size={15}
                  />
                )}

                {copied
                  ? "Copied"
                  : "Invite"}
              </button>

              <MoreVertical
                size={20}
                className="text-slate-400"
              />

            </header>

            {/* ROOM BAR */}

            <div className="border-b border-slate-200 bg-white px-4 py-2.5">

              <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2 text-xs text-slate-400">

                <Users
                  size={13}
                />

                Room

                <span className="font-mono font-semibold text-slate-700">
                  {code}
                </span>

                <span>·</span>

                <Link
                  href={`/private?code=${code}`}
                  className="font-medium text-violet-600"
                >
                  Private setup
                </Link>

              </div>

            </div>

            {/* MESSAGES */}

            <div className="flex-1 overflow-y-auto px-4 py-6">

              <div className="mx-auto max-w-3xl space-y-4">

                <div className="flex justify-center">
                  <div className="rounded-full bg-white px-3 py-1.5 text-[11px] text-slate-400 shadow-sm">
                    Today
                  </div>
                </div>

                {messages.map(
                  (message) => (
                    <ChatBubble
                      key={
                        message.id
                      }
                      message={
                        message
                      }
                    />
                  )
                )}

                {cubbieTyping && (
                  <CubbieTyping />
                )}

                {coordinationProgress &&
                  activeRequest && (
                    <StatusPill
                      text={
                        coordinationProgress
                      }
                    />
                  )}

                {/* PROPOSED PLAN */}

                {proposedPlan &&
                  !confirmationStarted && (
                    <div className="flex justify-start">

                      <div className="max-w-[88%] rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">

                        <div className="text-xs font-semibold uppercase tracking-wider text-violet-500">
                          Proposed plan
                        </div>

                        <div className="mt-2 font-semibold text-slate-900">
                          {formatSlotForChat(
                            proposedPlan.start,
                            proposedPlan.end
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={
                            startConfirmations
                          }
                          disabled={
                            confirmationBusy
                          }
                          className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                        >
                          Check privately with everyone
                        </button>

                      </div>

                    </div>
                  )}

                {/* PRIVATE CONFIRMATION */}

                {myConfirmation && (
                  <PrivateConfirmationCard
                    slotStart={
                      proposedPlan?.start ??
                      ""
                    }
                    slotEnd={
                      proposedPlan?.end ??
                      ""
                    }
                    busy={
                      confirmationBusy
                    }
                    onConfirm={() =>
                      respondInline(
                        "confirmed"
                      )
                    }
                    onDecline={() =>
                      respondInline(
                        "declined"
                      )
                    }
                  />
                )}

                {confirmationProgress && (
                  <StatusPill
                    text={
                      confirmationProgress
                    }
                  />
                )}

                <div
                  ref={bottomRef}
                />

              </div>

            </div>

            {/* PRIVACY */}

            <div className="border-t border-slate-200 bg-white/70 px-4 py-2">

              <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 text-[11px] text-slate-400">

                <LockKeyhole
                  size={12}
                />

                Private reasons and individual
                responses stay out of the group chat.

              </div>

            </div>

            {/* COMPOSER */}

            <form
              onSubmit={
                sendMessage
              }
              className="border-t border-slate-200 bg-white p-3 md:p-4"
            >

              <div className="mx-auto flex max-w-3xl items-end gap-2">

                <Link
                  href={`/private?code=${code}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                >
                  <LockKeyhole
                    size={18}
                  />
                </Link>

                <div className="flex min-h-11 flex-1 items-center rounded-[22px] bg-slate-100 px-4">

                  <input
                    value={
                      composer
                    }
                    onChange={(
                      event
                    ) =>
                      setComposer(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder={`Message ${room.name}...`}
                    className="w-full bg-transparent py-3 text-sm outline-none"
                  />

                </div>

                <button
                  type="submit"
                  disabled={
                    !composer.trim() ||
                    sending ||
                    coordinationBusy
                  }
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 text-white disabled:bg-slate-200"
                >
                  <Send
                    size={18}
                  />
                </button>

              </div>

              <div className="mx-auto mt-2 max-w-3xl px-14 text-[11px] text-slate-400">
                Try:{" "}
                <span className="font-medium text-violet-600">
                  @Cubbie find a time for us this weekend
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
   PRIVATE CONFIRMATION CARD
   ============================================================ */

function PrivateConfirmationCard({
  slotStart,
  slotEnd,
  busy,
  onConfirm,
  onDecline,
}: {
  slotStart: string;
  slotEnd: string;
  busy: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex justify-end">

      <div className="w-full max-w-md rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm">

        <div className="flex items-center gap-2 text-xs font-semibold text-violet-700">

          <LockKeyhole
            size={14}
          />

          PRIVATE · YOU ↔ CUBBIE

        </div>

        <div className="mt-3 text-sm text-slate-600">
          The group is considering:
        </div>

        <div className="mt-1 font-semibold text-slate-950">
          {slotStart &&
          slotEnd
            ? formatSlotForChat(
                slotStart,
                slotEnd
              )
            : "Proposed plan"}
        </div>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          Your response stays private.
          The group sees only whether
          consensus was reached.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">

          <button
            type="button"
            disabled={busy}
            onClick={
              onConfirm
            }
            className="rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            I&apos;m in 👍
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={
              onDecline
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-40"
          >
            Can&apos;t make it
          </button>

        </div>

      </div>

    </div>
  );
}

/* ============================================================
   STATUS
   ============================================================ */

function StatusPill({
  text,
}: {
  text: string;
}) {
  return (
    <div className="flex justify-center">

      <div className="flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1.5 text-[11px] font-medium text-violet-700">

        <Sparkles
          size={12}
        />

        {text}

      </div>

    </div>
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
  if (
    message.kind ===
    "system"
  ) {
    return (
      <div className="flex justify-center">

        <div className="rounded-full bg-white px-3 py-1.5 text-xs text-slate-400 shadow-sm">
          {message.body}
        </div>

      </div>
    );
  }

  if (
    message.kind ===
    "cubbie"
  ) {
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

        <div className="whitespace-pre-line rounded-2xl rounded-tl-md bg-violet-600 px-4 py-3 text-sm leading-6 text-white shadow-md shadow-violet-100">
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
          className={`mb-1 flex gap-2 px-1 text-[11px] ${
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
          className={`whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm ${
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
   TYPING
   ============================================================ */

function CubbieTyping() {
  return (
    <div>

      <div className="mb-1 text-[11px] font-medium text-violet-600">
        Cubbie
      </div>

      <div className="inline-flex gap-1.5 rounded-2xl bg-violet-600 px-4 py-3">

        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-200" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-200 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-200 [animation-delay:-0.3s]" />

      </div>

    </div>
  );
}

/* ============================================================
   LOADING / NOT FOUND
   ============================================================ */

function RoomLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f5f8]">

      <div className="text-center">

        <Sparkles
          className="mx-auto text-violet-600"
        />

        <div className="mt-3 text-sm font-medium text-slate-600">
          Opening your group...
        </div>

      </div>

    </main>
  );
}

function RoomNotFound({
  code,
}: {
  code: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7fb] px-5">

      <div className="max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">

        <MessageCircle
          className="mx-auto text-slate-400"
        />

        <h1 className="mt-4 text-2xl font-semibold">
          Group not found
        </h1>

        <p className="mt-2 text-slate-500">
          {code
            ? `I couldn't find room ${code}.`
            : "This invite is missing a room code."}
        </p>

        <Link
          href="/create"
          className="mt-6 inline-flex rounded-xl bg-violet-600 px-5 py-3 text-white"
        >
          Create a group
        </Link>

      </div>

    </main>
  );
}