import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';

import { useAuthStore } from '@/stores/auth-store';
import { useTeacherAssignments, useTeacherClassAnalytics } from '@/hooks/useApi';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Stat, StatRow, Meter, Segmented, Empty, LoadingRows, Badge } from '@/ui';

/**
 * How a class is doing.
 *
 * The distribution matters more than the average here, because an average of
 * 62 hides both a class where everybody sits at 62 and a class split between
 * 85 and 40. Those need completely different responses from a teacher, so the
 * grade spread leads and the average follows it.
 *
 * The students who need attention are named. A statistic a teacher cannot act
 * on is a statistic that wastes their morning.
 */
export default function ClassAnalytics() {
  const teacherId = useAuthStore((s) => s.user?.teacherId);
  const { data: assignments } = useTeacherAssignments(teacherId);

  const classes = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments ?? []) {
      const section: any = (a as any).classSection;
      if (section) map.set(section.id, section.name);
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [assignments]);

  const [classId, setClassId] = useState('');
  const active = classId || classes[0]?.value;
  const { data, isPending } = useTeacherClassAnalytics(active);

  const d: any = data ?? {};
  const spread: any[] = d.gradeDistribution ?? d.distribution ?? [];
  const struggling: any[] = d.strugglingStudents ?? d.needsAttention ?? [];
  const totalGraded = spread.reduce((sum, g) => sum + (g.count ?? 0), 0);

  if (!classes.length)
    return (
      <>
        <Stack.Screen options={{ title: 'Class' }} />
        <Screen>
          <Empty title="No classes" body="Once you have a class assigned, its figures show up here." />
        </Screen>
      </>
    );

  return (
    <>
      <Stack.Screen options={{ title: 'How the class is doing' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        <Segmented value={active} onChange={setClassId} options={classes} />

        {isPending ? (
          <LoadingRows count={5} />
        ) : (
          <>
            <StatRow>
              <Stat value={d.studentCount ?? d.students ?? 0} label="Students" />
              <Stat
                value={d.classAverage != null ? `${Math.round(d.classAverage)}%` : '-'}
                label="Class average"
                tone={(d.classAverage ?? 0) >= 60 ? 'positive' : 'caution'}
              />
              <Stat
                value={d.attendanceRate != null ? `${Math.round(d.attendanceRate)}%` : '-'}
                label="Attendance"
              />
            </StatRow>

            {spread.length ? (
              <Section title="Where the class sits">
                <View style={{ gap: space.lg }}>
                  {spread.map((band: any) => (
                    <Meter
                      key={band.grade ?? band.letter ?? band.label}
                      value={band.count ?? 0}
                      max={totalGraded || 1}
                      label={`${band.grade ?? band.letter ?? band.label}   ·   ${band.count ?? 0} student${
                        (band.count ?? 0) === 1 ? '' : 's'
                      }`}
                      showValue={false}
                      tone={
                        ['A', 'B'].includes(band.grade ?? band.letter)
                          ? 'positive'
                          : ['F', 'S'].includes(band.grade ?? band.letter)
                            ? 'critical'
                            : 'brand'
                      }
                    />
                  ))}
                </View>
              </Section>
            ) : null}

            {struggling.length ? (
              <Section title="Worth a word">
                <RowGroup>
                  {struggling.map((s: any, i: number) => (
                    <Row
                      key={s.studentId ?? s.id ?? i}
                      title={s.studentName ?? s.name ?? 'Student'}
                      subtitle={s.reason ?? 'Below the class average'}
                      value={
                        s.average != null ? (
                          <Badge label={`${Math.round(s.average)}%`} tone="caution" numeric />
                        ) : undefined
                      }
                      chevron={false}
                      last={i === struggling.length - 1}
                    />
                  ))}
                </RowGroup>
              </Section>
            ) : (
              <Text variant="callout" tone="secondary">
                Nobody is far enough behind to flag right now.
              </Text>
            )}
          </>
        )}
      </Screen>
    </>
  );
}
