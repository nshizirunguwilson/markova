import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  CalendarDays,
  TrendingUp,
  AlertTriangle,
  BookOpen,
  FileText,
  HeartPulse,
  Wallet,
  PartyPopper,
} from 'lucide-react-native';

import {
  useAttendanceSummary,
  useStudentDiscipline,
  useParentChildren,
  useCurrentTerm,
  useStudentTermResult,
} from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Stat, StatRow, Meter, Badge, Avatar } from '@/ui';
import { keptPrivate } from '@/lib/kept-private';

/**
 * One child at a glance, then a door into each part of their record.
 *
 * The three figures at the top are the three questions a parent actually opens
 * this app to answer: are they turning up, are they behaving, and how are they
 * doing. Everything below is a door rather than a summary, so the top of the
 * screen stays readable in the two seconds someone gives it.
 *
 * The grade is absent until the term is published. Showing a running average a
 * parent could act on before the school has signed it off would quietly
 * undermine the publish step, and that step exists for a reason.
 */
export default function ChildOverview() {
  const t = useTheme();
  const router = useRouter();
  const { studentId } = useLocalSearchParams<{ studentId: string }>();

  const { data: children } = useParentChildren();
  const child: any = children?.find((c: any) => c.id === studentId);
  const name = child
    ? `${child.user?.firstName ?? ''} ${child.user?.lastName ?? ''}`.trim()
    : 'Your child';

  const { data: term } = useCurrentTerm();
  const {
    data: attendance,
    refetch: refetchAttendance,
    isRefetching,
    error: attendanceError,
  } = useAttendanceSummary(studentId);
  /* An adult child may keep their attendance and conduct, or their results,
     from their parents (A8): those tiles say private rather than nought. */
  const conductKept = Boolean(keptPrivate(attendanceError));
  const { data: discipline, refetch: refetchDiscipline } = useStudentDiscipline(studentId);
  const { data: result, error: resultError } = useStudentTermResult(studentId, term?.id);
  const resultsKept = Boolean(keptPrivate(resultError));

  const rate = attendance?.attendanceRate ?? 0;
  const points: number = child?.disciplinePoints ?? 100;
  const incidents = discipline?.incidents?.length ?? 0;
  const published = Boolean((result as any)?.isPublished);

  const refresh = () => {
    void refetchAttendance();
    void refetchDiscipline();
  };

  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <Screen
        bleed
        onRefresh={refresh}
        refreshing={isRefetching}
        contentContainerStyle={{ paddingHorizontal: 0, gap: space.xxl }}
      >
        <View style={{ paddingHorizontal: space.xl, gap: space.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <Avatar name={name} photoUrl={child?.user?.photoUrl} size="xl" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="title2">{name}</Text>
              <Text variant="callout" tone="secondary">
                {child?.classSection?.name ?? 'Class not set'}
              </Text>
              {child?.studentIdNumber ? (
                <Text variant="code" tone="tertiary" selectable>
                  {child.studentIdNumber}
                </Text>
              ) : null}
            </View>
          </View>

          <StatRow>
            {conductKept ? (
              <>
                <Stat value="Private" label="Attendance" detail="Kept private" />
                <Stat value="Private" label="Conduct points" detail="Kept private" />
              </>
            ) : (
              <>
                <Stat
                  value={`${Math.round(rate)}%`}
                  label="Attendance"
                  detail={term?.name ?? 'This term'}
                  tone={rate >= 90 ? 'positive' : rate >= 75 ? 'caution' : 'critical'}
                />
                <Stat
                  value={points}
                  label="Conduct points"
                  detail={incidents === 0 ? 'Nothing on record' : `${incidents} incident${incidents === 1 ? '' : 's'}`}
                  tone={points >= 90 ? 'positive' : points >= 60 ? 'caution' : 'critical'}
                />
              </>
            )}
            {published ? (
              <Stat
                value={(result as any)?.letterGrade ?? '-'}
                label="Term grade"
                detail={(result as any)?.rank ? `Rank ${(result as any).rank} in class` : 'Published'}
                tone="brand"
              />
            ) : null}
          </StatRow>

          {conductKept ? null : (
            <Meter
              value={rate}
              label="Days present this term"
              tone={rate >= 90 ? 'positive' : rate >= 75 ? 'caution' : 'critical'}
            />
          )}
        </View>

        <Section title="Their record">
          <RowGroup>
            <Row
              title="Marks"
              subtitle={resultsKept ? 'Kept private' : published ? 'Published for this term' : 'Not published yet'}
              lead={<TrendingUp size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
              value={published || resultsKept ? undefined : <Badge label="Pending" tone="neutral" />}
              onPress={() => router.push({ pathname: '/(app)/child/marks', params: { studentId, name } })}
            />
            <Row
              title="Attendance"
              subtitle={conductKept ? 'Kept private' : `${Math.round(rate)}% this term`}
              lead={<CalendarDays size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
              onPress={() =>
                router.push({ pathname: '/(app)/child/attendance', params: { studentId, name } })
              }
            />
            <Row
              title="Discipline"
              subtitle={incidents === 0 ? 'Nothing on record' : `${incidents} recorded`}
              lead={<AlertTriangle size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
              value={incidents > 0 ? <Badge label={String(incidents)} tone="caution" numeric /> : undefined}
              onPress={() =>
                router.push({ pathname: '/(app)/child/discipline', params: { studentId, name } })
              }
            />
            <Row
              title="Homework"
              lead={<BookOpen size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
              onPress={() =>
                router.push({ pathname: '/(app)/child/homework', params: { studentId, name } })
              }
            />
            <Row
              title="Report card"
              subtitle={published ? 'Ready to read' : 'Available once the school publishes'}
              lead={<FileText size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
              disabled={!published}
              onPress={() =>
                router.push({ pathname: '/(app)/child/reports', params: { studentId, name } })
              }
              last
            />
          </RowGroup>
        </Section>

        {/*
          School life, as distinct from school work.

          Activities leads because it is the only one of the three that asks
          the parent for something: a permission slip nobody answered is why a
          child gets left at the gate.
        */}
        <Section title="School life">
          <RowGroup>
            <Row
              title="Activities"
              subtitle="Clubs, trips, and anything needing your permission"
              lead={<PartyPopper size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
              onPress={() =>
                router.push({ pathname: '/(app)/child/activities', params: { studentId, name } })
              }
            />
            <Row
              title="Health"
              subtitle="Every time the school has looked after them"
              lead={<HeartPulse size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
              onPress={() =>
                router.push({ pathname: '/(app)/child/health', params: { studentId, name } })
              }
            />
            <Row
              title="Pocket money"
              subtitle="What the school is holding, and where it has gone"
              lead={<Wallet size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
              onPress={() =>
                router.push({ pathname: '/(app)/child/money', params: { studentId, name } })
              }
              last
            />
          </RowGroup>
        </Section>
      </Screen>
    </>
  );
}
