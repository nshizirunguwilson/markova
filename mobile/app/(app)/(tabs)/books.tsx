import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, Plus, Library } from 'lucide-react-native';

import { useBooks, useMyLoans, type Book } from '@/hooks/useApi';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuthStore } from '@/stores/auth-store';
import { useTheme } from '@/design';
import { gutter, space } from '@/design/tokens';
import {
  Row,
  Field,
  Badge,
  Button,
  Empty,
  LoadingRows,
  Failed,
  Text,
  Section,
  RowGroup,
  Screen,
  statusTone,
  humanise,
} from '@/ui';

/**
 * The catalogue.
 *
 * Two very different people open this. A librarian is looking for a specific
 * title to lend or shelve. A student or teacher is looking to see whether the
 * school even has something, and to check what they themselves have out.
 *
 * Rather than build two screens, the borrower view leads with their own loans,
 * which is the thing they came for, and the catalogue sits underneath.
 * Availability is stated as a count rather than as a green tick, because
 * "2 of 5 on the shelf" answers the actual question and a tick does not.
 */
export default function Books() {
  const t = useTheme();
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const isStaff = role === 'LIBRARIAN' || role === 'ADMIN';

  const [query, setQuery] = useState('');
  const search = useDebounce(query, 300);
  const { data: books, isPending, isError, refetch, isRefetching } = useBooks(search || undefined);
  const myLoans = useMyLoans();

  const borrowerLoans = !isStaff ? (myLoans.data ?? []) : [];

  const catalogue = (
    <FlatList
      data={books ?? []}
      keyExtractor={(item: Book) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      onRefresh={refetch}
      refreshing={isRefetching}
      contentContainerStyle={{ paddingBottom: space.huge }}
      ListHeaderComponent={
        <View style={{ paddingHorizontal: gutter, paddingTop: space.md, gap: space.lg }}>
          <Field
            label="Search the shelves"
            value={query}
            onChangeText={setQuery}
            placeholder="Title, author, ISBN or barcode"
            autoCapitalize="none"
            autoCorrect={false}
            accessory={<Search size={18} color={t.fg.tertiary} strokeWidth={2} />}
          />
          {borrowerLoans.length ? (
            <Section title="You have out">
              <RowGroup>
                {borrowerLoans.map((loan: any, i: number) => (
                  <Row
                    key={loan.id}
                    title={loan.book?.title ?? 'Untitled'}
                    subtitle={`Due ${new Date(loan.dueDate).toLocaleDateString()}`}
                    value={
                      <Badge
                        label={humanise(loan.status)}
                        tone={statusTone[loan.status] ?? 'neutral'}
                      />
                    }
                    chevron={false}
                    last={i === borrowerLoans.length - 1}
                  />
                ))}
              </RowGroup>
            </Section>
          ) : null}
          {books?.length ? (
            <Text variant="caption" tone="tertiary" caps style={{ paddingTop: space.sm }}>
              {books.length} title{books.length === 1 ? '' : 's'}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        isPending ? (
          <LoadingRows count={8} />
        ) : isError ? (
          <Failed onRetry={refetch} />
        ) : (
          <Empty
            icon={<Library size={30} color={t.fg.placeholder} strokeWidth={1.6} />}
            title={search ? 'No match on the shelves' : 'The catalogue is empty'}
            body={
              search
                ? 'Try the author, or part of the title.'
                : isStaff
                  ? 'Add the first title and it will show up here.'
                  : 'Nothing has been catalogued yet.'
            }
            action={isStaff ? { label: 'Add a book', onPress: () => router.push('/(app)/books/new') } : undefined}
          />
        )
      }
      renderItem={({ item, index }) => {
        const out = item.quantity - item.availableCount;
        return (
          <Row
            title={item.title}
            subtitle={[item.author, item.shelfLocation].filter(Boolean).join('   ·   ')}
            value={
              item.availableCount === 0 ? (
                <Badge label="All out" tone="critical" />
              ) : (
                <Text variant="subhead" tone="secondary" numeric>
                  {item.availableCount} of {item.quantity}
                </Text>
              )
            }
            onPress={isStaff ? () => router.push(`/(app)/books/${item.id}`) : undefined}
            chevron={isStaff}
            last={index === (books?.length ?? 0) - 1}
          />
        );
      }}
    />
  );

  if (!isStaff) return <View style={{ flex: 1, backgroundColor: t.bg.page }}>{catalogue}</View>;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.page }}>
      {catalogue}
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
          label="Add a book"
          kind="primary"
          block
          icon={<Plus size={18} color={t.brand.onSolid} strokeWidth={2} />}
          onPress={() => router.push('/(app)/books/new')}
        />
      </View>
    </View>
  );
}
