import { useRouter } from 'expo-router';
import { View } from 'react-native';
import {
  CalendarRange,
  Layers,
  BookMarked,
  ListChecks,
  UserSquare,
  CalendarDays,
  CalendarClock,
  ClipboardList,
} from 'lucide-react-native';

import { useAcademicYears, useCurrentTerm, useClassLevels, useSubjects } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Badge, StatRow, Stat } from '@/ui';

/**
 * The structure of the school year, and the way into everything that shapes it.
 *
 * On the web this is six sidebar links. Here it is one place, because on a
 * phone the useful thing is not six destinations, it is knowing at a glance
 * which year and term are live and whether a term is still open for marks.
 * That state at the top answers the question an admin usually opened the app
 * to ask, and the list below is where they go if the answer was wrong.
 */
export default function Academics() {
  const t = useTheme();
  const router = useRouter();

  const { data: years, refetch, isRefetching } = useAcademicYears();
  const { data: term } = useCurrentTerm();
  const { data: levels } = useClassLevels();
  const { data: subjects } = useSubjects();

  const currentYear = years?.find((y) => y.isCurrent);

  return (
    <Screen
      bleed
      onRefresh={refetch}
      refreshing={isRefetching}
      contentContainerStyle={{ paddingHorizontal: 0, gap: space.xxl }}
    >
      <View style={{ paddingHorizontal: space.xl, gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text variant="title2">{currentYear?.name ?? 'No year set'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text variant="callout" tone="secondary">
              {term?.name ?? 'No current term'}
            </Text>
            {term ? (
              <Badge
                label={term.isClosed ? 'Closed for marks' : 'Open for marks'}
                tone={term.isClosed ? 'neutral' : 'positive'}
              />
            ) : null}
          </View>
        </View>

        <StatRow>
          <Stat value={levels?.length ?? 0} label="Class levels" />
          <Stat value={subjects?.length ?? 0} label="Subjects" />
          <Stat value={years?.length ?? 0} label="Years on record" />
        </StatRow>
      </View>

      <Section title="The frame">
        <RowGroup>
          <Row
            title="Years and terms"
            subtitle="Open or close a term for marks entry"
            lead={<CalendarRange size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
            onPress={() => router.push('/(app)/academics/years')}
          />
          <Row
            title="Classes"
            subtitle="Levels, sections and trades"
            lead={<Layers size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
            onPress={() => router.push('/(app)/academics/classes')}
          />
          <Row
            title="Subjects"
            subtitle="Core, elective, general and trade modules"
            lead={<BookMarked size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
            onPress={() => router.push('/(app)/academics/subjects')}
          />
          <Row
            title="Assessment types"
            subtitle="CAT 1, CAT 2, Practical, End of Term"
            lead={<ListChecks size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
            onPress={() => router.push('/(app)/academics/assessments')}
          />
          <Row
            title="Who teaches what"
            subtitle="Teacher, subject, class and year"
            lead={<UserSquare size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
            onPress={() => router.push('/(app)/academics/loads')}
            last
          />
        </RowGroup>
      </Section>

      <Section title="The calendar">
        <RowGroup>
          <Row
            title="Timetable"
            lead={<CalendarDays size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
            onPress={() => router.push('/(app)/timetable')}
          />
          <Row
            title="Exam schedule"
            lead={<CalendarClock size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
            onPress={() => router.push('/(app)/exam-schedule')}
          />
          <Row
            title="Marks completion"
            subtitle="What is still missing this term"
            lead={<ClipboardList size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
            onPress={() => router.push('/(app)/marks')}
            last
          />
        </RowGroup>
      </Section>
    </Screen>
  );
}
