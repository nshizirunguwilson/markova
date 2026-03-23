import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator, SectionList,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  MessageSquare, Send, Check, CheckCheck, Search, Users,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore, type Conversation, type Message } from '@/stores/chat-store';
import { useParentChildren } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';
import api from '@/lib/api';

interface TeacherInfo {
  userId: string;
  firstName: string;
  lastName: string;
  subjects: string[];
}

interface TeacherSection {
  title: string;
  data: TeacherInfo[];
}

export default function ParentTeacherChatScreen() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? '';
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  if (activeConversation) {
    return (
      <InlineChatThread
        conversation={activeConversation}
        onBack={() => setActiveConversation(null)}
        userId={userId}
      />
    );
  }

  return <TeacherListView onSelectConversation={setActiveConversation} />;
}

// ─── Teacher List View ──────────────────────────────────

function TeacherListView({
  onSelectConversation,
}: {
  onSelectConversation: (c: Conversation) => void;
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? '';
  const { data: children, isLoading: loadingChildren } = useParentChildren();
  const { conversations, onlineUsers, createConversation, loadConversations, connect } = useChatStore();
  const [search, setSearch] = useState('');
  const [loadingTeacherId, setLoadingTeacherId] = useState<string | null>(null);

  // Ensure chat is connected
  useEffect(() => {
    connect();
  }, []);

  // Collect unique classSectionIds from children
  const classSectionIds = useMemo(() => {
    if (!children) return [];
    return [...new Set(children.map((c: any) => c.classSectionId).filter(Boolean))];
  }, [children]);

  // Fetch teachers for all class sections in a single query
  const { data: allAssignments, isLoading: loadingAssignments } = useQuery({
    queryKey: ['parent-class-teachers', classSectionIds],
    queryFn: async () => {
      const results: Record<string, any[]> = {};
      for (const id of classSectionIds) {
        const res = await api.get('/academic/assignments', { params: { classSectionId: id } });
        results[id] = res.data;
      }
      return results;
    },
    enabled: classSectionIds.length > 0,
  });

  // Build sections: group teachers by child
  const sections: TeacherSection[] = useMemo(() => {
    if (!children || !allAssignments) return [];

    const result: TeacherSection[] = [];

    children.forEach((child: any) => {
      const childName = `${child.user?.firstName ?? ''} ${child.user?.lastName ?? ''}`.trim();
      const assignments: any[] = allAssignments[child.classSectionId] ?? [];

      // Group assignments by teacher userId
      const teacherMap = new Map<string, TeacherInfo>();

      assignments.forEach((a: any) => {
        const teacherUserId = a.teacher?.userId ?? a.teacherUserId ?? a.teacherId;
        const teacherFirstName = a.teacher?.user?.firstName ?? a.teacher?.firstName ?? '';
        const teacherLastName = a.teacher?.user?.lastName ?? a.teacher?.lastName ?? '';
        const subjectName = a.subject?.name ?? '';

        if (!teacherUserId) return;
        if (teacherUserId === userId) return;

        const existing = teacherMap.get(teacherUserId);
        if (existing) {
          if (subjectName && !existing.subjects.includes(subjectName)) {
            existing.subjects.push(subjectName);
          }
        } else {
          teacherMap.set(teacherUserId, {
            userId: teacherUserId,
            firstName: teacherFirstName,
            lastName: teacherLastName,
            subjects: subjectName ? [subjectName] : [],
          });
        }
      });

      const teachers = Array.from(teacherMap.values());
      if (teachers.length > 0) {
        result.push({
          title: `Teachers of ${childName}`,
          data: teachers,
        });
      }
    });

    return result;
  }, [children, allAssignments, userId]);

  // Filter by search
  const filteredSections = useMemo(() => {
    if (!search.trim()) return sections;
    const q = search.toLowerCase();
    return sections
      .map((section) => ({
        ...section,
        data: section.data.filter(
          (t) =>
            `${t.firstName} ${t.lastName}`.toLowerCase().includes(q) ||
            t.subjects.some((s) => s.toLowerCase().includes(q))
        ),
      }))
      .filter((s) => s.data.length > 0);
  }, [sections, search]);

  const handleSelectTeacher = async (teacher: TeacherInfo) => {
    setLoadingTeacherId(teacher.userId);
    try {
      // Check if conversation already exists with this teacher
      const existing = conversations.find((c) =>
        c.participants.length === 2 &&
        c.participants.some((p) => p.userId === teacher.userId)
      );

      if (existing) {
        onSelectConversation(existing);
      } else {
        // Create a new conversation
        const conversationId = await createConversation([teacher.userId]);
        await loadConversations();
        const { conversations: updated } = useChatStore.getState();
        const newConv = updated.find((c) => c.id === conversationId);
        if (newConv) {
          onSelectConversation(newConv);
        }
      }
    } catch (error) {
      console.warn('Failed to open conversation:', error);
    } finally {
      setLoadingTeacherId(null);
    }
  };

  const isLoading = loadingChildren || loadingAssignments;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Chat with Teachers" onBack={() => router.back()} />

      <View style={styles.searchBar}>
        <Search size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search teachers or subjects..."
          placeholderTextColor={colors.mutedLight}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading teachers...</Text>
        </View>
      ) : filteredSections.length > 0 ? (
        <SectionList
          sections={filteredSections}
          keyExtractor={(item) => item.userId}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <Users size={16} color={colors.primary} />
              <Text style={styles.sectionHeaderText}>{title}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const isOnline = onlineUsers.has(item.userId);
            const isCurrentlyLoading = loadingTeacherId === item.userId;
            return (
              <Pressable
                style={styles.teacherRow}
                onPress={() => handleSelectTeacher(item)}
                disabled={isCurrentlyLoading}
              >
                <View style={styles.avatarContainer}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {item.firstName?.[0]}{item.lastName?.[0]}
                    </Text>
                  </View>
                  {isOnline && <View style={styles.onlineDot} />}
                </View>
                <View style={styles.teacherInfo}>
                  <Text style={styles.teacherName}>
                    {item.firstName} {item.lastName}
                  </Text>
                  {item.subjects.length > 0 && (
                    <Text style={styles.teacherSubjects} numberOfLines={1}>
                      {item.subjects.join(', ')}
                    </Text>
                  )}
                </View>
                {isCurrentlyLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <MessageSquare size={20} color={colors.primary} />
                )}
              </Pressable>
            );
          }}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Users size={48} color={colors.mutedLight} />
          <Text style={styles.emptyTitle}>No Teachers Found</Text>
          <Text style={styles.emptyText}>
            {search.trim()
              ? 'No teachers match your search.'
              : 'No teacher assignments found for your children.'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Inline Chat Thread ──────────────────────────────────

function InlineChatThread({
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
    if (status === 'DELIVERED') return <CheckCheck size={14} color={colors.mutedLight} />;
    return <Check size={14} color={colors.mutedLight} />;
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

        {typing.length > 0 && (
          <View style={styles.typingBar}>
            <Text style={styles.typingText}>
              {typing.map((t) => t.userName).join(', ')} typing...
            </Text>
          </View>
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.messageInput}
            placeholder="Type a message..."
            placeholderTextColor={colors.mutedLight}
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
            <Send size={20} color={input.trim() ? colors.white : colors.mutedLight} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, marginHorizontal: spacing.lg, marginVertical: spacing.sm,
    borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, color: colors.foreground, height: 36 },

  // Loading
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.md },

  // Section headers
  listContent: { paddingBottom: spacing['3xl'] },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  sectionHeaderText: {
    fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Teacher row
  teacherRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
    backgroundColor: colors.white,
  },
  avatarContainer: { position: 'relative' },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.white },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0, width: 14, height: 14,
    borderRadius: 7, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.white,
  },
  teacherInfo: { flex: 1 },
  teacherName: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.foreground },
  teacherSubjects: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },

  // Empty state
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.foreground, marginTop: spacing.lg },
  emptyText: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.sm, textAlign: 'center' },

  // Chat thread
  chatContainer: { flex: 1 },
  messageList: { padding: spacing.lg, paddingBottom: spacing.sm },

  bubble: {
    maxWidth: '78%', borderRadius: radius.lg, padding: spacing.md,
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
    flex: 1, backgroundColor: colors.background, borderRadius: radius.xl,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    fontSize: fontSize.base, color: colors.foreground,
    maxHeight: 100, minHeight: 40,
  },
  sendButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: colors.borderLight },
});
