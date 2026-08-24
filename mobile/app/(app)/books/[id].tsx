import { useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { toast } from 'sonner-native';

import { useBook, useActiveLoans, useCheckoutBook, useReturnBook, useReportLostBook } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen, Section, Row, RowGroup, Text, Button, Badge, Fact,
  LoadingRows, Failed, Stat, StatRow, Avatar, statusTone, humanise,
} from '@/ui';

/**
 * One title, and who has the copies.
 *
 * The count that matters is not how many exist but how many are on the shelf,
 * so that leads. Underneath is the list of people holding one, because "who
 * has the other three" is the question a librarian is standing there asking.
 *
 * Reporting a copy lost is here rather than at the desk, because it happens
 * days after the conversation and it costs somebody money.
 */
export default function BookDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: book, isPending, isError, refetch } = useBook(id);
  const { data: loans } = useActiveLoans();
  const returnBook = useReturnBook();
  const reportLost = useReportLostBook();
  const [confirmLost, setConfirmLost] = useState<string | null>(null);

  if (isPending)
    return (
      <>
        <Stack.Screen options={{ title: 'Book' }} />
        <Screen><LoadingRows count={5} /></Screen>
      </>
    );

  if (isError || !book)
    return (
      <>
        <Stack.Screen options={{ title: 'Book' }} />
        <Screen><Failed onRetry={refetch} /></Screen>
      </>
    );

  const held = ((loans as any[]) ?? []).filter((l) => l.bookId === id);
  const out = book.quantity - book.availableCount;

  return (
    <>
      <Stack.Screen options={{ title: book.title }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        <View style={{ gap: space.xs }}>
          <Text variant="title1">{book.title}</Text>
          <Text variant="callout" tone="secondary">{book.author}</Text>
        </View>

        <StatRow>
          <Stat
            value={book.availableCount}
            label="On the shelf"
            tone={book.availableCount === 0 ? 'critical' : 'positive'}
          />
          <Stat value={out} label="Out" />
          <Stat value={book.quantity} label="Owned" />
        </StatRow>

        <Section title="Details">
          <View>
            {book.category ? <Fact label="Category" value={book.category} /> : null}
            {book.shelfLocation ? <Fact label="Where it lives" value={book.shelfLocation} /> : null}
            {book.isbn ? <Fact label="ISBN" value={book.isbn} mono /> : null}
            {book.barcode ? <Fact label="Barcode" value={book.barcode} mono /> : null}
            <Fact
              label="Replacement cost"
              value={book.replacementCost != null ? String(book.replacementCost) : 'Not set'}
              last
            />
          </View>
        </Section>

        <Section title={held.length ? 'Who has a copy' : 'Nobody has a copy out'}>
          {held.length ? (
            <RowGroup>
              {held.map((loan: any, i: number) => {
                const name = loan.borrower
                  ? `${loan.borrower.firstName} ${loan.borrower.lastName}`.trim()
                  : 'Unknown';
                const overdue = new Date(loan.dueDate).getTime() < Date.now();
                return (
                  <Row
                    key={loan.id}
                    title={name}
                    subtitle={`Due ${new Date(loan.dueDate).toLocaleDateString()}`}
                    lead={<Avatar name={name} size="sm" />}
                    value={
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                        <Badge
                          label={overdue ? 'Overdue' : humanise(loan.status)}
                          tone={overdue ? 'critical' : statusTone[loan.status] ?? 'neutral'}
                        />
                        {confirmLost === loan.id ? (
                          <Text
                            variant="subhead"
                            tone="critical"
                            suppressHighlighting
                            onPress={() =>
                              reportLost.mutate(loan.id, {
                                onSuccess: () => {
                                  toast.success('Marked lost and charged');
                                  setConfirmLost(null);
                                },
                              })
                            }
                          >
                            Confirm lost
                          </Text>
                        ) : (
                          <Text
                            variant="subhead"
                            tone="brand"
                            suppressHighlighting
                            onPress={() =>
                              returnBook.mutate(loan.id, {
                                onSuccess: () => toast.success('Returned'),
                              })
                            }
                          >
                            Return
                          </Text>
                        )}
                      </View>
                    }
                    chevron={false}
                    onPress={() => setConfirmLost(confirmLost === loan.id ? null : loan.id)}
                    last={i === held.length - 1}
                  />
                );
              })}
            </RowGroup>
          ) : (
            <Text variant="callout" tone="secondary">
              Every copy is on the shelf.
            </Text>
          )}
          {held.length ? (
            <Text variant="footnote" tone="tertiary">
              Tap a row to report that copy lost.
            </Text>
          ) : null}
        </Section>
      </Screen>
    </>
  );
}
