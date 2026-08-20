import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable, KeyboardAvoidingView,
  Platform, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Send, ArrowLeft, Check, CheckCheck, Circle, WifiOff, Search, MessageSquare,
} from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore, type Conversation, type Message } from '@/stores/chat-store';
import { ScreenHeader } from '@/components/ScreenHeader';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

export default function MessagesScreen() {
  const user = useAuthStore((s) => s.user);
  const chat = useChatStore();
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  // Connect on mount
  useEffect(() => {
    chat.connect();
    return () => {
      // Don't disconnect — keep connection alive for background messages
    };
  }, []);

  if (activeConversation) {
    return (
      <ChatThread
        conversation={activeConversation}
        onBack={() => setActiveConversation(null)}
        userId={user?.id ?? ''}
      />
    );
  }

  return <ConversationList onSelect={setActiveConversation} userId={user?.id ?? ''} />;
}

// ─── Conversation List ────────────────────────────────

function ConversationList({
  onSelect,
  userId,
}: {
  onSelect: (c: Conversation) => void;
  userId: string;
}) {
  const { conversations, loadConversations, connected, onlineUsers, unreadCount } = useChatStore();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  }, [loadConversations]);

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) =>
      c.participants.some((p) =>
        p.user && p.userId !== userId &&
        `${p.user.firstName} ${p.user.lastName}`.toLowerCase().includes(q)
      )
    );
  }, [conversations, search, userId]);

  const getOtherUser = (c: Conversation) => {
    const other = c.participants.find((p) => p.userId !== userId);
    return other?.user ?? { firstName: 'Unknown', lastName: '', id: '' };
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Messages"
        rightAction={
          !connected ? <WifiOff size={20} color={colors.danger} /> : undefined
        }
      />
      <View style={styles.searchBar}>
        <Search size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations..."
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      {filtered.length > 0 ? (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          renderItem={({ item }) => {
            const other = getOtherUser(item);
            const isOnline = onlineUsers.has(other.id);
            const hasUnread = (item.unreadCount ?? 0) > 0;
            return (
              <Pressable style={styles.convRow} onPress={() => onSelect(item)}>
                <View style={styles.avatarContainer}>
                  <View style={styles.convAvatar}>
                    <Text style={styles.convAvatarText}>
                      {other.firstName?.[0]}{other.lastName?.[0]}
                    </Text>
                  </View>
                  {isOnline && <View style={styles.onlineDot} />}
                </View>
                <View style={styles.convContent}>
                  <View style={styles.convTopRow}>
                    <Text style={[styles.convName, hasUnread && styles.convNameBold]} numberOfLines={1}>
                      {other.firstName} {other.lastName}
                    </Text>
                    <Text style={styles.convTime}>
                      {item.lastMessage ? formatTime(item.lastMessage.createdAt) : ''}
                    </Text>
                  </View>
                  <View style={styles.convBottomRow}>
                    <Text style={[styles.convPreview, hasUnread && styles.convPreviewBold]} numberOfLines={1}>
                      {item.lastMessage
                        ? item.lastMessage.senderId === userId
                          ? `You: ${item.lastMessage.content}`
                          : item.lastMessage.content
                        : 'No messages yet'}
                    </Text>
                    {hasUnread && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{item.unreadCount}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      ) : (
        <View style={styles.empty}>
          <MessageSquare size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>No Conversations</Text>
          <Text style={styles.emptyText}>Start a conversation from the web dashboard.</Text>
        </View>
      )}
    </View>
  );
}

// ─── Chat Thread ──────────────────────────────────────

function ChatThread({
  conversation,
  onBack,
  userId,
}: {
  conversation: Conversation;
  onBack: () => void;
  userId: string;
}) {
  const { messages, loadMessages, sendMessage, markRead, startTyping, stopTyping, typingUsers, onlineUsers } = useChatStore();
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const convMessages = messages[conversation.id] ?? [];
  const other = conversation.participants.find((p) => p.userId !== userId)?.user;
  const isOnline = other ? onlineUsers.has(other.id) : false;
  const typing = typingUsers.filter((t) => t.conversationId === conversation.id);

  useEffect(() => {
    loadMessages(conversation.id);
    markRead(conversation.id);
  }, [conversation.id]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (convMessages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [convMessages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendMessage(conversation.id, text);
    setInput('');
    stopTyping(conversation.id);
  };

  const handleTyping = (text: string) => {
    setInput(text);
    if (text.length > 0) {
      startTyping(conversation.id);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        stopTyping(conversation.id);
      }, 3000);
    } else {
      stopTyping(conversation.id);
    }
  };

  const formatMessageTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderTicks = (status: string) => {
    if (status === 'READ') return <CheckCheck size={14} color={colors.primaryLight} />;
    if (status === 'DELIVERED') return <CheckCheck size={14} color={colors.muted} />;
    return <Check size={14} color={colors.muted} />;
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={other ? `${other.firstName} ${other.lastName}` : 'Chat'}
        subtitle={isOnline ? 'Online' : 'Offline'}
        onBack={onBack}
      />

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={convMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => {
            const isMine = item.senderId === userId;
            return (
              <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
                  {item.content}
                </Text>
                <View style={styles.bubbleMeta}>
                  <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs]}>
                    {formatMessageTime(item.createdAt)}
                  </Text>
                  {isMine && renderTicks(item.status)}
                </View>
              </View>
            );
          }}
        />

        {/* Typing indicator */}
        {typing.length > 0 && (
          <View style={styles.typingBar}>
            <Text style={styles.typingText}>
              {typing.map((t) => t.userName).join(', ')} typing...
            </Text>
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.messageInput}
            placeholder="Type a message..."
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={handleTyping}
            multiline
            maxLength={2000}
          />
          <Pressable
            onPress={handleSend}
            style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]}
            disabled={!input.trim()}
          >
            <Send size={20} color={input.trim() ? colors.white : colors.muted} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, marginHorizontal: spacing.lg, marginVertical: spacing.sm,
    borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, color: colors.foreground, height: 36 },

  // Conversation list
  convRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted,
    backgroundColor: colors.white,
  },
  avatarContainer: { position: 'relative' },
  convAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  convAvatarText: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.white },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0, width: 14, height: 14,
    borderRadius: 7, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.white,
  },
  convContent: { flex: 1 },
  convTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName: { fontSize: fontSize.base, color: colors.foreground, flex: 1 },
  convNameBold: { fontWeight: fontWeight.bold },
  convTime: { fontSize: fontSize.xs, color: colors.muted },
  convBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 },
  convPreview: { fontSize: fontSize.sm, color: colors.muted, flex: 1 },
  convPreviewBold: { color: colors.foreground, fontWeight: fontWeight.semibold },
  unreadBadge: {
    backgroundColor: colors.primary, borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  unreadText: { fontSize: 11, fontWeight: fontWeight.bold, color: colors.white },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.foreground, marginTop: spacing.lg },
  emptyText: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.sm, textAlign: 'center' },

  // Chat thread
  chatContainer: { flex: 1 },
  messageList: { padding: spacing.lg, paddingBottom: spacing.sm },

  bubble: {
    maxWidth: '78%', borderRadius: radius.xl, padding: spacing.md,
    marginBottom: spacing.sm,
  },
  bubbleMine: {
    alignSelf: 'flex-end', backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    alignSelf: 'flex-start', backgroundColor: colors.white,
    borderBottomLeftRadius: 4,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  bubbleText: { fontSize: fontSize.base, lineHeight: 22 },
  bubbleTextMine: { color: colors.white },
  bubbleTextTheirs: { color: colors.foreground },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, justifyContent: 'flex-end' },
  bubbleTime: { fontSize: 11 },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.7)' },
  bubbleTimeTheirs: { color: colors.muted },

  typingBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  typingText: { fontSize: fontSize.xs, color: colors.muted, fontStyle: 'italic' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border,
  },
  messageInput: {
    flex: 1, backgroundColor: colors.background, borderRadius: radius['2xl'],
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    fontSize: fontSize.base, color: colors.foreground,
    maxHeight: 100, minHeight: 40,
  },
  sendButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: colors.surfaceMuted },
});
