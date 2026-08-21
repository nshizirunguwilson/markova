import { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MessageSquare, Search, PenSquare, WifiOff } from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { useChatStore, type Conversation } from '@/stores/chat-store';
import { useDebounce } from '@/hooks/useDebounce';
import { useTheme } from '@/design';
import { gutter, space } from '@/design/tokens';
import { Row, Avatar, Field, Empty, LoadingRows, Text, Button, Badge } from '@/ui';

/**
 * Conversations.
 *
 * Replaces parent-teacher-chat, which was a parent-only version of a screen
 * every role needs. A teacher messaging a parent and a parent messaging a
 * teacher are the same screen viewed from two ends.
 *
 * The connection state is shown only when it is bad. A green "connected" dot
 * is noise, because connected is the expected case and telling somebody their
 * software is working as intended is not information. A grey bar saying
 * messages will send when the signal returns is worth the space.
 */

const relativeTime = (iso?: string) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export default function Messages() {
  const t = useTheme();
  const router = useRouter();
  const me = useAuthStore((s) => s.user?.id);

  const conversations = useChatStore((s) => s.conversations);
  const connected = useChatStore((s) => s.connected);
  const loadConversations = useChatStore((s) => s.loadConversations);

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const search = useDebounce(query, 250).toLowerCase();

  useEffect(() => {
    void loadConversations().finally(() => setLoading(false));
  }, [loadConversations]);

  /** Who this conversation is with, from the point of view of whoever is looking. */
  const other = (c: Conversation) =>
    c.participants?.find((p) => p.userId !== me)?.user ??
    c.participants?.[0]?.user ?? { firstName: 'Unknown', lastName: '', role: '', id: '', photoUrl: undefined };

  const visible = useMemo(() => {
    if (!search) return conversations;
    return conversations.filter((c) => {
      const person = other(c);
      return `${person.firstName} ${person.lastName}`.toLowerCase().includes(search);
    });
  }, [conversations, search, me]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.page }}>
      {!connected ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            paddingHorizontal: gutter,
            paddingVertical: space.sm,
            backgroundColor: t.bg.fill,
          }}
        >
          <WifiOff size={14} color={t.fg.tertiary} strokeWidth={2} />
          <Text variant="footnote" tone="tertiary">
            Offline. Anything you send will go out when the signal is back.
          </Text>
        </View>
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={(c) => c.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        onRefresh={() => void loadConversations()}
        refreshing={false}
        contentContainerStyle={{ paddingBottom: space.huge }}
        ListHeaderComponent={
          conversations.length > 6 ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: space.md }}>
              <Field
                label="Search"
                value={query}
                onChangeText={setQuery}
                placeholder="Who are you looking for?"
                autoCapitalize="none"
                accessory={<Search size={18} color={t.fg.tertiary} strokeWidth={2} />}
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <LoadingRows count={6} lead />
          ) : (
            <Empty
              icon={<MessageSquare size={30} color={t.fg.placeholder} strokeWidth={1.6} />}
              title={search ? 'Nobody by that name' : 'No conversations yet'}
              body={
                search
                  ? undefined
                  : 'Start one with a teacher, a parent or the office, and it will live here.'
              }
              action={{ label: 'Start a conversation', onPress: () => router.push('/(app)/messages/new') }}
            />
          )
        }
        renderItem={({ item, index }) => {
          const person = other(item);
          const name = `${person.firstName} ${person.lastName}`.trim();
          const unread = item.unreadCount ?? 0;
          const preview =
            item.lastMessage?.contentType === 'TEXT'
              ? item.lastMessage.content
              : item.lastMessage
                ? 'Attachment'
                : 'No messages yet';

          return (
            <Row
              title={name}
              subtitle={preview}
              lead={<Avatar name={name} photoUrl={person.photoUrl} size="md" />}
              value={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text variant="footnote" tone="tertiary">
                    {relativeTime(item.lastMessage?.createdAt ?? item.updatedAt)}
                  </Text>
                  {unread > 0 ? (
                    <Badge label={unread > 99 ? '99+' : String(unread)} tone="brand" numeric />
                  ) : null}
                </View>
              }
              chevron={false}
              onPress={() => router.push(`/(app)/messages/${item.id}`)}
              last={index === visible.length - 1}
            />
          );
        }}
      />

      <View
        style={{
          paddingHorizontal: gutter,
          paddingTop: space.md,
          paddingBottom: space.lg,
          borderTopWidth: 1,
          borderTopColor: t.line.hairline,
        }}
      >
        <Button
          label="New conversation"
          kind="primary"
          block
          icon={<PenSquare size={18} color={t.brand.onSolid} strokeWidth={2} />}
          onPress={() => router.push('/(app)/messages/new')}
        />
      </View>
    </View>
  );
}
