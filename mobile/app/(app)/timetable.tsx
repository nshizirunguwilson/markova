import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';

import { useAuthStore } from '@/stores/auth-store';
import { useTeacherTimetable, useTimetable, useClassSections, useParentChildren } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Segmented, Empty, LoadingRows, Badge } from '@/ui';

/**
 * The week.
 *
 * A grid is the wrong shape for a phone. Seven columns of forty minute slots
 * on a 390 point screen gives you cells too small to read and too small to
 * tap, so this is a day at a time, opening on today.
 *
 * Lessons are listed with the gaps left out rather than drawn as empty rows.
 * A free period is not information a teacher needs a box for; what they need
 * is the next thing and where it is.
 */

const DAYS = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
];

export default function Timetable() {
  const t = useTheme();
  const role = useAuthStore((s) => s.user?.role);
  const teacherId = useAuthStore((s) => s.user?.teacherId);

  const isTeacher = role === 'TEACHER';
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
  const activeClass = classId || classes[0]?.value;

  const teacherWeek = useTeacherTimetable(isTeacher ? teacherId : undefined);
  const classWeek = useTimetable(!isTeacher ? activeClass : undefined);
  const source = isTeacher ? teacherWeek : classWeek;

  // JavaScript counts Sunday as 0 and the API counts Monday as 1.
  const jsDay = new Date().getDay();
  const todayValue = String(jsDay === 0 ? 1 : jsDay);
  const [day, setDay] = useState(DAYS.some((d) => d.value === todayValue) ? todayValue : '1');

  const lessons = useMemo(
    () =>
      (((source.data as any[]) ?? [])
        .filter((slot) => String(slot.dayOfWeek) === day)
        .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))),
    [source.data, day],
  );

  return (
    <>
      <Stack.Screen options={{ title: isTeacher ? 'Your week' : 'Timetable' }} />
      <Screen
        bleed
        onRefresh={source.refetch}
        refreshing={source.isRefetching}
        contentContainerStyle={{ paddingHorizontal: 0, gap: space.xl }}
      >
        <View style={{ paddingHorizontal: space.xl, gap: space.md }}>
          {!isTeacher && classes.length ? (
            <Segmented value={activeClass} onChange={setClassId} options={classes} />
          ) : null}
          <Segmented value={day} onChange={setDay} options={DAYS} />
        </View>

        {source.isPending ? (
          <LoadingRows count={5} />
        ) : !lessons.length ? (
          <Empty
            title="Nothing scheduled"
            body={
              day === todayValue
                ? 'No lessons on the timetable for today.'
                : 'No lessons on the timetable for that day.'
            }
          />
        ) : (
          <Section
            title={`${lessons.length} lesson${lessons.length === 1 ? '' : 's'}${
              day === todayValue ? ', today' : ''
            }`}
          >
            <RowGroup>
              {lessons.map((slot: any, i: number) => (
                <Row
                  key={slot.id}
                  title={slot.subject?.name ?? 'Subject'}
                  subtitle={[
                    isTeacher ? slot.classSection?.name : slot.teacher?.user
                      ? `${slot.teacher.user.firstName} ${slot.teacher.user.lastName}`
                      : null,
                    slot.room,
                  ]
                    .filter(Boolean)
                    .join('   ·   ')}
                  value={
                    <Text variant="callout" tone="secondary" numeric>
                      {slot.startTime}
                    </Text>
                  }
                  chevron={false}
                  last={i === lessons.length - 1}
                />
              ))}
            </RowGroup>
          </Section>
        )}
      </Screen>
    </>
  );
}
