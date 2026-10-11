import { useMemo } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { useAttendanceSummary, useCurrentTerm } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen, Section, Row, RowGroup, Text, Stat, StatRow, Meter, Badge,
  Empty, LoadingRows, statusTone, humanise,
} from '@/ui';
import { KeptPrivate } from '@/components/KeptPrivate';
import { keptPrivate } from '@/lib/kept-private';

/**
 * How often a child is actually in school.
 *
 * The rate leads, because that is the number a parent is judged on at a
 * meeting, but the reasons matter more than the percentage. A child at 84
 * percent who was signed off sick is a different conversation from a child at
 * 84 percent marked unexcused, so absences are listed with their reason rather
 * than collapsed into a single figure.
 *
 * Days present are counted rather than shown as a chart. Twelve absences is a
 * fact a parent can act on. A sparkline is not.
 */
export default function ChildAttendance() {
  const t = useTheme();
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name?: string }>();
  const { data: term } = useCurrentTerm();
  const { data, isPending, refetch, isRefetching, error } = useAttendanceSummary(studentId);
  // An adult child may keep their attendance from their parents (A8).
  const kept = keptPrivate(error);

  const s: any = data ?? {};
  const rate: number = s.attendanceRate ?? 0;
  const records: any[] = s.records ?? [];

  // Anything that is not being in the room counts as a day missed. Listing
  // only ABSENT and LATE hid the excused and sick days a school records
  // separately, which are exactly the ones with a reason worth reading.
  const away = useMemo(
    () => records.filter((r) => r.status && r.status !== 'PRESENT'),
    [records],
  );

  return (
    <>
      <Stack.Screen options={{ title: name ? `${name}, attendance` : 'Attendance' }} />
      <Screen
        bleed
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={{ paddingHorizontal: 0, gap: space.xxl }}
      >
        {isPending ? (
          <LoadingRows count={6} />
        ) : kept ? (
          <KeptPrivate message={kept} />
        ) : (
          <>
            <View style={{ paddingHorizontal: space.xl, gap: space.xl }}>
              <StatRow>
                <Stat
                  value={`${Math.round(rate)}%`}
                  label="Present"
                  detail={term?.name}
                  tone={rate >= 90 ? 'positive' : rate >= 75 ? 'caution' : 'critical'}
                />
                <Stat value={s.presentDays ?? s.present ?? 0} label="Days in" />
                <Stat
                  value={s.absentDays ?? s.absent ?? 0}
                  label="Days out"
                  tone={(s.absentDays ?? 0) > 0 ? 'caution' : 'primary'}
                />
              </StatRow>

              <Meter
                value={rate}
                label="This term"
                tone={rate >= 90 ? 'positive' : rate >= 75 ? 'caution' : 'critical'}
              />

              {rate < 75 ? (
                <Text variant="callout" tone="critical">
                  Below the level the school follows up on. Expect to hear from them, and talk to the
                  class teacher if something is going on.
                </Text>
              ) : null}
            </View>

            <Section title={away.length ? 'Every day missed' : 'Nothing missed'}>
              {away.length ? (
                <RowGroup>
                  {away.map((r, i) => (
                    <Row
                      key={r.id ?? `${r.date}-${i}`}
                      title={new Date(r.date).toLocaleDateString(undefined, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                      subtitle={r.reasonCategory ? humanise(r.reasonCategory) : 'No reason recorded'}
                      value={<Badge label={humanise(r.status)} tone={statusTone[r.status] ?? 'neutral'} />}
                      chevron={false}
                      last={i === away.length - 1}
                    />
                  ))}
                </RowGroup>
              ) : (
                <Empty title="A full attendance record" body="Not a single day missed this term." />
              )}
            </Section>
          </>
        )}
      </Screen>
    </>
  );
}
