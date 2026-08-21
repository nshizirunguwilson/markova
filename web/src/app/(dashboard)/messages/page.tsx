"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button, Badge, Spinner, Input, Modal } from "@/components/ui";
import {
  useConversations,
  useMessages,
  useCreateConversation,
  useSendMessage,
  useContacts,
} from "@/hooks/use-messaging";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import { MessageSquare, Plus, Send, Check, CheckCheck, Circle, ArrowLeft, WifiOff } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

export default function MessagesPage() {
  const { user } = useAuthStore();
  const { data: conversations, isLoading } = useConversations();
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const { data: messages } = useMessages(selectedConv || undefined);
  const sendMessageRest = useSendMessage();
  const createConv = useCreateConversation();
  const chatStore = useChatStore();

  const [messageText, setMessageText] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [newConvType, setNewConvType] = useState("ONE_ON_ONE");
  const [newConvName, setNewConvName] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const debouncedUserSearch = useDebounce(userSearch, 300);
  const { data: usersData } = useContacts(debouncedUserSearch);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mark as read when a conversation is open AND whenever a new incoming
  // message arrives while it's open (so the sender's ticks turn to "read"
  // even if the recipient never leaves the conversation).
  useEffect(() => {
    if (!selectedConv || !chatStore.connected) return;
    const hasIncomingUnread = (messages || []).some(
      (m: any) => m.sender?.id !== user?.id && m.status !== "READ"
    );
    if (hasIncomingUnread) {
      chatStore.markRead(selectedConv);
    }
  }, [selectedConv, chatStore.connected, messages, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Memoize reversed messages to avoid re-computing every render
  const reversedMessages = useMemo(
    () => (messages ? [...messages].reverse() : []),
    [messages]
  );

  // Get typing users for current conversation
  const typingMap = selectedConv ? chatStore.getTypingUsers(selectedConv) : new Map();
  const typingNames = Array.from(typingMap.values());

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
    setMessageText("");

    // Stop typing indicator
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    chatStore.stopTyping(selectedConv);

    if (chatStore.connected) {
      try {
        await chatStore.sendMessage(selectedConv, text);
      } catch {
        // Fallback to REST
        sendMessageRest.mutate({ conversationId: selectedConv, content: text });
      }
    } else {
      sendMessageRest.mutate({ conversationId: selectedConv, content: text });
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
      const other = conv.participants?.find((p: any) => p.user.id !== user?.id);
      return other?.user ? `${other.user.firstName ?? ""} ${other.user.lastName ?? ""}`.trim() : "Chat";
    }
    return `Group (${conv.participants?.length || 0})`;
  };

  const getOtherUser = (conv: any) => {
    if (conv.type === "ONE_ON_ONE") {
      return conv.participants?.find((p: any) => p.user.id !== user?.id)?.user;
    }
    return null;
  };

  // Format last seen
  const formatLastSeen = (date: string | null) => {
    if (!date) return "offline";
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "last seen just now";
    if (diffMin < 60) return `last seen ${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `last seen ${diffHr}h ago`;
    return `last seen ${d.toLocaleDateString()}`;
  };

  // Message status ticks
  const MessageTicks = ({ msg }: { msg: any }) => {
    if (msg.sender?.id !== user?.id) return null;
    const status = msg.status || "SENT";

    if (status === "READ") {
      return <CheckCheck className="inline h-3.5 w-3.5 text-primary-light" />;
    }
    if (status === "DELIVERED") {
      return <CheckCheck className="inline h-3.5 w-3.5 text-white/50" />;
    }
    return <Check className="inline h-3.5 w-3.5 text-white/50" />;
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-0">
      {/* WebSocket disconnect indicator */}
      {!chatStore.connected && (
        <div className="flex items-center justify-center gap-2 bg-warning-wash border border-warning/30 rounded-lg px-4 py-2 mb-2 text-sm text-warning">
          <WifiOff className="h-4 w-4" />
          Reconnecting...
        </div>
      )}

    <div className="flex flex-1 gap-0 md:gap-4 min-h-0">
      {/* Conversation List */}
      <div className={`${selectedConv ? "hidden md:block" : "block"} w-full md:w-80 flex-shrink-0 overflow-y-auto rounded-xl border border-border bg-surface p-3`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-foreground">Messages</h2>
          <Button aria-label="Add" size="sm" variant="ghost" onClick={() => setShowNewModal(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : conversations?.length > 0 ? (
          <div className="space-y-1">
            {conversations.map((conv: any) => {
              const otherUser = getOtherUser(conv);
              const isOtherOnline = otherUser ? chatStore.isOnline(otherUser.id) : false;

              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConv(conv.id)}
                  className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                    selectedConv === conv.id ? "bg-primary/10" : "hover:bg-muted/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                          {getConvName(conv).charAt(0).toUpperCase()}
                        </div>
                        {conv.type === "ONE_ON_ONE" && (
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${
                              isOtherOnline ? "bg-success" : "bg-muted"
                            }`}
                          />
                        )}
                      </div>
                      <span className="text-sm font-medium text-foreground truncate max-w-[140px]">
                        {getConvName(conv)}
                      </span>
                    </div>
                    {conv.unreadCount > 0 && (
                      <Badge variant="danger" className="ml-2">{conv.unreadCount}</Badge>
                    )}
                  </div>
                  {conv.lastMessage && (
                    <p className="mt-0.5 ml-10 text-xs text-muted truncate">
                      {conv.lastMessage.sender.firstName}: {conv.lastMessage.content}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-muted py-8">
            <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p className="text-sm font-medium">No conversations yet</p>
            <p className="mt-1 text-xs">Start a new conversation using the + button above</p>
          </div>
        )}
      </div>

      {/* Chat Area */}
      <div className={`${selectedConv ? "flex" : "hidden md:flex"} flex-1 flex-col rounded-xl border border-border bg-surface`}>
        {selectedConv && selectedConversation ? (
          <>
            {/* Header with online status */}
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <button aria-label="Go back"
                  onClick={() => setSelectedConv(null)}
                  className="md:hidden flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted/10"
                >
                  <ArrowLeft className="h-5 w-5 text-foreground" />
                </button>
                <div className="relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                    {getConvName(selectedConversation).charAt(0).toUpperCase()}
                  </div>
                  {(() => {
                    const other = getOtherUser(selectedConversation);
                    if (other && selectedConversation.type === "ONE_ON_ONE") {
                      return (
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${
                            chatStore.isOnline(other.id) ? "bg-success" : "bg-muted"
                          }`}
                        />
                      );
                    }
                    return null;
                  })()}
                </div>
                <div>
                  <span className="font-medium text-foreground">{getConvName(selectedConversation)}</span>
                  {(() => {
                    const other = getOtherUser(selectedConversation);
                    if (other && selectedConversation.type === "ONE_ON_ONE") {
                      return (
                        <p className="text-xs text-muted">
                          {chatStore.isOnline(other.id)
                            ? "online"
                            : formatLastSeen(other.lastSeenAt)}
                        </p>
                      );
                    }
                    // Group: show online count
                    const onlineCount = selectedConversation.participants?.filter(
                      (p: any) => p.user.id !== user?.id && chatStore.isOnline(p.user.id)
                    ).length || 0;
                    return (
                      <p className="text-xs text-muted">
                        {selectedConversation.participants?.length} members{onlineCount > 0 ? `, ${onlineCount} online` : ""}
                      </p>
                    );
                  })()}
                </div>
                <Badge className="ml-auto">{selectedConversation.type.replace("_", " ")}</Badge>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {reversedMessages.map((msg: any) => {
                const isMe = msg.sender.id === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                      isMe ? "bg-primary text-white" : "bg-muted/10 text-foreground"
                    }`}>
                      {!isMe && (
                        <p className="text-xs font-medium mb-0.5 opacity-70">
                          {msg.sender.firstName} {msg.sender.lastName}
                        </p>
                      )}
                      <p className="text-sm">{msg.content}</p>
                      <div className={`flex items-center justify-end gap-1 mt-1 ${isMe ? "text-white/60" : "text-muted"}`}>
                        <span className="text-xs">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <MessageTicks msg={msg} />
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator */}
              {typingNames.length > 0 && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-muted/10 px-4 py-2">
                    <p className="text-xs text-muted italic">
                      {typingNames.length === 1
                        ? `${typingNames[0]} is typing`
                        : `${typingNames.slice(0, 2).join(", ")} ${typingNames.length > 2 ? `and ${typingNames.length - 2} more ` : ""}are typing`}
                      <span className="typing-dots">...</span>
                    </p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm focus:border-primary focus:outline-none"
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                 aria-label="Type a message..."/>
                <Button aria-label="Send message" onClick={handleSend} className="rounded-full">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-muted/30" />
              <p className="mt-2 text-muted">Select a conversation or start a new one</p>
              {chatStore.connected && (
                <p className="mt-1 text-xs text-success flex items-center justify-center gap-1">
                  <Circle className="h-2 w-2 fill-success" /> Connected
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
            <label className="mb-1 block text-sm font-medium text-foreground">Type</label>
            <select
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
                {usersData?.data?.filter((u: any) => u.id !== user?.id && !selectedUserIds.includes(u.id)).length === 0 ? (
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
                        <div>
                          <span className="font-medium text-foreground">{u.firstName} {u.lastName}</span>
                          <span className="ml-2 text-xs text-muted">{u.role}</span>
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
    </div>
    </div>
  );
}
