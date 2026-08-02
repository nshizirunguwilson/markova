import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, UserPlus, Upload } from 'lucide-react-native';

import { usePeople, type DirectoryUser } from '@/hooks/useApi';
import { useDebounce } from '@/hooks/useDebounce';
import { useTheme } from '@/design';
import { gutter, space } from '@/design/tokens';
import { Row, Avatar, Badge, Field, Segmented, Empty, LoadingRows, Failed, Text, Button } from '@/ui';

/**
 * Everyone, in one list.
 *
 * The web splits this into three pages, users, students and teachers, because
 * a sidebar has room for three links. On a phone that would mean three nearly
 * identical screens and three different places to search, so it is one list
 * with a role filter.
 *
 * A FlatList rather than the usual Screen, because a large school has a few
 * thousand people in it and mounting all of them at once is the difference
 * between a list that scrolls and one that stutters on the kind of Android
 * phone this is actually used on.
 */

const ROLES = [
  { value: '', label: 'Everyone' },
  { value: 'STUDENT', label: 'Students' },
  { value: 'TEACHER', label: 'Teachers' },
  { value: 'PARENT', label: 'Parents' },
  { value: 'ADMIN', label: 'Admins' },
  { value: 'LIBRARIAN', label: 'Librarians' },
] as const;

export default function People() {
  const t = useTheme();
  const router = useRouter();
  const [role, setRole] = useState<string>('');
  const [query, setQuery] = useState('');
  const search = useDebounce(query, 300);

  const { data, isPending, isError, refetch, isRefetching } = usePeople({
    role: role || undefined,
    search: search || undefined,
  });

  const people = useMemo<DirectoryUser[]>(() => data?.data ?? [], [data]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.page }}>
      <View style={{ paddingHorizontal: gutter, paddingTop: space.md, gap: space.lg }}>
        <Field
          label="Search"
          value={query}
          onChangeText={setQuery}
          placeholder="Name, email, phone, or ID"
          autoCapitalize="none"
          autoCorrect={false}
          accessory={<Search size={18} color={t.fg.tertiary} strokeWidth={2} />}
        />
        <Segmented value={role} onChange={setRole} options={ROLES as never} />
      </View>

      <FlatList
        data={people}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={{ paddingTop: space.lg, paddingBottom: space.huge }}
        ListHeaderComponent={
          people.length ? (
            <Text
              variant="caption"
              tone="tertiary"
              caps
              style={{ paddingHorizontal: gutter, paddingBottom: space.sm }}
            >
              {data?.total ?? people.length} found
            </Text>
          ) : null
        }
        ListEmptyComponent={
          isPending ? (
            <LoadingRows count={8} lead />
          ) : isError ? (
            <Failed onRetry={refetch} />
          ) : (
            <Empty
              title={search ? 'Nobody matches that' : 'Nobody here yet'}
              body={
                search
                  ? 'Try part of a name, or an ID number.'
                  : 'Add people one at a time, or import a spreadsheet.'
              }
              action={{ label: 'Add someone', onPress: () => router.push('/(app)/people/new') }}
            />
          )
        }
        renderItem={({ item, index }) => {
          const name = `${item.firstName} ${item.lastName}`.trim();
          return (
            <Row
              title={name}
              subtitle={
                item.student?.studentIdNumber ??
                item.email ??
                item.phone ??
                undefined
              }
              lead={<Avatar name={name} photoUrl={item.photoUrl} size="md" />}
              value={
                !item.isActive ? (
                  <Badge label="Off" tone="neutral" />
                ) : role === '' ? (
                  <Badge label={item.role.charAt(0) + item.role.slice(1).toLowerCase()} tone="neutral" />
                ) : undefined
              }
              onPress={() => router.push(`/(app)/people/${item.id}`)}
              last={index === people.length - 1}
            />
          );
        }}
      />

      <View
        style={{
          flexDirection: 'row',
          gap: space.md,
          paddingHorizontal: gutter,
          paddingBottom: space.lg,
          paddingTop: space.md,
          borderTopWidth: 1,
          borderTopColor: t.line.hairline,
        }}
      >
        <Button
          label="Add someone"
          kind="primary"
          icon={<UserPlus size={18} color={t.brand.onSolid} strokeWidth={2} />}
          onPress={() => router.push('/(app)/people/new')}
        />
        <Button
          label="Import"
          kind="secondary"
          icon={<Upload size={18} color={t.fg.primary} strokeWidth={2} />}
          onPress={() => router.push('/(app)/people/import')}
        />
      </View>
    </View>
  );
}
