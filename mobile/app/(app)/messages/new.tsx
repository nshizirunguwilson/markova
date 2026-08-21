import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import { toast } from 'sonner-native';

import { useContacts } from '@/hooks/useApi';
import { useChatStore } from '@/stores/chat-store';
import { useDebounce } from '@/hooks/useDebounce';
import { useTheme } from '@/design';
import { gutter, space } from '@/design/tokens';
import { Row, Avatar, Field, Badge, Empty, LoadingRows, Text } from '@/ui';

/**
 * Who you are allowed to write to.
 *
 * The list comes from the API rather than from the directory, because the
 * rules about who may message whom belong on the server. A parent sees their
 * children's teachers and the office, not every parent in the school.
 *
 * Picking somebody starts the conversation and goes straight into it. There is
 * no compose screen and no subject line, because this is a chat.
 */
export default function NewConversation() {
  const t = useTheme();
  const router = useRouter();
  const { data: contacts, isPending } = useContacts();
  const createConversation = useChatStore((s) => s.createConversation);

  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const search = useDebounce(query, 250).toLowerCase();

  const visible = useMemo(() => {
    const all = contacts ?? [];
    if (!search) return all;
    return all.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(search));
  }, [contacts, search]);

  const start = async (userId: string) => {
    setBusy(true);
    try {
      const conversationId = await createConversation([userId]);
      router.replace(`/(app)/messages/${conversationId}`);
    } catch {
      toast.error('Could not start that conversation');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'New conversation' }} />
      <View style={{ flex: 1, backgroundColor: t.bg.page }}>
        <View style={{ paddingHorizontal: gutter, paddingTop: space.md }}>
          <Field
            label="Search"
            value={query}
            onChangeText={setQuery}
            placeholder="Who do you want to reach?"
            autoCapitalize="none"
            accessory={<Search size={18} color={t.fg.tertiary} strokeWidth={2} />}
          />
        </View>

        <FlatList
          data={visible}
          keyExtractor={(c) => c.id}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: space.lg, paddingBottom: space.huge }}
          ListEmptyComponent={
            isPending ? (
              <LoadingRows count={8} lead />
            ) : (
              <Empty
                title={search ? 'Nobody by that name' : 'Nobody to message yet'}
                body={
                  search
                    ? undefined
                    : 'The school decides who each role can reach. If somebody is missing, the office can link you.'
                }
              />
            )
          }
          renderItem={({ item, index }) => {
            const name = `${item.firstName} ${item.lastName}`.trim();
            return (
              <Row
                title={name}
                lead={<Avatar name={name} photoUrl={item.photoUrl} size="md" />}
                value={<Badge label={item.role.charAt(0) + item.role.slice(1).toLowerCase()} tone="neutral" />}
                disabled={busy}
                onPress={() => void start(item.id)}
                last={index === visible.length - 1}
              />
            );
          }}
        />
      </View>
    </>
  );
}
