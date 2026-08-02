import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { toast } from 'sonner-native';
import { Nfc } from 'lucide-react-native';

import { useClassSections, useClassStudentsNfc, useRegisterNfcCard } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen, Section, Row, RowGroup, Text, Field, Button, Badge, Segmented,
  Empty, LoadingRows, Avatar, Stat, StatRow,
} from '@/ui';

/**
 * Binding a physical card to a student.
 *
 * Done at a desk with a stack of cards and a queue of students, so it works
 * the way that actually goes: pick the person, then read the card. The card
 * number is typed or scanned into one field and the field clears itself and
 * stays focused, because the next student is already standing there.
 *
 * Students who already have a card are shown but not offered, since binding a
 * second one silently orphans the first.
 */
export default function NfcRegister() {
  const t = useTheme();
  const { data: sections } = useClassSections();
  const classes = useMemo(
    () => ((sections as any[]) ?? []).map((s) => ({ value: s.id, label: s.name })),
    [sections],
  );

  const [classId, setClassId] = useState('');
  const active = classId || classes[0]?.value;
  const { data: students, isPending, refetch } = useClassStudentsNfc(active);
  const register = useRegisterNfcCard();

  const [selected, setSelected] = useState<string | null>(null);
  const [cardId, setCardId] = useState('');

  const rows = (students as any[]) ?? [];
  const without = rows.filter((s) => !s.nfcCardId);
  const withCard = rows.filter((s) => s.nfcCardId);
  const chosen = rows.find((s) => s.id === selected);

  const bind = () => {
    if (!selected || !cardId.trim()) return;
    register.mutate(
      { studentId: selected, nfcCardId: cardId.trim() },
      {
        onSuccess: () => {
          toast.success(`Card bound to ${chosen?.firstName ?? 'student'}`);
          setCardId('');
          setSelected(null);
          void refetch();
        },
        onError: (e: any) =>
          toast.error(e?.response?.data?.message ?? 'That card could not be bound. It may be in use.'),
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Bind a card' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        {classes.length ? <Segmented value={active} onChange={setClassId} options={classes} /> : null}

        {isPending ? (
          <LoadingRows count={8} lead />
        ) : !rows.length ? (
          <Empty title="No students" body="Pick a class with students in it." />
        ) : (
          <>
            <StatRow>
              <Stat value={withCard.length} label="Bound" tone="positive" />
              <Stat value={without.length} label="Waiting" tone={without.length ? 'caution' : 'primary'} />
            </StatRow>

            {selected ? (
              <Section title={`2. Read the card for ${chosen?.firstName ?? 'them'}`}>
                <View style={{ gap: space.md }}>
                  <Field
                    label="Card number"
                    value={cardId}
                    onChangeText={setCardId}
                    autoFocus
                    autoCapitalize="characters"
                    autoCorrect={false}
                    mono
                    placeholder="Tap the card on the reader, or type it"
                    onSubmitEditing={bind}
                    returnKeyType="done"
                    accessory={<Nfc size={18} color={t.fg.tertiary} strokeWidth={2} />}
                  />
                  <View style={{ flexDirection: 'row', gap: space.md }}>
                    <Button
                      label="Bind it"
                      kind="primary"
                      disabled={!cardId.trim()}
                      loading={register.isPending}
                      onPress={bind}
                    />
                    <Button label="Pick somebody else" kind="quiet" onPress={() => setSelected(null)} />
                  </View>
                </View>
              </Section>
            ) : null}

            {without.length ? (
              <Section title={selected ? 'Or pick another' : '1. Pick the student'}>
                <RowGroup>
                  {without.map((student, i) => {
                    const name = `${student.firstName} ${student.lastName}`.trim();
                    return (
                      <Row
                        key={student.id}
                        title={name}
                        subtitle={student.studentIdNumber}
                        lead={<Avatar name={name} size="sm" />}
                        value={selected === student.id ? <Badge label="Chosen" tone="brand" /> : undefined}
                        chevron={false}
                        onPress={() => {
                          setSelected(student.id);
                          setCardId('');
                        }}
                        last={i === without.length - 1}
                      />
                    );
                  })}
                </RowGroup>
              </Section>
            ) : (
              <Text variant="callout" tone="positive">
                Every student in this class has a card.
              </Text>
            )}

            {withCard.length ? (
              <Section title="Already bound">
                <RowGroup>
                  {withCard.map((student, i) => {
                    const name = `${student.firstName} ${student.lastName}`.trim();
                    return (
                      <Row
                        key={student.id}
                        title={name}
                        subtitle={student.nfcCardId ?? undefined}
                        lead={<Avatar name={name} size="sm" />}
                        chevron={false}
                        disabled
                        last={i === withCard.length - 1}
                      />
                    );
                  })}
                </RowGroup>
                <Text variant="footnote" tone="tertiary">
                  Binding a second card would orphan the first, so these are not offered here. Revoke
                  the old card from the ID cards screen first.
                </Text>
              </Section>
            ) : null}
          </>
        )}
      </Screen>
    </>
  );
}
