"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button, Badge, Spinner, Input, Modal, Avatar } from "@/components/ui";
import {
  useConversations,
  useMessages,
  useCreateConversation,
  useSendMessage,
  useMarkRead,
} from "@/hooks/use-messaging";
import { useAuthStore } from "@/stores/auth-store";
import { MessageSquare, Plus, Send, Users } from "lucide-react";

export default function MessagesPage() {
  const { user } = useAuthStore();
  const { data: conversations, isLoading } = useConversations();
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const { data: messages } = useMessages(selectedConv || undefined);
  const sendMessage = useSendMessage();
  const markRead = useMarkRead();
  const createConv = useCreateConversation();

  const [messageText, setMessageText] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [newConvUserId, setNewConvUserId] = useState("");
  const [newConvType, setNewConvType] = useState("ONE_ON_ONE");
  const [newConvName, setNewConvName] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mark as read when selecting a conversation
  useEffect(() => {
    if (selectedConv) {
      markRead.mutate(selectedConv);
    }
  }, [selectedConv]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!messageText.trim() || !selectedConv) return;
    sendMessage.mutate({
      conversationId: selectedConv,
      content: messageText,
    });
    setMessageText("");
  };

  const handleNewConversation = () => {
    if (!newConvUserId.trim()) return;
    createConv.mutate(
      {
        type: newConvType,
        name: newConvName || undefined,
        participantUserIds: newConvUserId.split(",").map((id) => id.trim()),
      },
      {
        onSuccess: (conv: any) => {
          setShowNewModal(false);
          setSelectedConv(conv.id);
          setNewConvUserId("");
          setNewConvName("");
        },
      }
    );
  };

  const selectedConversation = conversations?.find((c: any) => c.id === selectedConv);

  const getConvName = (conv: any) => {
    if (conv.name) return conv.name;
    if (conv.type === "ONE_ON_ONE") {
      const other = conv.participants?.find((p: any) => p.user.id !== user?.id);
      return other ? `${other.user.firstName} ${other.user.lastName}` : "Chat";
    }
    return `Group (${conv.participants?.length || 0})`;
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Conversation List */}
      <div className="w-80 flex-shrink-0 overflow-y-auto rounded-xl border border-border bg-surface p-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-foreground">Messages</h2>
          <Button size="sm" variant="ghost" onClick={() => setShowNewModal(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : conversations?.length > 0 ? (
          <div className="space-y-1">
            {conversations.map((conv: any) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConv(conv.id)}
                className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                  selectedConv === conv.id ? "bg-primary/10" : "hover:bg-muted/10"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground truncate">
                    {getConvName(conv)}
                  </span>
                  {conv.unreadCount > 0 && (
                    <Badge variant="danger" className="ml-2">{conv.unreadCount}</Badge>
                  )}
                </div>
                {conv.lastMessage && (
                  <p className="mt-0.5 text-xs text-muted truncate">
                    {conv.lastMessage.sender.firstName}: {conv.lastMessage.content}
                  </p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted text-sm py-8">No conversations yet.</p>
        )}
      </div>

      {/* Chat Area */}
      <div className="flex flex-1 flex-col rounded-xl border border-border bg-surface">
        {selectedConv && selectedConversation ? (
          <>
            {/* Header */}
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">{getConvName(selectedConversation)}</span>
                <Badge>{selectedConversation.type.replace("_", " ")}</Badge>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages && [...messages].reverse().map((msg: any) => {
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
                      <p className={`text-xs mt-1 ${isMe ? "text-white/60" : "text-muted"}`}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm focus:border-primary focus:outline-none"
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                />
                <Button onClick={handleSend} isLoading={sendMessage.isPending} className="rounded-full">
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
              onChange={(e) => setNewConvType(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              <option value="ONE_ON_ONE">Direct Message</option>
              <option value="GROUP">Group</option>
              <option value="BROADCAST">Broadcast</option>
            </select>
          </div>
          {newConvType !== "ONE_ON_ONE" && (
            <Input label="Group Name" value={newConvName} onChange={(e) => setNewConvName(e.target.value)} />
          )}
          <Input
            label="User ID(s)"
            value={newConvUserId}
            onChange={(e) => setNewConvUserId(e.target.value)}
            placeholder="Enter user UUID (comma-separated for groups)"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewModal(false)}>Cancel</Button>
            <Button onClick={handleNewConversation} isLoading={createConv.isPending}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
