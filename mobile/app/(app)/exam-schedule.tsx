import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';

import { useAuthStore } from '@/stores/auth-store';
import { useExamSchedule, useClassSections, useCurrentTerm, useParentChildren } from '@/hooks/useApi';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Segmented, Empty, LoadingRows, Badge } from '@/ui';

/**
 * When the exams are.
 *
 * Grouped by date and ordered forward, with anything already sat pushed to the
 * bottom. The countdown is the point of this screen: a parent or a student
 * opens it to find out how many days are left, not to browse a calendar, so
 * the next exam says "in 3 days" rather than making somebody work it out from
 * a date.
 */

const dayGap = (iso: string) => {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
};

const countdown = (days: number) => {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
};

export default function ExamSchedule() {
  const role = useAuthStore((s) => s.user?.role);
  const { data: term } = useCurrentTerm();
  const { data: sections } = useClassSections();
  const { data: children } = useParentChildren();

  const classes = useMemo(() => {
    if (role === 'PARENT') {
      return ((children as any[]) ?? [])
        .filter((c) => c.classSection)
        .map((c) => ({ value: c.classSection.id, label: c.user?.firstName ?? c.classSection.name }));
    }
    return ((sections as any[]) ?? []).map((s) => ({ value: s.id, label: s.name }));
  }, [role, sections, children]);

  const [classId, setClassId] = useState('');
  const active = classId || classes[0]?.value;
  const { data, isPending, refetch, isRefetching } = useExamSchedule(active, term?.id);

  const { upcoming, sat } = useMemo(() => {
    const all = ((data as any[]) ?? []).slice().sort((a, b) => String(a.examDate).localeCompare(String(b.examDate)));
    return {
      upcoming: all.filter((e) => dayGap(e.examDate) >= 0),
      sat: all.filter((e) => dayGap(e.examDate) < 0).reverse(),
    };
  }, [data]);

  const list = (items: any[], dim = false) => (
    <RowGroup>
      {items.map((exam, i) => {
        const days = dayGap(exam.examDate);
        return (
          <Row
            key={exam.id}
            title={exam.subject?.name ?? 'Subject'}
            subtitle={[
              new Date(exam.examDate).toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }),
              exam.startTime ? `${exam.startTime} to ${exam.endTime}` : null,
              exam.room,
            ]
              .filter(Boolean)
              .join('   ·   ')}
            value={
              dim ? undefined : (
                <Badge
                  label={countdown(days)}
                  tone={days === 0 ? 'critical' : days <= 3 ? 'caution' : 'neutral'}
                />
              )
            }
            chevron={false}
            last={i === items.length - 1}
          />
        );
      })}
    </RowGroup>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Exams' }} />
      <Screen
        bleed
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={{ paddingHorizontal: 0, gap: space.xxl }}
      >
        {classes.length ? (
          <View style={{ paddingHorizontal: space.xl }}>
            <Segmented value={active} onChange={setClassId} options={classes} />
          </View>
        ) : null}

        {isPending ? (
          <LoadingRows count={5} />
        ) : !data?.length ? (
          <Empty
            title="No exams scheduled"
            body={`Nothing has been put on the calendar for ${term?.name ?? 'this term'} yet.`}
          />
        ) : (
          <>
            {upcoming.length ? <Section title="Still to come">{list(upcoming)}</Section> : null}
            {sat.length ? <Section title="Already sat">{list(sat, true)}</Section> : null}
          </>
        )}
      </Screen>
    </>
  );
}
