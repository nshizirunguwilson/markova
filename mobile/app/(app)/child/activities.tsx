import { useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { toast } from 'sonner-native';

import { useRecordConsent, useStudentActivities, type Activity } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen,
  Section,
  Row,
  RowGroup,
  Badge,
  Button,
  Empty,
  Field,
  LoadingRows,
  Failed,
  Text,
} from '@/ui';

/**
 * The permission slip, in a parent's pocket.
 *
 * This is the strongest reason activities belong on a phone at all. The slip
 * that goes home in a schoolbag is why an office spends the evening before a
 * trip on the telephone, and why a child is left standing at the gate in the
 * morning.
 *
 * Whatever still needs an answer comes first, and nothing else competes with
 * it.
 */

const KINDS: Record<Activity['kind'], string> = {
  CLUB: 'Club',
  SPORT: 'Sport',
  ASSEMBLY: 'Assembly',
  TRIP: 'Trip',
  VISITING_DAY: 'Visiting day',
  SCHOOL_EVENT: 'School event',
};

function whenLong(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChildActivities() {
  const t = useTheme();
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name?: string }>();
  const { data, isPending, isError, refetch, isRefetching } = useStudentActivities(studentId);
  const consent = useRecordConsent();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const all = data ?? [];
  const waiting = all.filter(
    (a) => a.requiresConsent && (!a.myPlace || a.myPlace.consent === 'PENDING'),
  );
  const rest = all.filter((a) => !waiting.includes(a));

  const answer = (activityId: string, value: 'GIVEN' | 'REFUSED') =>
    consent.mutate(
      {
        activityId,
        studentId,
        consent: value,
        note: notes[activityId]?.trim() || undefined,
      },
      {
        onSuccess: () =>
          toast.success(value === 'GIVEN' ? 'Permission given' : 'Recorded as not going'),
        onError: (e: any) =>
          toast.error(e?.response?.data?.message ?? 'Could not record that'),
      },
    );

  return (
    <>
      <Stack.Screen options={{ title: name ? `${name}, activities` : 'Activities' }} />
      <Screen
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={{ gap: space.xxl }}
      >
        {isPending ? (
          <LoadingRows count={4} />
        ) : isError ? (
          <Failed onRetry={refetch} />
        ) : all.length === 0 ? (
          <Empty
            icon={<CalendarDays size={30} color={t.fg.placeholder} strokeWidth={1.6} />}
            title="Nothing coming up"
            body="Clubs, matches and trips your child is concerned by will show here."
          />
        ) : (
          <>
            {waiting.length > 0 && (
              <Section title={`Waiting for your answer (${waiting.length})`}>
                {waiting.map((a) => (
                  <View
                    key={a.id}
                    style={{
                      backgroundColor: t.bg.surface,
                      borderRadius: 12,
                      padding: space.lg,
                      gap: space.md,
                      borderLeftWidth: 3,
                      borderLeftColor: t.status.caution.solid,
                    }}
                  >
                    <View style={{ gap: 4 }}>
                      <Text variant="body">{a.title}</Text>
                      <Text variant="caption" tone="tertiary">
                        {whenLong(a.startsAt)}
                        {a.location ? `   ·   ${a.location}` : ''}
                      </Text>
                      {a.description ? (
                        <Text variant="caption" tone="secondary">
                          {a.description}
                        </Text>
                      ) : null}
                    </View>

                    <Field
                      label="Anything the school should know"
                      value={notes[a.id] ?? ''}
                      onChangeText={(v) => setNotes((n) => ({ ...n, [a.id]: v }))}
                      placeholder="e.g. gets travel sick, please seat at the front"
                    />

                    <Button
                      label="I agree"
                      block
                      loading={consent.isPending}
                      onPress={() => answer(a.id, 'GIVEN')}
                    />
                    <Button
                      label="Not going"
                      kind="secondary"
                      block
                      onPress={() => answer(a.id, 'REFUSED')}
                    />
                  </View>
                ))}
              </Section>
            )}

            <Section title="Everything else">
              {rest.length === 0 ? (
                <Text variant="caption" tone="tertiary">
                  Nothing else on the calendar.
                </Text>
              ) : (
                <RowGroup>
                  {rest.map((a, i) => (
                    <Row
                      key={a.id}
                      title={a.title}
                      subtitle={[KINDS[a.kind], whenLong(a.startsAt), a.location]
                        .filter(Boolean)
                        .join('   ·   ')}
                      value={
                        a.isCancelled ? (
                          <Badge label="Called off" tone="critical" />
                        ) : a.requiresConsent ? (
                          <Badge
                            label={a.myPlace?.consent === 'GIVEN' ? 'You agreed' : 'You said no'}
                            tone={a.myPlace?.consent === 'GIVEN' ? 'positive' : 'critical'}
                          />
                        ) : undefined
                      }
                      chevron={false}
                      last={i === rest.length - 1}
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
