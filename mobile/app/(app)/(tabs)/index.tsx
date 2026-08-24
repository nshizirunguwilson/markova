import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuthStore } from '@/stores/auth-store';
import {
  useParentChildren,
  useAdminDashboard,
  useTeacherDashboardStats,
  useLibraryAnalytics,
  useOverdueLoans,
  useCurrentTerm,
  useNotifications,
  useChronicAbsentees,
  useClinicSummary,
  useUpcomingActivities,
} from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen,
  Section,
  Row,
  RowGroup,
  Text,
  Stat,
  StatRow,
  Avatar,
  Badge,
  LoadingRows,
  Meter,
} from '@/ui';

/**
 * Home.
 *
 * The previous dashboard opened with a coloured welcome card and then a grid
 * of solid tiles that were mostly navigation. Navigation already exists at the
 * bottom of the screen, so the tiles were decoration standing in for content.
 *
 * This one answers a question instead. Each role gets the thing they opened
 * the app to find out, stated in words at the top, then the two or three
 * figures that qualify it, then only the shortcuts that are genuinely faster
 * from here than from their own tab.
 *
 * There is no greeting card. A person knows their own name.
 */
export default function Home() {
  const role = useAuthStore((s) => s.user?.role);

  if (role === 'PARENT') return <ParentHome />;
  if (role === 'TEACHER') return <TeacherHome />;
  if (role === 'ADMIN') return <AdminHome />;
  if (role === 'LIBRARIAN') return <LibrarianHome />;
  if (role === 'PATRON' || role === 'MATRON' || role === 'NURSE')
    return <BoardingHome nurse={role === 'NURSE'} />;
  return <ParentHome />;
}

/** The sentence at the top of every home screen. */
function Headline({ lead, detail }: { lead: string; detail?: string }) {
  return (
    <View style={{ gap: space.xs, paddingHorizontal: space.xl, paddingTop: space.sm }}>
      <Text variant="title1">{lead}</Text>
      {detail ? (
        <Text variant="callout" tone="secondary">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Parent ─────────────────────────────────────────────

function ParentHome() {
  const router = useRouter();
  const { data: children, isPending, refetch, isRefetching } = useParentChildren();
  const { data: notifications } = useNotifications();

  const unread = notifications?.filter((n) => !n.isRead).length ?? 0;
  const first = (useAuthStore.getState().user?.firstName ?? '').trim();

  // A parent opens this to find out whether anything needs them. Say that
  // first, in words, before any number.
  const flagged = (children ?? []).filter((c: any) => (c.disciplinePoints ?? 100) < 90);
  const headline =
    flagged.length === 0
      ? 'Nothing needs you today'
      : flagged.length === 1
        ? 'One thing needs a look'
        : `${flagged.length} things need a look`;

  if (isPending)
    return (
      <Screen bleed>
        <LoadingRows count={3} lead />
      </Screen>
    );

  return (
    <Screen
      bleed
      onRefresh={refetch}
      refreshing={isRefetching}
      contentContainerStyle={{ paddingHorizontal: 0, gap: space.xxl }}
    >
      <Headline
        lead={headline}
        detail={first ? `Good to see you, ${first}.` : undefined}
      />

      <Section title={children?.length === 1 ? 'Your child' : 'Your children'}>
        <RowGroup>
          {(children ?? []).map((child: any, i: number) => {
            const name = `${child.user?.firstName ?? ''} ${child.user?.lastName ?? ''}`.trim();
            const points: number = child.disciplinePoints ?? 100;
            return (
              <Row
                key={child.id}
                title={name}
                subtitle={child.classSection?.name}
                lead={<Avatar name={name} photoUrl={child.user?.photoUrl} size="md" />}
                value={
                  points < 90 ? (
                    <Badge label={`${points} pts`} tone={points < 60 ? 'critical' : 'caution'} numeric />
                  ) : undefined
                }
                onPress={() => router.push(`/(app)/child/${child.id}`)}
                last={i === (children?.length ?? 0) - 1}
              />
            );
          })}
        </RowGroup>
      </Section>

      {unread > 0 ? (
        <Section title="Waiting for you">
          <RowGroup>
            <Row
              title={`${unread} unread alert${unread === 1 ? '' : 's'}`}
              onPress={() => router.push('/(app)/(tabs)/alerts')}
              last
            />
          </RowGroup>
        </Section>
      ) : null}
    </Screen>
  );
}

// ─── Teacher ────────────────────────────────────────────

function TeacherHome() {
  const router = useRouter();
  const teacherId = useAuthStore((s) => s.user?.teacherId);
  const { data: term } = useCurrentTerm();
  const { data: stats, isPending, refetch, isRefetching } = useTeacherDashboardStats(teacherId);

  // The API has no per-teacher "marks still owed" figure yet, so the stat
  // comes back as '--'. An unknown is not the same as a problem: saying
  // "some marks are still missing" on every single load would be a warning
  // nobody could ever clear, so the headline falls back to the day instead.
  const pending = stats?.pendingGrades ?? '--';
  const outstanding = /^\d+%?$/.test(pending) ? parseInt(pending, 10) : null;
  const lessons = stats?.classesToday ?? 0;

  const headline =
    outstanding === null
      ? lessons === 0
        ? 'No lessons today'
        : `${lessons} lesson${lessons === 1 ? '' : 's'} today`
      : outstanding === 0
        ? 'You are up to date'
        : 'Some marks are still missing';

  if (isPending)
    return (
      <Screen bleed>
        <LoadingRows count={4} />
      </Screen>
    );

  return (
    <Screen
      bleed
      onRefresh={refetch}
      refreshing={isRefetching}
      contentContainerStyle={{ paddingHorizontal: 0, gap: space.xxl }}
    >
      <Headline lead={headline} detail={term?.name} />

      <View style={{ paddingHorizontal: space.xl }}>
        <StatRow>
          <Stat value={stats?.classesToday ?? 0} label="Lessons today" />
          <Stat value={stats?.attendanceRate ?? '0%'} label="Attendance" tone="positive" />
          <Stat
            value={pending}
            label="Marks outstanding"
            tone={outstanding ? 'caution' : 'primary'}
          />
        </StatRow>
      </View>

      <Section title="Do now">
        <RowGroup>
          <Row
            title="Take the register"
            subtitle="Manual, QR, or a card tap"
            onPress={() => router.push('/(app)/(tabs)/attendance')}
          />
          <Row
            title="Enter marks"
            subtitle="Pick a class and an assessment"
            onPress={() => router.push('/(app)/marks-entry')}
          />
          <Row title="Set or grade homework" onPress={() => router.push('/(app)/homework-manage')} />
          <Row
            title="Record an incident"
            onPress={() => router.push('/(app)/discipline-log')}
            last
          />
        </RowGroup>
      </Section>

      <Section title="Today">
        <RowGroup>
          <Row title="Your timetable" onPress={() => router.push('/(app)/timetable')} />
          <Row title="Exam schedule" onPress={() => router.push('/(app)/exam-schedule')} last />
        </RowGroup>
      </Section>
    </Screen>
  );
}

// ─── Admin ──────────────────────────────────────────────

function AdminHome() {
  const router = useRouter();
  const { data: dash, isPending, refetch, isRefetching } = useAdminDashboard();
  const { data: term } = useCurrentTerm();
  const { data: chronic } = useChronicAbsentees();

  const d: any = dash ?? {};
  const chronicCount = chronic?.length ?? 0;

  // An admin opens this to find out what is going wrong. If nothing is, say so
  // plainly rather than filling the screen with healthy numbers.
  const headline =
    chronicCount > 0
      ? `${chronicCount} student${chronicCount === 1 ? '' : 's'} missing too much school`
      : 'The school is running normally';

  if (isPending)
    return (
      <Screen bleed>
        <LoadingRows count={5} />
      </Screen>
    );

  return (
    <Screen
      bleed
      onRefresh={refetch}
      refreshing={isRefetching}
      contentContainerStyle={{ paddingHorizontal: 0, gap: space.xxl }}
    >
      <Headline lead={headline} detail={term ? `${term.name}${term.isClosed ? ', closed for marks' : ''}` : undefined} />

      <View style={{ paddingHorizontal: space.xl, gap: space.xl }}>
        <StatRow>
          <Stat value={d.totalStudents ?? d.students ?? 0} label="Students" />
          <Stat value={d.totalTeachers ?? d.teachers ?? 0} label="Teachers" />
          <Stat value={d.totalClasses ?? d.classes ?? 0} label="Classes" />
        </StatRow>

        {typeof d.attendanceRate === 'number' ? (
          <Meter
            value={d.attendanceRate}
            label="Attendance across the school today"
            tone={d.attendanceRate >= 90 ? 'positive' : d.attendanceRate >= 75 ? 'caution' : 'critical'}
          />
        ) : null}
      </View>

      {chronicCount > 0 ? (
        <Section title="Needs a decision">
          <RowGroup>
            <Row
              title="Chronic absence"
              subtitle={`${chronicCount} student${chronicCount === 1 ? '' : 's'} past the threshold`}
              value={<Badge label={String(chronicCount)} tone="critical" numeric />}
              onPress={() => router.push('/(app)/(tabs)/attendance')}
              last
            />
          </RowGroup>
        </Section>
      ) : null}

      <Section title="Run the term">
        <RowGroup>
          <Row
            title="Report cards"
            subtitle="Calculate, comment, publish"
            onPress={() => router.push('/(app)/reports')}
          />
          <Row
            title="Marks completion"
            subtitle="What teachers still owe"
            onPress={() => router.push('/(app)/marks')}
          />
          <Row title="Discipline and appeals" onPress={() => router.push('/(app)/discipline-log')} />
          <Row title="Analytics" onPress={() => router.push('/(app)/analytics')} last />
        </RowGroup>
      </Section>
    </Screen>
  );
}

// ─── Librarian ──────────────────────────────────────────

function LibrarianHome() {
  const router = useRouter();
  const { data: stats, isPending, refetch, isRefetching } = useLibraryAnalytics();
  const { data: overdue } = useOverdueLoans();

  const overdueCount = overdue?.length ?? 0;
  const s: any = stats ?? {};

  const headline =
    overdueCount === 0
      ? 'Nothing is overdue'
      : `${overdueCount} book${overdueCount === 1 ? '' : 's'} overdue`;

  if (isPending)
    return (
      <Screen bleed>
        <LoadingRows count={4} />
      </Screen>
    );

  return (
    <Screen
      bleed
      onRefresh={refetch}
      refreshing={isRefetching}
      contentContainerStyle={{ paddingHorizontal: 0, gap: space.xxl }}
    >
      <Headline lead={headline} />

      <View style={{ paddingHorizontal: space.xl }}>
        <StatRow>
          <Stat value={s.totalBooks ?? s.books ?? 0} label="Titles" />
          <Stat value={s.activeLoans ?? 0} label="On loan" />
          <Stat
            value={overdueCount}
            label="Overdue"
            tone={overdueCount > 0 ? 'critical' : 'primary'}
          />
        </StatRow>
      </View>

      <Section title="At the desk">
        <RowGroup>
          <Row
            title="Check out or return"
            subtitle="Scan a book or search for it"
            onPress={() => router.push('/(app)/(tabs)/circulate')}
          />
          <Row title="The catalogue" onPress={() => router.push('/(app)/(tabs)/books')} last />
        </RowGroup>
      </Section>
    </Screen>
  );
}

/**
 * Home for the boarding staff and the nurse.
 *
 * The question a matron opens the app to answer at seven in the morning is not
 * a statistic. It is whether anybody is still lying in the sick bay, and
 * whether anything is happening today that she has to get children ready for.
 * So the headline is that, in words, and the rest is one tap away.
 *
 * A nurse sees the same screen without the money, because she holds none.
 */
function BoardingHome({ nurse }: { nurse: boolean }) {
  const router = useRouter();
  const { data: clinic, isPending, refetch, isRefetching } = useClinicSummary(30);
  const { data: activities } = useUpcomingActivities(5);

  const inSickBay = clinic?.inSickBay ?? 0;
  const headline =
    inSickBay === 0
      ? 'Nobody is in the sick bay'
      : `${inSickBay} student${inSickBay === 1 ? '' : 's'} in the sick bay`;

  // What is on today, which is what turns into "get them ready by six".
  const today = new Date().toDateString();
  const todays = (activities ?? []).filter(
    (a) => new Date(a.startsAt).toDateString() === today,
  );

  if (isPending)
    return (
      <Screen bleed>
        <LoadingRows count={4} />
      </Screen>
    );

  return (
    <Screen
      bleed
      onRefresh={refetch}
      refreshing={isRefetching}
      contentContainerStyle={{ paddingHorizontal: 0, gap: space.xxl }}
    >
      <Headline
        lead={headline}
        detail={
          todays.length > 0
            ? `${todays.length} thing${todays.length === 1 ? '' : 's'} on the calendar today`
            : undefined
        }
      />

      <View style={{ paddingHorizontal: space.xl }}>
        <StatRow>
          <Stat
            value={inSickBay}
            label="In the sick bay"
            tone={inSickBay > 0 ? 'caution' : 'primary'}
          />
          <Stat value={clinic?.visits ?? 0} label="Visits, 30 days" />
          <Stat
            value={clinic?.referred ?? 0}
            label="Sent to a clinic"
            tone={(clinic?.referred ?? 0) > 0 ? 'caution' : 'primary'}
          />
        </StatRow>
      </View>

      {/* A student in the sick bay three times in a month is telling the
          school something no single visit does. */}
      {(clinic?.repeatVisitors?.length ?? 0) > 0 && (
        <Section title="Keeps coming back">
          <RowGroup>
            {clinic!.repeatVisitors.map((s, i) => (
              <Row
                key={s.id}
                title={`${s.user.firstName} ${s.user.lastName}`}
                subtitle={`${s.visits} visits in the last month`}
                lead={<Avatar name={`${s.user.firstName} ${s.user.lastName}`} size="lg" />}
                chevron={false}
                last={i === clinic!.repeatVisitors.length - 1}
              />
            ))}
          </RowGroup>
        </Section>
      )}

      {todays.length > 0 && (
        <Section title="Today">
          <RowGroup>
            {todays.map((a, i) => (
              <Row
                key={a.id}
                title={a.title}
                subtitle={[
                  new Date(a.startsAt).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  a.location,
                ]
                  .filter(Boolean)
                  .join('   ·   ')}
                value={
                  a.requiresConsent ? <Badge label="Slips needed" tone="caution" /> : undefined
                }
                chevron={false}
                last={i === todays.length - 1}
              />
            ))}
          </RowGroup>
        </Section>
      )}

      <Section title="Your day">
        <RowGroup>
          <Row
            title="The sick bay"
            subtitle="Record a visit, give a dose, send somebody back"
            onPress={() => router.push('/(app)/(tabs)/clinic')}
          />
          {!nurse ? (
            <Row
              title="The money counter"
              subtitle="Scan a card and hand over pocket money"
              onPress={() => router.push('/(app)/(tabs)/money')}
            />
          ) : null}
          <Row
            title="Messages"
            subtitle="The office, the nurse and the class teachers"
            onPress={() => router.push('/(app)/(tabs)/messages')}
            last
          />
        </RowGroup>
      </Section>
    </Screen>
  );
}
