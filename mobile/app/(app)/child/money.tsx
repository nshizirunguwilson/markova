import { Stack, useLocalSearchParams } from 'expo-router';
import { Wallet } from 'lucide-react-native';

import {
  usePocketMoneyAccount,
  usePocketMoneyStatement,
  type PocketMoneyEntry,
} from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen,
  Section,
  Row,
  RowGroup,
  Badge,
  Empty,
  LoadingRows,
  Stat,
  StatRow,
  Text,
} from '@/ui';

/**
 * Where the money went.
 *
 * The only question a parent has about pocket money, and the one an exercise
 * book at the counter has never been able to answer. So the statement is the
 * whole screen: every entry, what it was for, and who was at the counter.
 */

const KINDS: Record<PocketMoneyEntry['kind'], string> = {
  DEPOSIT: 'Money in',
  WITHDRAWAL: 'Spent',
  REFUND: 'Returned to you',
  REVERSAL: 'Correction',
  ADJUSTMENT: 'Adjustment',
};

function rwf(amount: number) {
  return `${Math.round(amount).toLocaleString('en-RW')} RWF`;
}

export default function ChildMoney() {
  const t = useTheme();
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name?: string }>();
  const { data: account, isPending, refetch, isRefetching } = usePocketMoneyAccount(studentId);
  const { data: statement } = usePocketMoneyStatement(studentId);

  const entries = statement?.data ?? [];

  return (
    <>
      <Stack.Screen options={{ title: name ? `${name}, pocket money` : 'Pocket money' }} />
      <Screen
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={{ gap: space.xxl }}
      >
        {isPending ? (
          <LoadingRows count={5} />
        ) : (
          <>
            <Section title="Held by the school">
              <StatRow>
                <Stat
                  value={rwf(account?.balance ?? 0)}
                  label="Left"
                  tone={account?.isLow ? 'caution' : 'primary'}
                />
                <Stat value={rwf(account?.spentToday ?? 0)} label="Spent today" />
                {account?.dailyLimit != null ? (
                  <Stat
                    value={rwf(account.dailyLimit)}
                    label="Daily cap"
                    detail="Set by you, so a term's money lasts a term"
                  />
                ) : null}
              </StatRow>
              {account?.isFrozen ? <Badge label="Frozen by the school" tone="critical" /> : null}
            </Section>

            <Section title="Every entry">
              {entries.length === 0 ? (
                <Empty
                  icon={<Wallet size={30} color={t.fg.placeholder} strokeWidth={1.6} />}
                  title="Nothing yet"
                  body="Money handed in on visiting day shows up here, and so does everything spent."
                />
              ) : (
                <RowGroup>
                  {entries.map((e, i) => (
                    <Row
                      key={e.id}
                      title={KINDS[e.kind]}
                      subtitle={[
                        e.note,
                        e.recordedBy,
                        new Date(e.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                        }),
                      ]
                        .filter(Boolean)
                        .join('   ·   ')}
                      value={
                        <Text variant="body" tone={e.signedAmount < 0 ? 'secondary' : 'primary'}>
                          {e.signedAmount < 0 ? '' : '+'}
                          {rwf(e.signedAmount)}
                        </Text>
                      }
                      chevron={false}
                      last={i === entries.length - 1}
                    />
                  ))}
                </RowGroup>
              )}
            </Section>
          </>
        )}
      </Screen>
    </>
  );
}
