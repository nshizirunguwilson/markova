import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { toast } from 'sonner-native';
import { ScanLine, BellRing } from 'lucide-react-native';

import {
  useActiveLoans,
  useOverdueLoans,
  useReturnBook,
  useSendLoanReminders,
  type Loan,
} from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen,
  Section,
  Row,
  RowGroup,
  Segmented,
  Badge,
  Button,
  Empty,
  LoadingRows,
  Failed,
  Text,
  statusTone,
  humanise,
} from '@/ui';

/**
 * The desk.
 *
 * This is the screen a librarian has open while a queue of students is in
 * front of them, so it is built around one action repeated quickly rather than
 * around browsing. Overdue leads, because that is the pile that needs saying
 * something about, and returning is a single tap on the row rather than a
 * detail screen and a confirm.
 *
 * The date is written as "4 days over" rather than as a date, because at a
 * desk the useful fact is the size of the problem, not the calendar.
 */

const daysBetween = (iso: string) =>
  Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);

export default function Circulate() {
  const t = useTheme();
  const router = useRouter();
  const [view, setView] = useState<'overdue' | 'out'>('overdue');

  const active = useActiveLoans();
  const overdue = useOverdueLoans();
  const returnBook = useReturnBook();
  const remind = useSendLoanReminders();

  const source = view === 'overdue' ? overdue : active;
  const loans = useMemo<Loan[]>(() => (source.data as Loan[]) ?? [], [source.data]);

  const handleReturn = (loan: Loan) => {
    returnBook.mutate(
      { loanId: loan.id } as never,
      {
        onSuccess: () => toast.success(`${loan.book?.title ?? 'Book'} returned`),
        onError: () => toast.error('Could not record that return'),
      },
    );
  };

  return (
    <Screen
      bleed
      onRefresh={() => {
        void active.refetch();
        void overdue.refetch();
      }}
      refreshing={source.isRefetching}
      contentContainerStyle={{ paddingHorizontal: 0, gap: space.xl }}
    >
      <View style={{ paddingHorizontal: space.xl, gap: space.lg }}>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'overdue', label: `Overdue ${overdue.data?.length ?? 0}` },
            { value: 'out', label: `On loan ${active.data?.length ?? 0}` },
          ]}
        />

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Button
            label="Scan a book"
            kind="primary"
            icon={<ScanLine size={18} color={t.brand.onSolid} strokeWidth={2} />}
            onPress={() => router.push('/(app)/scan')}
          />
          {view === 'overdue' && (overdue.data?.length ?? 0) > 0 ? (
            <Button
              label="Remind everyone"
              kind="secondary"
              icon={<BellRing size={18} color={t.fg.primary} strokeWidth={2} />}
              loading={remind.isPending}
              onPress={() =>
                remind.mutate(undefined, {
                  onSuccess: () => toast.success('Reminders sent'),
                  onError: () => toast.error('Could not send those'),
                })
              }
            />
          ) : null}
        </View>
      </View>

      {source.isPending ? (
        <LoadingRows count={6} />
      ) : source.isError ? (
        <Failed onRetry={source.refetch} />
      ) : !loans.length ? (
        <Empty
          title={view === 'overdue' ? 'Nothing overdue' : 'Nothing out'}
          body={
            view === 'overdue'
              ? 'Every book that is out is still within its due date.'
              : 'The whole collection is on the shelves.'
          }
        />
      ) : (
        <Section
          title={view === 'overdue' ? 'Past their due date' : 'Currently out'}
        >
          <RowGroup>
            {loans.map((loan, i) => {
              const over = daysBetween(loan.dueDate);
              const borrower = loan.borrower
                ? `${loan.borrower.firstName} ${loan.borrower.lastName}`
                : 'Unknown borrower';

              return (
                <Row
                  key={loan.id}
                  title={loan.book?.title ?? 'Untitled'}
                  subtitle={`${borrower}${
                    over > 0 ? `   ·   ${over} day${over === 1 ? '' : 's'} over` : ''
                  }`}
                  value={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <Badge
                        label={humanise(loan.status)}
                        tone={statusTone[loan.status] ?? 'neutral'}
                      />
                      <Text
                        variant="subhead"
                        tone="brand"
                        onPress={() => handleReturn(loan)}
                        suppressHighlighting
                      >
                        Return
                      </Text>
                    </View>
                  }
                  chevron={false}
                  last={i === loans.length - 1}
                />
              );
            })}
          </RowGroup>
        </Section>
      )}
    </Screen>
  );
}
