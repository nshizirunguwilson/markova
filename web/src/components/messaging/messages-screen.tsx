"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Avatar, Button, Badge, Spinner, Input, Modal } from "@/components/ui";
import {
  useConversations,
  useMessages,
  useCreateConversation,
  useSendMessage,
  useContacts,
  useAddParticipants,
  useUploadAttachment,
  useParticipants,
  useRemoveParticipant,
  useRenameConversation,
} from "@/hooks/use-messaging";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { MessageSquare, Plus, Search, Send, ArrowLeft, ChevronDown, CornerUpLeft, WifiOff, Users, X, Paperclip, FileText } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import {
  deliveryLabel,
  formatLastSeen,
  lastMessagePrefix,
  messagePreview,
} from "@/lib/presence";
import { clockTime, groupThread, senderIdOf } from "@/lib/messaging-view";
import { personDetail, personMatches, personName } from "@/lib/person";
import { QuotedMessage } from "@/components/messaging/quoted-message";
import { MessageAttachment } from "@/components/messaging/message-attachment";
import { MessageText } from "@/components/messaging/message-text";
import { VoiceNote } from "@/components/messaging/voice-note";
import { VoiceRecorder } from "@/components/messaging/voice-recorder";
import { NotifyToggle } from "@/components/messaging/notify-toggle";
import { labelForRole } from "@/types";
import {
  ACCEPTED_ATTACHMENTS,
  humanSize,
  kindOfMime,
  shortFilename,
  whyNotSendable,
} from "@/lib/attachments";

/**
 * How far from the bottom of the thread still counts as "reading the latest".
 * Roughly one message's worth, so a half-scrolled row does not stop the view
 * following new arrivals.
 */
const NEAR_BOTTOM_PX = 120;

/**
 * How far a thread may be pulled back down while it is still settling.
 *
 * Larger than NEAR_BOTTOM_PX because media loading moves the ground by whole
 * pictures at a time: a photograph appearing at the end of a thread can add
 * three hundred pixels in one frame, and a reader who had not scrolled at all
 * would otherwise be left stranded above it. Still bounded, so somebody who
 * has scrolled up to read is left where they are.
 */
const SETTLING_PX = 600;

/**
 * How far from the bottom before the jump-down button appears.
 *
 * A fixed distance, not a fraction of the view. It was three quarters of the
 * screen height, which on a normal window meant scrolling up nearly five
 * hundred pixels before the way back appeared - by which point you have
 * already given up on it and started dragging.
 *
 * 240px is about two messages: far enough that the newest one is genuinely
 * off screen and the button is worth having, and far enough past
 * NEAR_BOTTOM_PX that it cannot flicker on and off as the thread follows a
 * new arrival.
 */
const JUMP_VISIBLE_PX = 240;

export default function MessagesPage() {
  const { user } = useAuthStore();
  const { data: conversations, isLoading } = useConversations();
  /*
    Which conversation is open is the URL, not state.

    It used to be a query string - `/messages?conversation=<id>` - which made
    every thread the same page wearing a parameter. A thread is something you
    link somebody to, reload, and come back to from a notification, so it has
    an address of its own: `/messages/<id>`, and the back button walks the
    conversations you actually visited.

    Reading it from the route rather than mirroring it into state means there
    is one answer to "which thread is this", and it survives a reload.
  */
  const pathname = usePathname();

  /**
   * The address, split into the messages path this role is on and the thread
   * on the end of it.
   *
   * Every role re-exports this screen under its own path - `/admin/messages`,
   * `/parent/messages` - so a conversation has to be appended to whichever
   * one the reader is actually on, or opening a thread would throw them into
   * another role's section of the app.
   *
   * Read from the pathname rather than from route parameters because the URL
   * is changed below without a navigation, and parameters only move when the
   * router does.
   */
  const [messagesBase, routeConv] = useMemo(() => {
    const at = pathname.lastIndexOf("/messages");
    // A trailing slash would make the address below "//<id>", which a browser
    // reads as another host rather than another path.
    if (at < 0) return [pathname.replace(/\/+$/, ""), null] as const;
    const base = pathname.slice(0, at + "/messages".length);
    const rest = pathname.slice(base.length).replace(/^\//, "");
    return [base, rest || null] as const;
  }, [pathname]);

  /*
    The route is the source of truth, and this follows it.

    Held in state as well so that opening a conversation shows it at once
    rather than after a navigation settles - clicking a name and watching the
    old thread sit there for a beat is the kind of lag that makes an app feel
    like a website. The effect below keeps the two in step: a reload, a
    notification and the back button all arrive as a route change, and the
    view follows.
  */
  const [selectedConv, setSelectedConv] = useState<string | null>(routeConv);
  useEffect(() => {
    setSelectedConv(routeConv);
  }, [routeConv]);

  /**
   * Open a thread, and give it its address.
   *
   * The URL is written with the History API rather than pushed through the
   * router. A router push changes the route segment, and Next answers that by
   * unmounting this screen and mounting a new one: the conversation you had
   * just clicked was drawn, and then a moment later the whole surface was
   * torn down and built again around it. That second rebuild is the flash,
   * and it took the scroll position, the reply you were writing and anything
   * else held in state down with it.
   *
   * `pushState` is supported for exactly this, and `usePathname` follows it,
   * so the back button, a reload and a link shared with somebody else all
   * still land on the right thread - without a navigation for a move that
   * never leaves the page.
   */
  const openConversation = useCallback(
    (id: string | null) => {
      setSelectedConv(id);
      const next = id ? `${messagesBase}/${id}` : messagesBase;
      if (window.location.pathname !== next) {
        window.history.pushState(null, "", next);
      }
    },
    [messagesBase],
  );
  /**
   * The open thread's own row in the inbox.
   *
   * Declared up here because the scrolling effects below depend on it: the
   * thread pane is only rendered once this is found, so until the inbox has
   * loaded there is no list element for them to scroll. It arrives from a
   * different request than the messages do, and on a cold load it is usually
   * the later of the two.
   */
  const selectedConversation = conversations?.find(
    (c: any) => c.id === selectedConv,
  );
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
  /**
   * The file chosen but not yet sent.
   *
   * Held rather than sent on choosing, so a caption can be typed with it and
   * so the wrong file can be taken back before anybody sees it - both of
   * which is what every messaging app does and therefore what people expect.
   */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  /** True while the recorder has replaced the field. */
  const [recordingVoice, setRecordingVoice] = useState(false);
  /**
   * Is there anything to send?
   *
   * Decides which single control sits at the end of the composer: Send when
   * there is, a microphone when there is not. `trim()` so a row of spaces is
   * not mistaken for a message and does not take the microphone away.
   */
  const hasSomethingToSend = messageText.trim() !== "" || !!pendingFile;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAttachment = useUploadAttachment();
  const [newConvType, setNewConvType] = useState("ONE_ON_ONE");
  const [newConvName, setNewConvName] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const debouncedUserSearch = useDebounce(userSearch, 300);
  const { data: usersData, isPending: contactsPending } =
    useContacts(debouncedUserSearch);
  // True between the keystroke and the answer: either the 300ms debounce has
  // not caught up yet, or the request for that term is still in the air.
  // Deliberately not `isFetching`, which is also true for a background
  // refetch - results already on screen should not blink away.
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
  /** The field itself, so opening a thread or answering a message lands in it. */
  const composerRef = useRef<HTMLInputElement>(null);
  /**
   * True once the reader has scrolled far enough up that the newest message
   * is off the bottom of the view.
   *
   * Far enough being a whole screen rather than a few pixels: a button that
   * appears the moment you nudge the wheel is a button that flickers, and
   * somebody reading the last few messages does not need to be told where the
   * bottom is.
   */
  const [scrolledUp, setScrolledUp] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mark as read when a conversation is open AND whenever a new incoming
  // message arrives while it's open (so the sender's ticks turn to "read"
  // even if the recipient never leaves the conversation).
  //
  // `status` is the sender's own tick and is not what tells us whether THIS
  // user has read a message: a message can be READ because somebody else in
  // the group opened it. `reads` is the per-user record, so that is what
  // decides - without it, opening a group thread somebody else had already
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
  // here rather than in the markup so the rules can be checked on their own -
  // see lib/messaging-view.ts.
  /**
   * The id of the newest message the last render knew about.
   *
   * Only a message that arrives while you are looking at the thread rises in.
   * Animating every group on open would be a staggered list entrance - a
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
  /** Set while waiting for a message of your own to render, so it can be followed. */
  const followingOwn = useRef(false);
  /**
   * Set from the moment a thread opens until the reader takes control of the
   * scroll, so the view stays glued to the bottom while the thread settles.
   *
   * Cleared by a real scrolling gesture rather than by a `scroll` event: the
   * pinning below sets `scrollTop` itself, and a scroll event cannot tell
   * that apart from a reader reaching for the wheel.
   */
  const holdingBottom = useRef(false);

  /**
   * Follow the bottom of the thread.
   *
   * Opening a thread jumps, straight to the end and without animating.
   * Smooth-scrolling on open aimed at the scroll height as it was when the
   * animation began, and the thread was still laying out underneath it - the
   * last message ended up half-hidden behind the composer, which is not where
   * any chat leaves you.
   *
   * After that it follows: a message or a typing notice arriving scrolls the
   * view down gently. The typing notice is a row like any other, so it has to
   * be a dependency - without it the notice appears below the fold and the
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
      holdingBottom.current = true;
      return;
    }


    /*
      Something you sent yourself always wins. `followingOwn` is armed when a
      message leaves and cleared here, once the message it was armed for has
      actually rendered - arming it is the only way to land on the true
      bottom, because at the moment of sending the new bubble is not in the
      thread yet and its height is not in `scrollHeight`.
    */
    if (followingOwn.current) {
      followingOwn.current = false;
      const toBottom = () => {
        list.scrollTop = list.scrollHeight;
      };
      toBottom();
      // And again after layout, for a message that wraps onto a second line.
      requestAnimationFrame(toBottom);
      return;
    }

    const nearBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_BOTTOM_PX;
    if (nearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    /*
      `selectedConversation` is a dependency because the thread pane - and so
      the element being scrolled - does not exist until the inbox request has
      answered. On a cold load the messages arrived first, this effect ran
      with nothing to scroll, and nothing ever changed again to make it run a
      second time: the thread sat at its first message until you scrolled it
      down by hand. Every later visit worked, because by then the inbox was
      cached and both were ready together.
    */
  }, [messages, typingNames.length, selectedConv, selectedConversation]);

  /**
   * Keep the bottom of the thread at the bottom while it is still settling.
   *
   * A photograph, a video or a voice note takes up no height until it has
   * loaded, so the jump on opening aims at a height that is about to grow. A
   * thread ending in a picture landed two hundred pixels short of its own last
   * message, which is exactly the bug the instant jump was meant to fix - only
   * caused by the media rather than by the animation.
   *
   * A ResizeObserver rather than load handlers on each element: it catches the
   * picture, the video, the voice note's controls, a late web font and
   * anything else that changes the height, without this having to know what
   * kinds of thing a message can contain.
   *
   * Only while the reader is already at the bottom, or has not yet scrolled
   * at all. Somebody who has scrolled up to read must not be yanked down
   * because an image three screens below them finished loading.
   */
  useEffect(() => {
    const list = messageListRef.current;
    if (!list || !selectedConv) return;
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      /*
        Until the reader takes the scroll, the bottom is followed however far
        the thread grows. That matters on a cold load of a thread's own URL:
        nine pictures and voice notes arrive at once and push the end of the
        conversation two thousand pixels away, which is far past any
        reasonable "nearly at the bottom" allowance - so a distance-based
        rule alone left the reader stranded at the top of the thread.

        After the reader has scrolled, the allowance applies again: media
        loading below them must not drag them off what they are reading.
      */
      const gap = list.scrollHeight - list.scrollTop - list.clientHeight;
      if (gap <= 0) return;
      if (holdingBottom.current || gap < SETTLING_PX) {
        list.scrollTop = list.scrollHeight;
      }
    });

    // The content, not the box: the box's own size does not change when a
    // picture inside it loads.
    for (const child of Array.from(list.children)) observer.observe(child);

    /*
      A gesture, not a scroll event. The pinning above moves `scrollTop`
      itself, and a `scroll` listener could not tell that from the reader
      reaching for the wheel - it would unpin on the very first frame.
    */
    const release = () => {
      holdingBottom.current = false;
    };
    const keys = new Set([
      "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown",
    ]);
    const onKey = (e: KeyboardEvent) => {
      if (keys.has(e.key)) release();
    };
    list.addEventListener("wheel", release, { passive: true });
    list.addEventListener("touchmove", release, { passive: true });
    list.addEventListener("keydown", onKey);

    return () => {
      observer.disconnect();
      list.removeEventListener("wheel", release);
      list.removeEventListener("touchmove", release);
      list.removeEventListener("keydown", onKey);
    };
    // `selectedConversation` for the same reason as above: no pane, no list
    // to observe, and nothing that would bring this effect back.
  }, [selectedConv, selectedConversation, threadBlocks.length]);

  /**
   * Watch how far from the bottom the reader is, so the jump-down button can
   * appear when it is useful and stay out of the way when it is not.
   */
  useEffect(() => {
    const list = messageListRef.current;
    if (!list || !selectedConv) return;

    const check = () => {
      const gap = list.scrollHeight - list.scrollTop - list.clientHeight;
      setScrolledUp(gap > JUMP_VISIBLE_PX);
    };
    check();
    list.addEventListener("scroll", check, { passive: true });
    return () => list.removeEventListener("scroll", check);
  }, [selectedConv, threadBlocks.length]);

  /*
    Opening a thread puts the cursor in the field. Somebody who clicks a
    conversation has already decided to write in it; making them click a
    second time to start is a step that exists for no reason.

    Skipped on a touch screen, where focusing a field throws the keyboard up
    over the conversation the moment it opens - the opposite of helpful.
  */
  useEffect(() => {
    if (!selectedConv) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) {
      return;
    }
    composerRef.current?.focus();
  }, [selectedConv]);

  /**
   * Start typing anywhere in the thread and the words go in the field.
   *
   * The field is focused when a thread opens, but focus is easily lost - you
   * click a message to reply, scroll with the mouse, come back from another
   * tab - and then the first thing you type disappears. Rather than hunting
   * for the box, typing simply puts you in it, the way it does in WhatsApp.
   *
   * Only for a key that would actually produce a character. Anything with a
   * modifier is a shortcut (⌘K, ⌘R, copy, paste), and anything already typed
   * into a field, a textarea or an editable element belongs where it is.
   */
  useEffect(() => {
    if (!selectedConv) return;

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // A single printable character. Named keys - Enter, Tab, ArrowUp - are
      // longer than one character, so this excludes them by construction.
      if (e.key.length !== 1) return;

      const on = document.activeElement as HTMLElement | null;
      const tag = on?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        on?.isContentEditable
      ) {
        return;
      }

      const field = composerRef.current;
      if (!field) return;
      /*
        Focus, and let the keystroke land on its own. Appending it here as
        well would type it twice - the browser still delivers the character
        to whatever holds focus once this handler returns.
      */
      field.focus();
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedConv]);

  /** Back to the newest message. */
  const jumpToBottom = useCallback(() => {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, []);

  /*
    Whatever you just sent is at the bottom, so that is where you should be.

    This matters most for a reply: answering a message means scrolling up to
    find it, and without this you send from up there and never see your own
    message land. The thread only follows new arrivals when you are already
    near the bottom - deliberately, so an incoming message does not yank a
    reader away - and your own message is the one exception to that.
  */
  const followOwnMessage = useCallback(() => {
    /*
      Armed rather than done here. At this moment the message has left but has
      not come back through the cache, so it is not in the thread and not in
      `scrollHeight` - scrolling now lands on the bottom as it was a moment
      ago, which is a message short. The effect above finishes the job when
      the bubble actually appears.
    */
    followingOwn.current = true;
    const list = messageListRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, []);

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

  /**
   * Choosing a file to attach.
   *
   * Refused here, before a byte is uploaded, when it is the wrong kind or too
   * large - somebody on a mobile line should not push fifty megabytes up only
   * to be told it was never going to fit. The API checks again regardless;
   * this is about not wasting the person's time and data.
   */
  const handleChooseFile = (chosen: File | null | undefined) => {
    // Always clear the input, so choosing the same file twice in a row still
    // fires a change event.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!chosen) return;

    const refusal = whyNotSendable(chosen);
    if (refusal) {
      toast.error(refusal);
      return;
    }
    setPendingFile(chosen);
  };

  /**
   * Uploads a file and sends it as a message in one go.
   *
   * A voice note takes this path rather than the pending-file one: it is
   * finished the moment recording stops, and asking somebody to press send
   * twice for one recording is a step nobody expects.
   */
  const sendFileNow = async (
    file: File,
    contentType: "FILE" | "VOICE",
    caption: string,
  ) => {
    if (!selectedConv) return;
    const replyToId = replyingTo?.id;
    setUploadPercent(0);
    try {
      const uploaded = await uploadAttachment.mutateAsync({
        file,
        onProgress: setUploadPercent,
      });
      setUploadPercent(null);
      setReplyingTo(null);
      followOwnMessage();
      sendMessageRest.mutate({
        conversationId: selectedConv,
        content: caption || uploaded.fileName,
        contentType,
        fileUrl: uploaded.fileUrl,
        fileName: uploaded.fileName,
        replyToId,
      });
    } catch {
      // The hook has already said why.
      setUploadPercent(null);
    }
  };

  /** A finished recording: sent straight away, under its own name. */
  const handleRecorded = (file: File, ran: number) => {
    setRecordingVoice(false);
    // A tap that produced nothing is not a message.
    if (ran < 1) {
      toast.error("That was too short to send. Hold on a moment longer.");
      return;
    }
    const refusal = whyNotSendable(file);
    if (refusal) {
      toast.error(refusal);
      return;
    }
    void sendFileNow(file, "VOICE", "");
  };

  const handleSend = async () => {
    if (!selectedConv) return;
    // A file on its own is a message; words on their own are a message; a
    // file with a caption is one message, not two.
    if (!messageText.trim() && !pendingFile) return;
    // One at a time: a second send while the first is still uploading would
    // send the same file twice.
    if (uploadPercent !== null) return;

    const text = messageText;
    const replyToId = replyingTo?.id;
    const file = pendingFile;

    /*
      The attachment goes up first, because the message cannot be stored
      without the URL it points at. Everything is cleared only once that has
      worked - a failed upload leaves the file and the caption where they
      were, so the person can try again rather than retyping.
    */
    let attachment: { fileUrl: string; fileName: string } | null = null;
    if (file) {
      setUploadPercent(0);
      try {
        attachment = await uploadAttachment.mutateAsync({
          file,
          onProgress: setUploadPercent,
        });
      } catch {
        // The hook has already said why.
        setUploadPercent(null);
        return;
      }
      setUploadPercent(null);
    }

    setMessageText("");
    setReplyingTo(null);
    setPendingFile(null);
    followOwnMessage();

    // Stop typing indicator
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    chatStore.stopTyping(selectedConv);

    const rest = {
      conversationId: selectedConv,
      // A file with no caption still needs something for the thread list and
      // for a quote of it to show; its name is the honest answer.
      content: text.trim() || attachment?.fileName || "",
      replyToId,
      ...(attachment
        ? {
            contentType: "FILE",
            fileUrl: attachment.fileUrl,
            fileName: attachment.fileName,
          }
        : {}),
    };

    if (chatStore.connected && !attachment) {
      try {
        const ack = await chatStore.sendMessage(selectedConv, text, undefined, replyToId);
        // The ack says whether a recipient was online to take it. Without
        // this the message sat on one tick until something else refreshed the
        // cache, even though the server had already marked it delivered.
        chatStore.applyAck(queryClient, selectedConv, ack);
      } catch {
        // Fallback to REST
        sendMessageRest.mutate(rest);
      }
    } else {
      // The socket carries text only, so anything with a file goes by REST.
      sendMessageRest.mutate(rest);
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
          openConversation(conv.id);
          setSelectedUserIds([]);
          setNewConvName("");
          setUserSearch("");
          chatStore.joinConversation(conv.id);
        },
      }
    );
  };


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

        Selected and unread are two different questions - "where am I" and
        "what is waiting" - so they get two different devices and can be true
        at once. Selection is a quiet change of ground, because it is
        permanent while you read. Unread is weight, full-strength preview
        text, and a count.
      */}
      <div className={`${selectedConv ? "hidden md:flex" : "flex"} w-full flex-col border-border md:w-[19rem] md:flex-shrink-0 md:border-r`}>
        <div className="flex items-center justify-between px-4 py-3.5">
          <h2 className="text-[0.95rem] font-semibold tracking-tight text-foreground">Messages</h2>
          <div className="flex items-center gap-0.5">
          <NotifyToggle />
          <button
            type="button"
            aria-label="Add"
            onClick={() => setShowNewModal(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <Plus className="h-[18px] w-[18px]" />
          </button>
          </div>
        </div>

        {/*
          Finding a thread in a long list.

          Searches who a conversation is with, not what was said in it. That
          is the question somebody actually has open - "where is the thread
          with Aline" - and it is answerable instantly from what is already
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
                  onClick={() => openConversation(conv.id)}
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
                    {/* A person gets their face; a group gets its initial,
                        because a group is not somebody. */}
                    {conv.type === "ONE_ON_ONE" && otherUser ? (
                      <Avatar
                        src={otherUser.photoUrl}
                        alt=""
                        size="sm"
                        className="h-9 w-9"
                      />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[0.8rem] font-semibold text-primary">
                        {name.charAt(0).toUpperCase()}
                      </span>
                    )}
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
                            {messagePreview(conv.lastMessage)}
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
              The header answers one question - who am I talking to, and are
              they here. The conversation's type used to be printed beside the
              name as the raw enum ("ONE ON _ONE"), which is a database value,
              not a thing to tell a teacher.
            */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <button
                aria-label="Go back"
                onClick={() => openConversation(null)}
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
                      {oneOnOne && other ? (
                        <Avatar
                          src={other.photoUrl}
                          alt=""
                          size="sm"
                          className="h-9 w-9"
                        />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[0.8rem] font-semibold text-primary">
                          {getConvName(selectedConversation).charAt(0).toUpperCase()}
                        </span>
                      )}
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
            {/*
              Wrapped so the jump-down button can sit over the thread rather
              than inside it: a child of the scrolling element scrolls away
              with the messages, which is the one place it must not be.
            */}
            <div className="relative flex min-h-0 flex-1 flex-col">
            {scrolledUp && (
              <button
                type="button"
                onClick={jumpToBottom}
                aria-label="Jump to the newest message"
                title="Jump to the newest message"
                /* Bottom-right, just above the composer: it is where you are
                   going, and it is out of the way of the messages you are
                   reading on the way there. */
                className="motion-fade-in absolute bottom-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-popover transition-colors hover:bg-surface-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            )}
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
                          // The tail opens a run and points at whoever said it.
                          // Four bubbles from one person do not need four
                          // arrows pointing at the same place.
                          const opensRun = i === 0;
                          const corner = `bubble ${
                            opensRun
                              ? group.mine
                                ? "bubble-tail-end"
                                : "bubble-tail-start"
                              : ""
                          }`;

                          return (
                            /*
                              Each message gets its own row, and its own reply
                              control beside it. It used to sit once under the
                              whole run, which meant two messages in a row left
                              the first one unanswerable - you could only ever
                              reply to the last thing somebody said.
                            */
                            <div
                              key={msg.id}
                              className={`group/bubble flex w-full items-center gap-1 ${
                                group.mine ? "flex-row-reverse" : ""
                              }`}
                            >
                            <div
                              id={`msg-${msg.id}`}
                              className={`max-w-[min(34rem,78%)] p-1.5 ${corner} ${
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
                              {/* The file first, its caption under it -
                                  the order every messaging app uses, because
                                  the caption is about the file. */}
                              {/* A voice note plays where it sits; every
                                  other file gets its own treatment. */}
                              {msg.fileUrl &&
                                (msg.contentType === "VOICE" ? (
                                  <VoiceNote
                                    fileUrl={msg.fileUrl}
                                    mine={group.mine}
                                  />
                                ) : (
                                  <MessageAttachment
                                    fileUrl={msg.fileUrl}
                                    fileName={msg.fileName}
                                    mine={group.mine}
                                  />
                                ))}
                              {/* A file sent with no caption is stored under
                                  its own name; repeating that under the file
                                  itself says nothing. */}
                              {msg.content &&
                                msg.contentType !== "VOICE" &&
                                !(msg.fileUrl && msg.content === msg.fileName) && (
                                  <MessageText
                                    text={msg.content}
                                    mine={group.mine}
                                  />
                                )}
                            </div>

                            {/*
                              Answering this message. Shown on hover of its own
                              row and whenever it has keyboard focus, so it is
                              not a mouse-only feature.
                            */}
                            <button
                              type="button"
                              onClick={() => {
                                setReplyingTo(msg);
                                // Straight into the field: answering is the
                                // whole reason the control was pressed.
                                composerRef.current?.focus();
                              }}
                              aria-label={`Reply to ${group.senderName}: ${
                                (msg.content || "message").slice(0, 40)
                              }`}
                              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-muted opacity-0 transition-opacity hover:bg-surface-muted hover:text-foreground focus:opacity-100 group-hover/bubble:opacity-100"
                            >
                              <CornerUpLeft className="h-3.5 w-3.5" />
                            </button>
                            </div>
                          );
                        })}

                        <span className="mt-0.5 flex items-center gap-1.5 px-1 text-[0.6875rem] tabular-nums text-muted">
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
            </div>

            {/*
              One field, one focus ring. The attach and send controls sit
              inside the same bordered container and on the same baseline as
              the text, rather than as two loose circles either side of a pill
              - three separate shapes for what is one action.
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

                  {/*
                    The file chosen but not yet sent, shown above the field so
                    it is plainly attached to what is being typed. An image
                    gets a thumbnail, because "which photo did I pick" is the
                    question a filename cannot answer.
                  */}
                  {pendingFile && (
                    <div className="mb-2 flex items-center gap-2.5 rounded-lg border border-border bg-surface-muted p-2">
                      {kindOfMime(pendingFile.type) === "image" ? (
                        <img
                          src={URL.createObjectURL(pendingFile)}
                          alt=""
                          className="h-10 w-10 flex-shrink-0 rounded object-cover"
                        />
                      ) : (
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-accent text-primary">
                          <FileText className="h-5 w-5" />
                        </span>
                      )}

                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-[0.8125rem] font-medium text-foreground"
                          title={pendingFile.name}
                        >
                          {shortFilename(pendingFile.name, 40)}
                        </span>
                        <span className="block text-[0.75rem] text-muted">
                          {uploadPercent !== null
                            ? `Sending… ${uploadPercent}%`
                            : humanSize(pendingFile.size)}
                        </span>
                        {/* How far along, for the fifty-megabyte video that
                            would otherwise look like the app had hung. */}
                        {uploadPercent !== null && (
                          <span
                            role="progressbar"
                            aria-label="Upload progress"
                            aria-valuenow={uploadPercent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-border"
                          >
                            <span
                              className="block h-full rounded-full bg-primary transition-[width] duration-200"
                              style={{ width: `${uploadPercent}%` }}
                            />
                          </span>
                        )}
                      </span>

                      <button
                        type="button"
                        aria-label="Remove attachment"
                        onClick={() => setPendingFile(null)}
                        disabled={uploadPercent !== null}
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-foreground disabled:opacity-40"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <div className="squircle flex items-center gap-1 rounded-xl border border-border bg-surface px-1.5 py-1 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_ATTACHMENTS}
                      className="hidden"
                      onChange={(e) => handleChooseFile(e.target.files?.[0])}
                    />
                    {!recordingVoice && (
                      <button
                        type="button"
                        aria-label="Attach a file"
                        title="Attach a file"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadPercent !== null}
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-40"
                      >
                        <Paperclip className="h-[17px] w-[17px]" />
                      </button>
                    )}

                    {!recordingVoice && (
                    <>
                    <input
                      ref={composerRef}
                      type="text"
                      value={messageText}
                      onChange={(e) => handleInputChange(e.target.value)}
                      placeholder="Type a message..."
                      aria-label="Type a message..."
                      onKeyDown={(e) => e.key === "Enter" && handleSend()}
                      /*
                        No ring of its own. The row around it already draws one
                        on focus-within, and the app-wide `:focus-visible` rule
                        was adding a second inside it - two outlines for one
                        cursor. `focus-visible:` rather than `focus:`, because
                        the global rule is on `:focus-visible` and a bare
                        `focus:` variant never reaches it.
                      */
                      className="min-w-0 flex-1 border-0 bg-transparent px-1.5 py-1.5 text-[0.875rem] text-foreground placeholder:text-muted focus:outline-none focus-visible:outline-none"
                    />
                    </>
                    )}

                    {/*
                      One control at the end of the row, and it is whichever
                      one you actually mean: a microphone while there is
                      nothing to send, and Send the moment there is.

                      Two buttons sitting side by side would make you pick
                      between them every time, when the state of the field has
                      already picked. Spaces do not count as typing - a
                      stray space should not take the microphone away.

                      While recording, the recorder takes the whole row: a
                      field you cannot type into sitting beside a running
                      recorder only invites people to try.
                    */}
                    <VoiceRecorder
                      hidden={hasSomethingToSend}
                      disabled={uploadPercent !== null}
                      onStart={() => setRecordingVoice(true)}
                      onRecorded={handleRecorded}
                      onCancel={() => setRecordingVoice(false)}
                    />

                    {!recordingVoice && hasSomethingToSend && (
                    <>
                    <button
                      type="button"
                      aria-label="Send message"
                      onClick={handleSend}
                      disabled={uploadPercent !== null}
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <Send className="h-[16px] w-[16px]" />
                    </button>
                    </>
                    )}
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
                    and the answer this used to read "No users found" - which
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
                    <span className="ml-2 text-xs text-muted">
                      {labelForRole(p.user.role)}
                    </span>
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