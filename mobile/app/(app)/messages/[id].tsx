import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SendHorizontal } from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { listOfNames, talkersOf, watchNotice } from '@/lib/watching';
import { useTheme } from '@/design';
import { curve, gutter, radius, space, touch, type as typeScale } from '@/design/tokens';
import { Text, Avatar, LoadingRows } from '@/ui';

/**
 * One conversation.
 *
 * Bubbles are the one place in this design where a filled shape is the right
 * answer, because the alternation between two speakers is the content. Mine
 * are the brand colour, theirs are a neutral fill, and neither carries a
 * shadow or a tail.
 *
 * Timestamps only appear when the gap since the last message is worth
 * mentioning. Stamping every line with a time turns a conversation into a log.
 */

const GAP_WORTH_MENTIONING = 20 * 60 * 1000;

export default function Thread() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useAuthStore((s) => s.user?.id);

  const conversations = useChatStore((s) => s.conversations);
  const messagesByConversation = useChatStore((s) => s.messages);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const markRead = useChatStore((s) => s.markRead);
  const startTyping = useChatStore((s) => s.startTyping);
  const stopTyping = useChatStore((s) => s.stopTyping);
  const typingUsers = useChatStore((s) => s.typingUsers);

  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const listRef = useRef<FlatList>(null);

  const conversation = conversations.find((c) => c.id === id);
  // Named after the people talking, never whoever watches over the chat.
  const talkers = talkersOf(conversation?.participants, me);
  const person = talkers[0]?.user;
  const names = talkers.map((p) => `${p.user?.firstName ?? ''} ${p.user?.lastName ?? ''}`.trim()).filter(Boolean);
  const name = names.length ? listOfNames(names) : 'Conversation';
  const notice = watchNotice(conversation?.participants, me);

  const messages = useMemo(() => messagesByConversation[id ?? ''] ?? [], [messagesByConversation, id]);
  const theyAreTyping = typingUsers.some((u) => u.conversationId === id && u.userId !== me);

  useEffect(() => {
    if (!id) return;
    void loadMessages(id).finally(() => setLoading(false));
    markRead(id);
  }, [id, loadMessages, markRead]);

  const send = () => {
    const body = draft.trim();
    if (!body || !id) return;
    sendMessage(id, body);
    setDraft('');
    stopTyping(id);
  };

  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: t.bg.page }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={92}
      >
        {notice ? (
          <Text
            variant="footnote"
            tone="tertiary"
            testID="watch-notice"
            style={{
              paddingHorizontal: gutter,
              paddingVertical: space.sm,
              borderBottomWidth: 1,
              borderBottomColor: t.line.hairline,
            }}
          >
            {notice}
          </Text>
        ) : null}
        {loading ? (
          <LoadingRows count={6} />
        ) : (
          <FlatList
            ref={listRef}
            data={[...messages].reverse()}
            inverted
            keyExtractor={(m: any) => m.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: gutter, paddingVertical: space.lg, gap: space.sm }}
            renderItem={({ item, index }) => {
              const mine = item.senderId === me;
              const older = [...messages].reverse()[index + 1];
              const showTime =
                !older ||
                new Date(item.createdAt).getTime() - new Date(older.createdAt).getTime() >
                  GAP_WORTH_MENTIONING;

              return (
                <View style={{ gap: space.xs }}>
                  {showTime ? (
                    <Text variant="footnote" tone="placeholder" align="center" style={{ paddingVertical: space.sm }}>
                      {new Date(item.createdAt).toLocaleString(undefined, {
                        day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                      })}
                    </Text>
                  ) : null}

                  <View
                    style={{
                      alignSelf: mine ? 'flex-end' : 'flex-start',
                      maxWidth: '82%',
                      paddingHorizontal: space.lg,
                      paddingVertical: space.md,
                      borderRadius: radius.lg,
                      backgroundColor: mine ? t.brand.solid : t.bg.fill,
                      ...curve,
                    }}
                  >
                    <Text variant="body" selectable style={{ color: mine ? t.brand.onSolid : t.fg.primary }}>
                      {item.content}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {theyAreTyping ? (
          <Text variant="footnote" tone="tertiary" style={{ paddingHorizontal: gutter, paddingBottom: space.xs }}>
            {person?.firstName ?? 'They'} is typing
          </Text>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: space.sm,
            paddingHorizontal: gutter,
            paddingTop: space.md,
            paddingBottom: space.lg,
            borderTopWidth: 1,
            borderTopColor: t.line.hairline,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={(v) => {
              setDraft(v);
              if (id) (v ? startTyping : stopTyping)(id);
            }}
            placeholder="Write a message"
            placeholderTextColor={t.fg.placeholder}
            multiline
            style={[
              typeScale.body,
              {
                flex: 1,
                maxHeight: 120,
                minHeight: touch.min,
                color: t.fg.primary,
                paddingHorizontal: space.lg,
                paddingTop: space.md,
                paddingBottom: space.md,
                borderWidth: 1,
                borderColor: t.line.border,
                borderRadius: radius.lg,
                ...curve,
              },
            ]}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim()}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={{
              width: touch.min,
              height: touch.min,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.full,
              backgroundColor: draft.trim() ? t.brand.solid : t.bg.fill,
            }}
          >
            <SendHorizontal
              size={19}
              color={draft.trim() ? t.brand.onSolid : t.fg.placeholder}
              strokeWidth={2}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
