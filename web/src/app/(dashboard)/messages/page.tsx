"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Badge, Spinner, Input, Modal } from "@/components/ui";
import {
  useConversations,
  useMessages,
  useCreateConversation,
  useSendMessage,
  useContacts,
  useAddParticipants,
  useParticipants,
  useRemoveParticipant,
  useRenameConversation,
} from "@/hooks/use-messaging";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { MessageSquare, Plus, Search, Send, ArrowLeft, CornerUpLeft, WifiOff, Users, X } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { deliveryLabel, formatLastSeen, lastMessagePrefix } from "@/lib/presence";
import { clockTime, groupThread, senderIdOf } from "@/lib/messaging-view";
import { personDetail, personMatches, personName } from "@/lib/person";
import { QuotedMessage } from "@/components/messaging/quoted-message";

/**
 * How far from the bottom of the thread still counts as "reading the latest".
 * Roughly one message's worth, so a half-scrolled row does not stop the view
 * following new arrivals.
 */
const NEAR_BOTTOM_PX = 120;

export default function MessagesPage() {
  const { user } = useAuthStore();
  const { data: conversations, isLoading } = useConversations();
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const { data: messages } = useMessages(selectedConv || undefined);
  const sendMessageRest = useSendMessage();
  const createConv = useCreateConversation();
  const chatStore = useChatStore();
  const queryClient = useQueryClient();

  const [messageText, setMessageText] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [threadSearch, setThreadSearch] = useState("");
  /** The message being answered, until it is sent or dismissed. */
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [newConvType, setNewConvType] = useState("ONE_ON_ONE");
  const [newConvName, setNewConvName] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const debouncedUserSearch = useDebounce(userSearch, 300);
  const { data: usersData, isPending: contactsPending } =
    useContacts(debouncedUserSearch);
  // True between the keystroke and the answer: either the 300ms debounce has
  // not caught up yet, or the request for that term is still in the air.
  // Deliberately not `isFetching`, which is also true for a background
  // refetch — results already on screen should not blink away.
  const searchingUsers =
    userSearch.trim() !== debouncedUserSearch.trim() ||
    (contactsPending && !usersData);
  const [showMembers, setShowMembers] = useState(false);
  const addParticipants = useAddParticipants();
  const removeParticipant = useRemoveParticipant();
  const renameConversation = useRenameConversation();
  const { data: participants } = useParticipants(
    showMembers && selectedConv ? selectedConv : undefined,
  );
  const [renameTo, setRenameTo] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mark as read when a conversation is open AND whenever a new incoming
  // message arrives while it's open (so the sender's ticks turn to "read"
  // even if the recipient never leaves the conversation).
  //
  // `status` is the sender's own tick and is not what tells us whether THIS
  // user has read a message: a message can be READ because somebody else in
  // the group opened it. `reads` is the per-user record, so that is what
  // decides — without it, opening a group thread somebody else had already
  // read left it unread for this user for good.
  useEffect(() => {
    if (!selectedConv || !chatStore.connected || !user?.id) return;
    const hasIncomingUnread = (messages || []).some(
      (m: any) =>
        m.sender?.id !== user.id &&
        !(m.reads ?? []).some((r: any) => r.userId === user.id),
    );
    if (hasIncomingUnread) {
      chatStore.markRead(selectedConv);
    }
  }, [selectedConv, chatStore.connected, messages, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps


  // The endpoint returns newest first; a thread is read oldest first. Grouped
  // here rather than in the markup so the rules can be checked on their own —
  // see lib/messaging-view.ts.
  /**
   * The id of the newest message the last render knew about.
   *
   * Only a message that arrives while you are looking at the thread rises in.
   * Animating every group on open would be a staggered list entrance — a
   * hundred bubbles fading up on a thread you scrolled back through, which
   * delays reading and reads as the page loading twice.
   */
  const newestSeen = useRef<string | null>(null);

  const threadBlocks = useMemo(
    () => groupThread(messages ? [...messages].reverse() : [], user?.id),
    [messages, user?.id],
  );

  // The endpoint answers newest first, so the newest is the first row.
  const newestMessageId: string | null = messages?.[0]?.id ?? null;

  useEffect(() => {
    newestSeen.current = newestMessageId;
  }, [newestMessageId]);

  // Opening another thread is not an arrival: everything in it is new to the
  // reader, and animating all of it would be a staggered entrance.
  useEffect(() => {
    newestSeen.current = null;
    // A quote belongs to the thread it was picked in.
    setReplyingTo(null);
  }, [selectedConv]);

  // Get typing users for current conversation
  const typingMap = selectedConv ? chatStore.getTypingUsers(selectedConv) : new Map();
  const typingNames = Array.from(typingMap.values());

  /** The thread whose bottom we have already jumped to. */
  const landedOn = useRef<string | null>(null);

  /**
   * Follow the bottom of the thread.
   *
   * Opening a thread jumps, straight to the end and without animating.
   * Smooth-scrolling on open aimed at the scroll height as it was when the
   * animation began, and the thread was still laying out underneath it — the
   * last message ended up half-hidden behind the composer, which is not where
   * any chat leaves you.
   *
   * After that it follows: a message or a typing notice arriving scrolls the
   * view down gently. The typing notice is a row like any other, so it has to
   * be a dependency — without it the notice appears below the fold and the
   * reader sees a sliver of it, or nothing.
   *
   * Somebody who has scrolled up to read is left where they are. Being yanked
   * to the bottom because the other party started typing is worse than
   * missing the notice.
   */
  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;

    const opening = landedOn.current !== selectedConv;
    if (opening) {
      // Nothing to land on yet; wait for the thread to arrive.
      if (!messages || messages.length === 0) return;

      const toBottom = () => {
        list.scrollTop = list.scrollHeight;
      };
      toBottom();
      // Again on the next frame: the first pass runs before the browser has
      // finished wrapping long messages, and the height it aimed at was
      // shorter than the height it ended up with.
      requestAnimationFrame(toBottom);
      landedOn.current = selectedConv;
      return;
    }

    const nearBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_BOTTOM_PX;
    if (nearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typingNames.length, selectedConv]);

  // Handle typing indicator
  const handleInputChange = useCallback(
    (value: string) => {
      setMessageText(value);
      if (selectedConv && chatStore.connected) {
        chatStore.startTyping(selectedConv);

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          if (selectedConv) chatStore.stopTyping(selectedConv);
        }, 5000);
      }
    },
    [selectedConv, chatStore]
  );

  const handleSend = async () => {
    if (!messageText.trim() || !selectedConv) return;
    const text = messageText;
    const replyToId = replyingTo?.id;
    setMessageText("");
    setReplyingTo(null);

    // Stop typing indicator
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    chatStore.stopTyping(selectedConv);

    if (chatStore.connected) {
      try {
        const ack = await chatStore.sendMessage(selectedConv, text, undefined, replyToId);
        // The ack says whether a recipient was online to take it. Without
        // this the message sat on one tick until something else refreshed the
        // cache, even though the server had already marked it delivered.
        chatStore.applyAck(queryClient, selectedConv, ack);
      } catch {
        // Fallback to REST
        sendMessageRest.mutate({ conversationId: selectedConv, content: text, replyToId });
      }
    } else {
      sendMessageRest.mutate({ conversationId: selectedConv, content: text, replyToId });
    }
  };

  const handleNewConversation = () => {
    if (selectedUserIds.length === 0) return;
    createConv.mutate(
      {
        type: newConvType,
        name: newConvName || undefined,
        participantUserIds: selectedUserIds,
      },
      {
        onSuccess: (conv: any) => {
          setShowNewModal(false);
          setSelectedConv(conv.id);
          setSelectedUserIds([]);
          setNewConvName("");
          setUserSearch("");
          chatStore.joinConversation(conv.id);
        },
      }
    );
  };

  const selectedConversation = conversations?.find((c: any) => c.id === selectedConv);

  const getConvName = (conv: any) => {
    if (conv.name) return conv.name;
    if (conv.type === "ONE_ON_ONE") {
      const other = conv.participants?.find((p: any) => p?.user?.id !== user?.id);
      return other?.user ? `${other.user.firstName ?? ""} ${other.user.lastName ?? ""}`.trim() : "Chat";
    }
    return `Group (${conv.participants?.length || 0})`;
  };

  /**
   * The threads still showing after a search.
   *
   * Matched on the people in the conversation and on its name, so a group is
   * findable by what it is called and a direct thread by who it is with.
   * Filtered here rather than asked of the server: the list is already in
   * memory, and a request per keystroke would be slower and no more correct.
   */
  const visibleConversations = useMemo(() => {
    const all = conversations ?? [];
    const q = threadSearch.trim();
    if (!q) return all;

    return all.filter((conv: any) => {
      if (personMatches({ firstName: conv.name ?? "" }, q)) return true;
      return (conv.participants ?? []).some(
        (p: any) => p?.user?.id !== user?.id && personMatches(p?.user, q),
      );
    });
  }, [conversations, threadSearch, user?.id]);

  /**
   * Go to the message a quote answers, and say which one it was.
   *
   * The flash matters: scrolling somewhere without marking the destination
   * leaves the reader hunting for whichever message they were sent to.
   */
  const jumpToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("motion-flash");
    window.setTimeout(() => el.classList.remove("motion-flash"), 1200);
  };

  const getOtherUser = (conv: any) => {
    if (conv.type === "ONE_ON_ONE") {
      return conv.participants?.find((p: any) => p?.user?.id !== user?.id)?.user;
    }
    return null;
  };

  /**
   * What a message you sent says about itself, in words.
   *
   * Ticks were a convention borrowed from one particular app: one against
   * two, and grey against blue, is a code a parent messaging the school
   * should not have to have learned. The wording lives in @/lib/presence so
   * it can be checked without rendering.
   */
  const MessageState = ({ msg }: { msg: any }) => {
    if (senderIdOf(msg) !== user?.id) return null;
    const state = deliveryLabel(msg.status);
    return (
      <span className={state === "Read" ? "text-primary" : "text-muted"}>
        {state}
      </span>
    );
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-0">
      {!chatStore.connected && (
        <div className="mb-2 flex items-center justify-center gap-2 rounded-lg border border-warning/30 bg-warning-wash px-4 py-2 text-sm text-warning">
          <WifiOff className="h-4 w-4" />
          Reconnecting...
        </div>
      )}

    {/*
      One surface split by a rule, rather than two cards floating apart. A
      messaging client is a single plane: the gap and the second set of
      rounded edges made the inbox and the thread read as two unrelated
      widgets that happened to sit side by side.
    */}
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface">
      {/*
        The inbox column. One continuous list, not a stack of cards: a person
        scans this for a name, and rounded tiles with their own edges give
        every row a frame competing with the next one.

        Selected and unread are two different questions — "where am I" and
        "what is waiting" — so they get two different devices and can be true
        at once. Selection is a quiet change of ground, because it is
        permanent while you read. Unread is weight, full-strength preview
        text, and a count.
      */}
      <div className={`${selectedConv ? "hidden md:flex" : "flex"} w-full flex-col border-border md:w-[19rem] md:flex-shrink-0 md:border-r`}>
        <div className="flex items-center justify-between px-4 py-3.5">
          <h2 className="text-[0.95rem] font-semibold tracking-tight text-foreground">Messages</h2>
          <button
            type="button"
            aria-label="Add"
            onClick={() => setShowNewModal(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <Plus className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/*
          Finding a thread in a long list.

          Searches who a conversation is with, not what was said in it. That
          is the question somebody actually has open — "where is the thread
          with Aline" — and it is answerable instantly from what is already
          on screen, with no request and no waiting.
        */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Search people"
              aria-label="Search people"
              className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-3 text-[0.8125rem] text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : visibleConversations.length > 0 ? (
          <div className="flex-1 overflow-y-auto pb-2">
            {visibleConversations.map((conv: any) => {
              const otherUser = getOtherUser(conv);
              const isOtherOnline = otherUser ? chatStore.isOnline(otherUser.id) : false;
              const unread = conv.unreadCount > 0;
              const active = selectedConv === conv.id;
              const name = getConvName(conv);
              const detail = conv.type === "ONE_ON_ONE" ? personDetail(otherUser) : "";

              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConv(conv.id)}
                  aria-current={active ? "true" : undefined}
                  aria-label={unread ? `${name}, ${conv.unreadCount} unread` : name}
                  className={`relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 ${
                    active ? "bg-surface-muted" : "hover:bg-surface-muted/60"
                  }`}
                >
                  {/* The one place brand colour appears in this column, so it
                      always means the same thing: something is waiting. */}
                  <span
                    aria-hidden="true"
                    className={`absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${
                      unread ? "bg-primary" : "bg-transparent"
                    }`}
                  />

                  <span className="relative mt-0.5 flex-shrink-0">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[0.8rem] font-semibold text-primary">
                      {name.charAt(0).toUpperCase()}
                    </span>
                    {/* Absent rather than grey when someone is away: a second
                        grey dot on every row is noise, and it competes with
                        the unread dot for the same glance. */}
                    {conv.type === "ONE_ON_ONE" && isOtherOnline && (
                      <span
                        title="Online"
                        className="absolute -bottom-0.5 -right-0.5 h-[9px] w-[9px] rounded-full bg-success ring-2 ring-surface"
                      />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span
                        className={`min-w-0 flex-1 truncate text-[0.875rem] leading-5 ${
                          unread ? "font-semibold text-foreground" : "font-medium text-foreground"
                        }`}
                      >
                        {name}
                        {/* Four children share this name. The class is the
                            thing that says which one. */}
                        {detail && (
                          <span className="ml-1.5 text-[0.75rem] font-normal text-muted">
                            {detail}
                          </span>
                        )}
                      </span>
                      {conv.lastMessage && (
                        <span className="flex-shrink-0 text-[0.6875rem] tabular-nums text-muted">
                          {clockTime(conv.lastMessage.createdAt)}
                        </span>
                      )}
                    </span>

                    <span className="mt-0.5 flex items-center gap-2">
                      <span
                        className={`min-w-0 flex-1 truncate text-[0.8125rem] leading-5 ${
                          unread ? "text-foreground" : "text-muted"
                        }`}
                      >
                        {conv.lastMessage ? (
                          <>
                            {lastMessagePrefix(conv.lastMessage, user?.id)}
                            {conv.lastMessage.content}
                          </>
                        ) : (
                          <span className="italic text-muted">No messages yet</span>
                        )}
                      </span>
                      {unread && (
                        <span className="flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[0.6875rem] font-semibold tabular-nums text-on-primary">
                          {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : threadSearch.trim() ? (
          // Having nothing that matches is a different answer from having
          // nothing at all, and the way out has to be offered.
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">
              Nobody matches &ldquo;{threadSearch.trim()}&rdquo;
            </p>
            <button
              type="button"
              onClick={() => setThreadSearch("")}
              className="mt-2 text-xs font-medium text-primary hover:underline"
            >
              Show every conversation
            </button>
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <MessageSquare className="mx-auto mb-3 h-7 w-7 text-muted opacity-50" />
            <p className="text-sm font-medium text-foreground">No conversations yet</p>
            <p className="mt-1 text-xs text-muted">Start one with the + button above</p>
          </div>
        )}
      </div>

      {/* Chat Area */}
      <div className={`${selectedConv ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {selectedConv && selectedConversation ? (
          <>
            {/*
              The header answers one question — who am I talking to, and are
              they here. The conversation's type used to be printed beside the
              name as the raw enum ("ONE ON _ONE"), which is a database value,
              not a thing to tell a teacher.
            */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <button
                aria-label="Go back"
                onClick={() => setSelectedConv(null)}
                className="-ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground md:hidden"
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
              </button>

              {(() => {
                const other = getOtherUser(selectedConversation);
                const oneOnOne = selectedConversation.type === "ONE_ON_ONE";
                const online = other ? chatStore.isOnline(other.id) : false;
                const members = selectedConversation.participants?.length ?? 0;
                const onlineCount =
                  selectedConversation.participants?.filter(
                    (p: any) => p.user?.id !== user?.id && chatStore.isOnline(p.user?.id),
                  ).length ?? 0;

                return (
                  <>
                    <span className="relative flex-shrink-0">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[0.8rem] font-semibold text-primary">
                        {getConvName(selectedConversation).charAt(0).toUpperCase()}
                      </span>
                      {oneOnOne && online && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-[9px] w-[9px] rounded-full bg-success ring-2 ring-surface" />
                      )}
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-[0.9rem] font-semibold leading-5 tracking-tight text-foreground">
                        {getConvName(selectedConversation)}
                      </p>
                      {oneOnOne && other ? (
                        <p className={`text-[0.75rem] leading-4 ${online ? "text-success" : "text-muted"}`}>
                          {online ? "Online" : formatLastSeen(other.lastSeenAt)}
                        </p>
                      ) : (
                        <p className="text-[0.75rem] leading-4 text-muted">
                          {members} {members === 1 ? "member" : "members"}
                          {onlineCount > 0 && ` · ${onlineCount} online`}
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}

              <div className="ml-auto flex items-center gap-2">
                {selectedConversation.type === "BROADCAST" && (
                  <span className="rounded-md bg-surface-muted px-2 py-1 text-[0.6875rem] font-medium text-muted">
                    Announcement
                  </span>
                )}
                {selectedConversation.type !== "ONE_ON_ONE" && (
                  <button
                    type="button"
                    aria-label="Members"
                    onClick={() => {
                      setRenameTo(selectedConversation.name ?? "");
                      setShowMembers(true);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <Users className="h-[18px] w-[18px]" />
                  </button>
                )}
              </div>
            </div>

            {/*
              The thread. Consecutive messages from one person inside a few
              minutes are one remark, so they are drawn as a run: the name
              appears once at the top (and never in a one to one, where there
              is only one possible sender), and the clock once at the bottom.
              Repeating both on every bubble gave the least important thing on
              screen the same rhythm as the words.
            */}
            <div ref={messageListRef} className="flex-1 overflow-y-auto px-4 py-5">
              {threadBlocks.map((block) => (
                <div key={block.key}>
                  <div className="my-4 flex items-center gap-3 first:mt-0">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted">
                      {block.day}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>

                  {block.groups.map((group) => {
                    const last = group.messages[group.messages.length - 1];
                    const named =
                      !group.mine && selectedConversation.type !== "ONE_ON_ONE";
                    const isNewArrival =
                      last.id === newestMessageId &&
                      newestSeen.current !== null &&
                      newestSeen.current !== newestMessageId;

                    return (
                      <div
                        key={group.key}
                        className={`group/msg mb-3 flex flex-col gap-0.5 ${
                          isNewArrival ? "motion-rise-in " : ""
                        }${
                          group.mine ? "items-end" : "items-start"
                        }`}
                      >
                        {named && (
                          <span className="mb-0.5 px-1 text-[0.75rem] font-medium text-foreground-muted">
                            {group.senderName}
                          </span>
                        )}

                        {group.messages.map((msg: any, i) => {
                          // The tail goes on the first bubble of a run and
                          // points at whoever said it. Four bubbles from one
                          // person do not need four arrows.
                          const corner = `bubble ${
                            i === 0
                              ? group.mine
                                ? "bubble-tail-end"
                                : "bubble-tail-start"
                              : ""
                          }`;

                          return (
                            <div
                              key={msg.id}
                              id={`msg-${msg.id}`}
                              className={`max-w-[min(34rem,78%)] px-3.5 py-2 ${corner} ${
                                group.mine
                                  ? "bg-primary text-on-primary"
                                  : "bg-surface-muted text-foreground"
                              }`}
                            >
                              {msg.replyTo && (
                                <QuotedMessage
                                  message={msg.replyTo}
                                  mine={group.mine}
                                  onJump={() => jumpToMessage(msg.replyTo.id)}
                                  className="mb-1"
                                />
                              )}
                              {msg.content && (
                                <p className="whitespace-pre-wrap break-words text-[0.875rem] leading-relaxed">
                                  {msg.content}
                                </p>
                              )}
                            </div>
                          );
                        })}

                        <span className="mt-0.5 flex items-center gap-1.5 px-1 text-[0.6875rem] tabular-nums text-muted">
                          {/*
                            Answering this particular message. Shown on hover
                            and whenever it has keyboard focus, so it is not a
                            mouse-only feature.
                          */}
                          <button
                            type="button"
                            onClick={() => setReplyingTo(last)}
                            aria-label={`Reply to ${group.senderName}`}
                            className="rounded px-1 py-0.5 text-primary opacity-0 transition-opacity focus:opacity-100 group-hover/msg:opacity-100"
                          >
                            <CornerUpLeft className="h-3.5 w-3.5" />
                          </button>
                          {clockTime(last.createdAt)}
                          {group.mine && <span aria-hidden="true">·</span>}
                          <MessageState msg={last} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}

              {typingNames.length > 0 && (
                // Chrome, not content: a bubble here would read as a message
                // that never arrives.
                <div className="flex items-center gap-1.5 px-1 py-1 text-[0.8125rem] text-muted">
                  <span>
                    {typingNames.length === 1
                      ? `${typingNames[0]} is typing`
                      : `${typingNames.slice(0, 2).join(", ")} ${typingNames.length > 2 ? `and ${typingNames.length - 2} more ` : ""}are typing`}
                  </span>
                  <span className="typing-dots" aria-hidden="true">...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/*
              One field, one focus ring. The attach and send controls sit
              inside the same bordered container and on the same baseline as
              the text, rather than as two loose circles either side of a pill
              — three separate shapes for what is one action.
            */}
            <div className="border-t border-border p-3">
              {selectedConversation.type === "BROADCAST" &&
              selectedConversation.createdBy?.id !== user?.id ? (
                <p className="py-2 text-center text-[0.8125rem] text-muted">
                  This is an announcement from the school. Message the school
                  directly if you need to reply.
                </p>
              ) : (
                <>
                  {replyingTo && (
                    <div className="mb-2 flex items-center gap-2">
                      <QuotedMessage message={replyingTo} className="flex-1" />
                      <button
                        type="button"
                        aria-label="Cancel reply"
                        onClick={() => setReplyingTo(null)}
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-1 rounded-xl border border-border bg-surface px-1.5 py-1 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
                    <input
                      type="text"
                      value={messageText}
                      onChange={(e) => handleInputChange(e.target.value)}
                      placeholder="Type a message..."
                      aria-label="Type a message..."
                      onKeyDown={(e) => e.key === "Enter" && handleSend()}
                      className="min-w-0 flex-1 border-0 bg-transparent px-1.5 py-1.5 text-[0.875rem] text-foreground placeholder:text-muted focus:outline-none"
                    />

                    {/* Dimmed until there is something to send, so the button
                        says whether the action is available before it is
                        pressed. */}
                    <button
                      type="button"
                      aria-label="Send message"
                      onClick={handleSend}
                      disabled={!messageText.trim()}
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <Send className="h-[16px] w-[16px]" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-muted/30" />
              <p className="mt-2 text-muted">Select a conversation or start a new one</p>
              {chatStore.connected && (
                <p className="mt-1 text-xs text-success flex items-center justify-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" /> Connected
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* New Conversation Modal */}
      <Modal isOpen={showNewModal} onClose={() => setShowNewModal(false)} title="New Conversation">
        <div className="space-y-4">
          <div>
            <label htmlFor="f-type" className="mb-1 block text-sm font-medium text-foreground">Type</label>
            <select id="f-type"
              value={newConvType}
              onChange={(e) => {
                setNewConvType(e.target.value);
                if (e.target.value === "ONE_ON_ONE") setSelectedUserIds(selectedUserIds.slice(0, 1));
              }}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
             aria-label="Type">
              <option value="ONE_ON_ONE">Direct Message</option>
              <option value="GROUP">Group</option>
              <option value="BROADCAST">Broadcast</option>
            </select>
          </div>
          {newConvType !== "ONE_ON_ONE" && (
            <Input label="Group Name" value={newConvName} onChange={(e) => setNewConvName(e.target.value)} />
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              {newConvType === "ONE_ON_ONE" ? "Select User" : "Select Users"}
            </label>
            {/* Selected users */}
            {selectedUserIds.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {selectedUserIds.map((uid) => {
                  const u = usersData?.data?.find((u: any) => u.id === uid);
                  return (
                    <span
                      key={uid}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                    >
                      {u ? `${u.firstName} ${u.lastName}` : uid}
                      <button
                        type="button"
                        onClick={() => setSelectedUserIds(selectedUserIds.filter((id) => id !== uid))}
                        className="ml-0.5 text-primary/60 hover:text-primary"
                      >
                        &times;
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            {/* Search input */}
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users by name..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
             aria-label="Search users by name..."/>
            {/* User dropdown list */}
            {userSearch.trim() && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface">
                {/* The query is debounced by 300ms, so between the keystroke
                    and the answer this used to read "No users found" — which
                    is a claim about the school's roll, not about the request
                    still being in the air. */}
                {searchingUsers ? (
                  <p className="px-3 py-2 text-xs text-muted">Searching...</p>
                ) : usersData?.data?.filter((u: any) => u.id !== user?.id && !selectedUserIds.includes(u.id)).length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted">No users found</p>
                ) : (
                  usersData?.data
                    ?.filter((u: any) => u.id !== user?.id && !selectedUserIds.includes(u.id))
                    .map((u: any) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          if (newConvType === "ONE_ON_ONE") {
                            setSelectedUserIds([u.id]);
                          } else {
                            setSelectedUserIds([...selectedUserIds, u.id]);
                          }
                          setUserSearch("");
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/10 transition-colors"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                          {u.firstName?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0">
                          <span className="font-medium text-foreground">
                            {personName(u)}
                          </span>
                          {/* The class for a student, the role for anyone
                              else. Starting a thread with the wrong Aline is
                              the mistake this prevents. */}
                          <span className="ml-2 text-xs text-muted">
                            {personDetail(u) || u.role}
                          </span>
                        </div>
                      </button>
                    ))
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewModal(false)}>Cancel</Button>
            <Button onClick={handleNewConversation} isLoading={createConv.isPending} disabled={selectedUserIds.length === 0}>Create</Button>
          </div>
        </div>
      </Modal>

      {/*
        Who is in a group, and who may change it.

        A group anybody can add to is a group that leaks: a parent added to the
        staff room sees everything already said in it. So adding and removing
        are the group admin's, and the API is the one that enforces it.
      */}
      <Modal
        isOpen={showMembers}
        onClose={() => setShowMembers(false)}
        title="Members"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <Input
              id="g-name"
              label="Group name"
              className="sm:w-72"
              value={renameTo}
              onChange={(e) => setRenameTo(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={!renameTo.trim() || !selectedConv}
              isLoading={renameConversation.isPending}
              onClick={() =>
                renameConversation.mutate({
                  conversationId: selectedConv!,
                  name: renameTo.trim(),
                })
              }
            >
              Rename
            </Button>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            {(participants ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted">Nobody to show.</p>
            ) : (
              (participants ?? []).map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-0"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    {p.user.firstName?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground">
                      {p.user.firstName} {p.user.lastName}
                    </span>
                    <span className="ml-2 text-xs text-muted">{p.user.role}</span>
                  </div>
                  {p.isAdmin && <Badge className="ml-1">Admin</Badge>}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    aria-label={
                      p.user.id === user?.id
                        ? "Leave the group"
                        : `Remove ${p.user.firstName}`
                    }
                    onClick={() =>
                      removeParticipant.mutate({
                        conversationId: selectedConv!,
                        userId: p.user.id,
                      })
                    }
                  >
                    {p.user.id === user?.id ? "Leave" : "Remove"}
                  </Button>
                </div>
              ))
            )}
          </div>

          <div>
            <Input
              id="g-add"
              label="Add somebody"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Type a name"
            />
            {userSearch && (usersData?.data ?? []).length > 0 && (
              <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-border">
                {(usersData?.data ?? []).map((u: any) => (
                  <button
                    key={u.id}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/10"
                    onClick={() => {
                      addParticipants.mutate({
                        conversationId: selectedConv!,
                        userIds: [u.id],
                      });
                      setUserSearch("");
                    }}
                  >
                    {u.firstName} {u.lastName}
                    <span className="ml-2 text-xs text-muted">{u.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
    </div>
  );
}