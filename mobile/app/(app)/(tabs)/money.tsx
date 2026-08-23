import { useState } from 'react';
import { View } from 'react-native';
import { Wallet } from 'lucide-react-native';
import { toast } from 'sonner-native';

import {
  useLookupAccount,
  usePocketMoneyMove,
  usePocketMoneyStatement,
  type PocketMoneyAccount,
  type PocketMoneyEntry,
} from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen,
  Section,
  Row,
  RowGroup,
  Avatar,
  Badge,
  Button,
  Empty,
  Field,
  Segmented,
  Stat,
  StatRow,
  Text,
} from '@/ui';

/**
 * The pocket money counter.
 *
 * A boarding school holds a child's cash: a parent hands it over on visiting
 * day and the student draws it down at the canteen. The counter is a person
 * standing at a window with a queue, which is a phone in a hand rather than a
 * desk, so this screen is the one that actually gets used.
 *
 * Scan the card, see the face and the balance, hand over the money, record it.
 * The face matters: the number on the card is not who is standing there.
 */

const KINDS: Record<PocketMoneyEntry['kind'], string> = {
  DEPOSIT: 'Money in',
  WITHDRAWAL: 'Spent',
  REFUND: 'Returned',
  REVERSAL: 'Correction',
  ADJUSTMENT: 'Adjustment',
};

function rwf(amount: number) {
  return `${Math.round(amount).toLocaleString('en-RW')} RWF`;
}

export default function Money() {
  const t = useTheme();
  const [code, setCode] = useState('');
  const [account, setAccount] = useState<PocketMoneyAccount | null>(null);
  const [move, setMove] = useState<'withdraw' | 'deposit' | 'refund'>('withdraw');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const lookup = useLookupAccount();
  const record = usePocketMoneyMove();
  const { data: statement } = usePocketMoneyStatement(account?.studentId);

  const entries = statement?.data ?? [];

  const find = () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    lookup.mutate(trimmed, {
      onSuccess: (found) => {
        setAccount(found);
        setCode('');
      },
      onError: (e: any) =>
        toast.error(e?.response?.data?.message ?? 'No student with that card'),
    });
  };

  const submit = () => {
    const value = Number(amount);
    if (!account || !value || value <= 0) return;
    record.mutate(
      { kind: move, studentId: account.studentId, amount: value, note: note.trim() || undefined },
      {
        onSuccess: (updated: PocketMoneyAccount) => {
          setAccount(updated);
          setAmount('');
          setNote('');
          toast.success(
            move === 'deposit'
              ? `Taken in. Balance ${rwf(updated.balance)}`
              : `Handed over. Balance ${rwf(updated.balance)}`,
          );
        },
        // The API refuses an overdraft and names the actual number, which is
        // more use at a counter than anything this screen could invent.
        onError: (e: any) =>
          toast.error(e?.response?.data?.message ?? 'Could not record that'),
      },
    );
  };

  return (
    <Screen contentContainerStyle={{ gap: space.xxl }}>
      <Section title="Find the student">
        <Field
          label="Card or student number"
          value={code}
          onChangeText={setCode}
          onSubmitEditing={find}
          autoCapitalize="characters"
          mono
          placeholder="Scan the card or type STD-…"
        />
        <Button label="Look them up" block loading={lookup.isPending} onPress={find} />
      </Section>

      {!account ? (
        <Empty
          icon={<Wallet size={30} color={t.fg.placeholder} strokeWidth={1.6} />}
          title="Nobody at the counter"
          body="Scan a card to see whose money you are holding and how much of it is left."
        />
      ) : (
        <>
          <Section title="At the counter">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
              <Avatar
                name={account.student.name}
                photoUrl={account.student.photoUrl}
                size="lg"
              />
              <View style={{ flex: 1 }}>
                <Text variant="body">{account.student.name}</Text>
                <Text variant="caption" tone="tertiary">
                  {account.student.studentIdNumber}   ·   {account.student.level}
                </Text>
              </View>
              {account.isFrozen ? <Badge label="Frozen" tone="critical" /> : null}
            </View>

            <StatRow>
              <Stat
                value={rwf(account.balance)}
                label="Held for them"
                tone={account.isLow ? 'caution' : 'primary'}
              />
              <Stat value={rwf(account.spentToday)} label="Spent today" />
              {account.dailyLimit !== null ? (
                <Stat
                  value={rwf(account.remainingToday ?? 0)}
                  label="Left today"
                  detail={`Daily cap ${rwf(account.dailyLimit)}`}
                  tone={(account.remainingToday ?? 0) <= 0 ? 'critical' : 'primary'}
                />
              ) : null}
            </StatRow>
          </Section>

          <Section title="Record it">
            <Segmented
              options={[
                { value: 'withdraw', label: 'Hand over' },
                { value: 'deposit', label: 'Take in' },
                { value: 'refund', label: 'Give back' },
              ]}
              value={move}
              onChange={setMove}
            />
            <Field
              label="Amount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              accessory={
                <Text variant="caption" tone="tertiary">
                  RWF
                </Text>
              }
            />
            <Field
              label="What for"
              value={note}
              onChangeText={setNote}
              placeholder={move === 'deposit' ? 'Visiting day, from mother' : 'Canteen'}
            />
            <Button
              label={
                move === 'deposit'
                  ? 'Take the money in'
                  : move === 'refund'
                    ? 'Give it back'
                    : 'Hand it over'
              }
              block
              loading={record.isPending}
              disabled={!amount || Number(amount) <= 0}
              onPress={submit}
            />
            <Text variant="caption" tone="tertiary">
              Nothing here is edited or deleted. A mistake is put right with a
              correcting entry, so the ledger still stands up months later.
            </Text>
          </Section>

          <Section title="Recent entries">
            {entries.length === 0 ? (
              <Text variant="caption" tone="tertiary">
                Nothing recorded for this student yet.
              </Text>
            ) : (
              <RowGroup>
                {entries.slice(0, 12).map((e, i) => (
                  <Row
                    key={e.id}
                    title={KINDS[e.kind]}
                    subtitle={[e.note, e.recordedBy, new Date(e.createdAt).toLocaleDateString()]
                      .filter(Boolean)
                      .join('   ·   ')}
                    value={
                      <Text
                        variant="body"
                        tone={e.signedAmount < 0 ? 'secondary' : 'primary'}
                      >
                        {e.signedAmount < 0 ? '' : '+'}
                        {rwf(e.signedAmount)}
                      </Text>
                    }
                    chevron={false}
                    last={i === Math.min(entries.length, 12) - 1}
                  />
                ))}
              </RowGroup>
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}
