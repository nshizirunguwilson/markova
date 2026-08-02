import { useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { toast } from 'sonner-native';

import { useStudentDiscipline, useAcknowledgeIncident, useCreateAppeal } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen, Section, Text, Stat, StatRow, Meter, Badge, Button, Field,
  Empty, LoadingRows, Fact, statusTone, humanise,
} from '@/ui';

/**
 * A child's conduct record, and the parent's right to answer it.
 *
 * This is the most consequential screen a parent sees, so it is the one place
 * in the app where an action is deliberately made harder rather than easier.
 * Acknowledging is one tap, because that just says "I have seen this".
 * Appealing opens a field and asks for a reason in the parent's own words,
 * because an appeal that can be filed by accident is worth nothing to the
 * student who needs one.
 *
 * Incidents are never collapsed or hidden behind a count. If the school
 * recorded it, the parent reads it in full.
 */
export default function ChildDiscipline() {
  const t = useTheme();
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name?: string }>();
  const { data, isPending, refetch, isRefetching } = useStudentDiscipline(studentId);
  const acknowledge = useAcknowledgeIncident();
  const appeal = useCreateAppeal();

  const [appealing, setAppealing] = useState<string | null>(null);
  const [statement, setStatement] = useState('');

  const d: any = data ?? {};
  const incidents: any[] = d.incidents ?? [];
  const points: number = d.disciplinePoints ?? d.points ?? 100;

  const submitAppeal = (incidentId: string) => {
    if (statement.trim().length < 20) {
      toast.error('Say a little more so the school has something to consider');
      return;
    }
    appeal.mutate(
      { incidentId, statement: statement.trim() } as never,
      {
        onSuccess: () => {
          toast.success('Appeal sent. The school will review it.');
          setAppealing(null);
          setStatement('');
        },
        onError: () => toast.error('Could not send that appeal'),
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: name ? `${name}, conduct` : 'Conduct' }} />
      <Screen onRefresh={refetch} refreshing={isRefetching} contentContainerStyle={{ gap: space.xxl }}>
        {isPending ? (
          <LoadingRows count={4} />
        ) : (
          <>
            <View style={{ gap: space.lg }}>
              <StatRow>
                <Stat
                  value={points}
                  label="Conduct points"
                  detail="Everyone starts at 100"
                  tone={points >= 90 ? 'positive' : points >= 60 ? 'caution' : 'critical'}
                />
                <Stat value={incidents.length} label="On record" />
              </StatRow>
              <Meter
                value={points}
                label="Standing"
                tone={points >= 90 ? 'positive' : points >= 60 ? 'caution' : 'critical'}
              />
            </View>

            {!incidents.length ? (
              <Empty title="Nothing on record" body="No incidents have been recorded for this student." />
            ) : (
              <Section title="Incidents">
                <View style={{ gap: space.xxl }}>
                  {incidents.map((incident: any) => {
                    const open = appealing === incident.id;
                    const appealed = incident.appeals?.length > 0;
                    const latest = incident.appeals?.[0];

                    return (
                      <View key={incident.id} style={{ gap: space.md }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                          <Text variant="title3" style={{ flex: 1 }}>
                            {humanise(incident.actionTaken)}
                          </Text>
                          <Badge
                            label={`-${incident.pointsDeducted}`}
                            tone="critical"
                            numeric
                          />
                        </View>

                        <Text variant="body" tone="secondary" selectable>
                          {incident.description}
                        </Text>

                        <View>
                          <Fact
                            label="When"
                            value={new Date(incident.date).toLocaleDateString(undefined, {
                              day: 'numeric', month: 'long', year: 'numeric',
                            })}
                          />
                          {incident.location ? <Fact label="Where" value={incident.location} /> : null}
                          <Fact
                            label="Seen by you"
                            value={incident.parentAcknowledged ? 'Yes' : 'Not yet'}
                            last={!appealed}
                          />
                          {appealed ? (
                            <Fact
                              label="Appeal"
                              value={<Badge label={humanise(latest.status)} tone={statusTone[latest.status] ?? 'neutral'} />}
                              last
                            />
                          ) : null}
                        </View>

                        {open ? (
                          <View style={{ gap: space.md }}>
                            <Field
                              label="Why should this be reconsidered?"
                              hint="The school reads this in full. Say what happened from your side."
                              value={statement}
                              onChangeText={setStatement}
                              multiline
                              minHeight={120}
                            />
                            <View style={{ flexDirection: 'row', gap: space.md }}>
                              <Button
                                label="Send the appeal"
                                kind="primary"
                                loading={appeal.isPending}
                                onPress={() => submitAppeal(incident.id)}
                              />
                              <Button label="Cancel" kind="quiet" onPress={() => setAppealing(null)} />
                            </View>
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
                            {!incident.parentAcknowledged ? (
                              <Button
                                label="I have seen this"
                                kind="secondary"
                                onPress={() =>
                                  acknowledge.mutate(incident.id, {
                                    onSuccess: () => toast.success('Marked as seen'),
                                  })
                                }
                              />
                            ) : null}
                            {!appealed ? (
                              <Button label="Appeal this" kind="quiet" onPress={() => setAppealing(incident.id)} />
                            ) : null}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </Section>
            )}
          </>
        )}
      </Screen>
    </>
  );
}
