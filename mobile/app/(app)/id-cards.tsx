import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { toast } from 'sonner-native';
import { CreditCard, Nfc } from 'lucide-react-native';

import { useClassSections, useIdCardRegistry, useIssueIdCard, useRevokeIdCard } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen, Section, Row, RowGroup, Text, Button, Badge, Segmented,
  Empty, LoadingRows, Stat, StatRow, Avatar,
} from '@/ui';

/**
 * Who has a card and who does not.
 *
 * Issuing is the easy half and the screen leads with the hard half: the list of
 * students without one, because that is the list somebody is working through.
 * Students who already have a card are behind a toggle, since they are only
 * looked at when one needs revoking.
 *
 * Revoking is destructive in a way issuing is not. A revoked card stops opening
 * the gate that afternoon, so it asks first.
 */
export default function IdCards() {
  const t = useTheme();
  const router = useRouter();
  const { data: sections } = useClassSections();
  const classes = useMemo(
    () => ((sections as any[]) ?? []).map((s) => ({ value: s.id, label: s.name })),
    [sections],
  );

  const [classId, setClassId] = useState('');
  const active = classId || classes[0]?.value;
  const { data, isPending } = useIdCardRegistry({ classSectionId: active });
  const issue = useIssueIdCard();
  const revoke = useRevokeIdCard();

  const [showIssued, setShowIssued] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const rows: any[] = Array.isArray(data) ? data : ((data as any)?.students ?? (data as any)?.rows ?? []);
  const without = rows.filter((r) => !r.nfcCardId);
  const withCard = rows.filter((r) => r.nfcCardId);

  return (
    <>
      <Stack.Screen options={{ title: 'ID cards' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        {classes.length ? <Segmented value={active} onChange={setClassId} options={classes} /> : null}

        {isPending ? (
          <LoadingRows count={8} lead />
        ) : !rows.length ? (
          <Empty title="No students" body="Pick a class with students in it." />
        ) : (
          <>
            <StatRow>
              <Stat value={withCard.length} label="Have a card" tone="positive" />
              <Stat
                value={without.length}
                label="Still waiting"
                tone={without.length ? 'caution' : 'primary'}
              />
            </StatRow>

            {without.length ? (
              <>
                <Button
                  label={`Issue ${without.length} card${without.length === 1 ? '' : 's'} for this class`}
                  kind="primary"
                  block
                  icon={<CreditCard size={18} color={t.brand.onSolid} strokeWidth={2} />}
                  loading={issue.isPending}
                  onPress={() =>
                    issue.mutate(
                      { classSectionId: active },
                      {
                        onSuccess: () => toast.success('Cards issued'),
                        onError: () => toast.error('Could not issue those'),
                      },
                    )
                  }
                />

                <Section title="Without a card">
                  <RowGroup>
                    {without.map((row, i) => (
                      <Row
                        key={row.studentId ?? row.id}
                        title={row.studentName ?? row.name ?? 'Student'}
                        subtitle={row.studentIdNumber}
                        lead={<Avatar name={row.studentName ?? row.name ?? '?'} size="sm" />}
                        value={
                          <Text
                            variant="subhead"
                            tone="brand"
                            suppressHighlighting
                            onPress={() =>
                              issue.mutate(
                                { studentId: row.studentId ?? row.id },
                                { onSuccess: () => toast.success('Card issued') },
                              )
                            }
                          >
                            Issue
                          </Text>
                        }
                        chevron={false}
                        last={i === without.length - 1}
                      />
                    ))}
                  </RowGroup>
                </Section>
              </>
            ) : (
              <Text variant="callout" tone="positive">
                Everybody in this class has a card.
              </Text>
            )}

            <Section
              title="Already issued"
              action={
                <Text
                  variant="subhead"
                  tone="brand"
                  suppressHighlighting
                  onPress={() => setShowIssued((v) => !v)}
                >
                  {showIssued ? 'Hide' : `Show ${withCard.length}`}
                </Text>
              }
            >
              {showIssued ? (
                <RowGroup>
                  {withCard.map((row, i) => {
                    const id = row.studentId ?? row.id;
                    const confirming = revoking === id;
                    return (
                      <Row
                        key={id}
                        title={row.studentName ?? row.name ?? 'Student'}
                        subtitle={row.nfcCardId}
                        lead={<Avatar name={row.studentName ?? row.name ?? '?'} size="sm" />}
                        value={
                          confirming ? (
                            <Text
                              variant="subhead"
                              tone="critical"
                              suppressHighlighting
                              onPress={() =>
                                revoke.mutate(id, {
                                  onSuccess: () => {
                                    toast.success('Card revoked');
                                    setRevoking(null);
                                  },
                                })
                              }
                            >
                              Really revoke
                            </Text>
                          ) : (
                            <Text
                              variant="subhead"
                              tone="tertiary"
                              suppressHighlighting
                              onPress={() => setRevoking(id)}
                            >
                              Revoke
                            </Text>
                          )
                        }
                        chevron={false}
                        last={i === withCard.length - 1}
                      />
                    );
                  })}
                </RowGroup>
              ) : null}
            </Section>

            <Button
              label="Bind a physical card"
              kind="secondary"
              icon={<Nfc size={18} color={t.fg.primary} strokeWidth={2} />}
              onPress={() => router.push('/(app)/nfc-register')}
            />
          </>
        )}
      </Screen>
    </>
  );
}
