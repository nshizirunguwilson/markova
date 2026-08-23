import { useState } from 'react';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { toast } from 'sonner-native';

import api from '@/lib/api';
import { useUpcomingActivities, type Activity } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Screen,
  Section,
  Row,
  RowGroup,
  Avatar,
  Badge,
  Button,
  Empty,
  LoadingRows,
  Failed,
  Stat,
  StatRow,
  Text,
} from '@/ui';

/**
 * The school calendar, and the register that goes with it.
 *
 * A club that never takes a register quietly stops existing, and taking one on
 * paper in a classroom at four in the afternoon means it reaches the office
 * some time next week, if at all. This is the version that gets used, because
 * the phone is already in the teacher's hand.
 */

const KINDS: Record<Activity['kind'], string> = {
  CLUB: 'Club',
  SPORT: 'Sport',
  ASSEMBLY: 'Assembly',
  TRIP: 'Trip',
  VISITING_DAY: 'Visiting day',
  SCHOOL_EVENT: 'School event',
};

function when(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Activities() {
  const t = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const { data, isPending, isError, refetch, isRefetching } = useUpcomingActivities(25);

  if (open) return <ActivityDetail id={open} onBack={() => setOpen(null)} />;

  if (isPending)
    return (
      <>
        <Stack.Screen options={{ title: 'Activities' }} />
        <Screen bleed>
          <LoadingRows count={5} lead />
        </Screen>
      </>
    );

  if (isError)
    return (
      <>
        <Stack.Screen options={{ title: 'Activities' }} />
        <Screen>
          <Failed onRetry={refetch} />
        </Screen>
      </>
    );

  const items = data ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'Activities' }} />
      <Screen
        bleed
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={{ paddingHorizontal: 0, gap: space.xxl }}
      >
        {items.length === 0 ? (
          <Empty
            icon={<CalendarDays size={30} color={t.fg.placeholder} strokeWidth={1.6} />}
            title="Nothing on the calendar"
            body="Clubs, matches, assemblies and trips appear here once the office puts them on."
          />
        ) : (
          <Section title="Coming up">
            <RowGroup>
              {items.map((a, i) => (
                <Row
                  key={a.id}
                  title={a.title}
                  subtitle={[KINDS[a.kind], when(a.startsAt), a.location]
                    .filter(Boolean)
                    .join('   ·   ')}
                  value={
                    a.isCancelled ? (
                      <Badge label="Called off" tone="critical" />
                    ) : a.requiresConsent ? (
                      <Badge label="Slips needed" tone="caution" />
                    ) : a.tracksAttendance ? (
                      <Badge label="Register" tone="neutral" />
                    ) : undefined
                  }
                  onPress={() => setOpen(a.id)}
                  last={i === items.length - 1}
                />
              ))}
            </RowGroup>
          </Section>
        )}
      </Screen>
    </>
  );
}

/**
 * One activity: who is on the list, who has answered, and the register.
 *
 * The three consent counts sit at the top because the day before a trip, "who
 * has not answered" is the only question anybody is actually asking.
 */
function ActivityDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();

  const { data: activity, isPending } = useQuery<any>({
    queryKey: ['activity', id],
    queryFn: () => api.get(`/activities/${id}`).then((r) => r.data),
  });

  const { data: consent } = useQuery<any>({
    queryKey: ['activity-consent', id],
    queryFn: () => api.get(`/activities/${id}/consent`).then((r) => r.data),
    enabled: !!activity?.requiresConsent,
  });

  const register = useMutation({
    mutationFn: (records: { studentId: string; attended: boolean }[]) =>
      api.post(`/activities/${id}/attendance`, { records }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activity', id] });
      toast.success('Register taken');
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Could not take the register'),
  });

  if (isPending)
    return (
      <Screen bleed>
        <LoadingRows count={5} lead />
      </Screen>
    );

  const participants: any[] = activity?.participants ?? [];

  return (
    <>
      <Stack.Screen options={{ title: activity?.title ?? 'Activity' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        <Button label="Back to the calendar" kind="quiet" onPress={onBack} />

        <Section title={activity?.title ?? ''}>
          <Text variant="caption" tone="tertiary">
            {[KINDS[activity?.kind as Activity['kind']], when(activity?.startsAt), activity?.location]
              .filter(Boolean)
              .join('   ·   ')}
          </Text>
          {activity?.description ? (
            <Text variant="body">{activity.description}</Text>
          ) : null}

          {activity?.requiresConsent && consent ? (
            <StatRow>
              <Stat value={consent.given.length} label="Agreed" tone="positive" />
              <Stat value={consent.refused.length} label="Refused" tone="critical" />
              <Stat
                value={consent.pending.length}
                label="Not answered"
                tone={consent.pending.length > 0 ? 'caution' : 'primary'}
              />
            </StatRow>
          ) : null}
        </Section>

        <Section title={`On the list (${participants.length})`}>
          {participants.length === 0 ? (
            <Text variant="caption" tone="tertiary">
              Nobody has signed up yet.
            </Text>
          ) : (
            <RowGroup>
              {participants.map((p, i) => {
                const name = `${p.student.user.firstName} ${p.student.user.lastName}`;
                return (
                  <Row
                    key={p.id}
                    title={name}
                    subtitle={p.student.studentIdNumber}
                    lead={<Avatar name={name} photoUrl={p.student.user.photoUrl} size="lg" />}
                    value={
                      <View style={{ flexDirection: 'row', gap: space.sm }}>
                        {activity?.requiresConsent ? (
                          <Badge
                            label={
                              p.consent === 'GIVEN'
                                ? 'Agreed'
                                : p.consent === 'REFUSED'
                                  ? 'No'
                                  : 'Waiting'
                            }
                            tone={
                              p.consent === 'GIVEN'
                                ? 'positive'
                                : p.consent === 'REFUSED'
                                  ? 'critical'
                                  : 'caution'
                            }
                          />
                        ) : null}
                        {activity?.tracksAttendance ? (
                          <Badge
                            label={p.attended ? 'Came' : 'Mark'}
                            tone={p.attended ? 'positive' : 'neutral'}
                          />
                        ) : null}
                      </View>
                    }
                    onPress={
                      activity?.tracksAttendance
                        ? () =>
                            register.mutate([
                              { studentId: p.student.id, attended: !p.attended },
                            ])
                        : undefined
                    }
                    chevron={false}
                    last={i === participants.length - 1}
                  />
                );
              })}
            </RowGroup>
          )}
          {activity?.tracksAttendance ? (
            <Text variant="caption" tone="tertiary">
              Tap a name to mark them present or take the mark off again.
            </Text>
          ) : null}
        </Section>
      </Screen>
    </>
  );
}
