import { useMemo } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Check, Circle } from 'lucide-react-native';

import {
  useOnboardingStatus, useSchoolConfig, useAcademicYears, useClassLevels,
  useSubjects, useAssessmentTypes, usePeople, useAllAssignments,
} from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Meter, LoadingRows, Badge } from '@/ui';

/**
 * Setting a school up for the first time.
 *
 * The old version was an 814 line wizard that walked somebody through eight
 * forms in a fixed order and lost their place if they left. This is a
 * checklist instead, and the difference matters: setup happens over days, by
 * more than one person, in whatever order the information arrives.
 *
 * Nothing here stores progress. Each step is checked by asking whether the
 * thing exists, so a school that added subjects on the web sees that ticked
 * here without having told anybody. A wizard that tracks its own progress
 * separately from reality is a wizard that lies.
 */
export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();

  const { data: status } = useOnboardingStatus();
  const { data: config, isPending } = useSchoolConfig();
  const { data: years } = useAcademicYears();
  const { data: levels } = useClassLevels();
  const { data: subjects } = useSubjects();
  const { data: assessments } = useAssessmentTypes();
  const { data: teachers } = usePeople({ role: 'TEACHER' });
  const { data: students } = usePeople({ role: 'STUDENT' });
  // Every load in the school, not one teacher's: the scoped hook waits for a
  // teacher id and would sit disabled here, leaving this step never ticked.
  const { data: loads } = useAllAssignments();

  const steps = useMemo(
    () => [
      {
        label: 'Name the school',
        detail: config?.school_name ? config.school_name : 'Its name, motto and colour',
        done: Boolean(config?.school_name),
        href: '/(app)/school',
      },
      {
        label: 'Add the logo and stamp',
        detail: 'Printed on every report card',
        done: Boolean(config?.logo_url),
        href: '/(app)/school',
      },
      {
        label: 'Open an academic year',
        detail: years?.length ? `${years.length} on record` : 'With its terms',
        done: Boolean(years?.length),
        href: '/(app)/academics/years',
      },
      {
        label: 'Create the class levels',
        detail: levels?.length ? `${levels.length} levels` : 'Senior 1 to 3, or TVET levels',
        done: Boolean(levels?.length),
        href: '/(app)/academics/classes',
      },
      {
        label: 'Add the subjects',
        detail: subjects?.length ? `${subjects.length} subjects` : 'Core, elective and trade modules',
        done: Boolean(subjects?.length),
        href: '/(app)/academics/subjects',
      },
      {
        label: 'Set the assessment types',
        detail: assessments?.length ? `${assessments.length} types` : 'CAT 1, CAT 2, exam',
        done: Boolean(assessments?.length),
        href: '/(app)/academics/assessments',
      },
      {
        label: 'Add the teachers',
        detail: teachers?.total ? `${teachers.total} on staff` : 'They need accounts before they can teach',
        done: Boolean(teachers?.data?.length),
        href: '/(app)/people/new',
      },
      {
        label: 'Say who teaches what',
        detail: loads?.length ? `${loads.length} assignments` : 'Teacher, subject, class and year',
        done: Boolean(loads?.length),
        href: '/(app)/academics/loads',
      },
      {
        label: 'Enrol the students',
        detail: students?.total ? `${students.total} enrolled` : 'One at a time, or import a spreadsheet',
        done: Boolean(students?.data?.length),
        href: '/(app)/people/import',
      },
    ],
    [config, years, levels, subjects, assessments, teachers, students, loads],
  );

  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);

  if (isPending)
    return (
      <>
        <Stack.Screen options={{ title: 'Setup' }} />
        <Screen><LoadingRows count={8} /></Screen>
      </>
    );

  return (
    <>
      <Stack.Screen options={{ title: 'Setting up' }} />
      <Screen bleed contentContainerStyle={{ paddingHorizontal: 0, gap: space.xxl }}>
        <View style={{ paddingHorizontal: space.xl, gap: space.lg }}>
          <Text variant="title1">
            {done === steps.length ? 'The school is set up' : next ? next.label : 'Nearly there'}
          </Text>
          <Text variant="callout" tone="secondary">
            {done === steps.length
              ? 'Everything a term needs is in place. Teachers can enter marks and parents can be linked to their children.'
              : 'Setup happens over days and usually more than one person does it. Do these in any order.'}
          </Text>
          <Meter
            value={done}
            max={steps.length}
            label={`${done} of ${steps.length} done`}
            tone={done === steps.length ? 'positive' : 'brand'}
            showValue={false}
          />
        </View>

        <Section title="The checklist">
          <RowGroup>
            {steps.map((step, i) => (
              <Row
                key={step.label}
                title={step.label}
                subtitle={step.detail}
                lead={
                  step.done ? (
                    <Check size={20} color={t.status.positive.solid} strokeWidth={2.5} />
                  ) : (
                    <Circle size={20} color={t.fg.placeholder} strokeWidth={2} />
                  )
                }
                value={step === next ? <Badge label="Next" tone="brand" /> : undefined}
                onPress={() => router.push(step.href as never)}
                last={i === steps.length - 1}
              />
            ))}
          </RowGroup>
        </Section>

        <View style={{ paddingHorizontal: space.xl }}>
          <Text variant="footnote" tone="tertiary">
            Nothing here is stored as progress. Each line is checked by asking whether the thing
            actually exists, so work done on the web shows up here without anybody ticking it off.
            {status?.completed ? ' This school has been marked as set up.' : ''}
          </Text>
        </View>
      </Screen>
    </>
  );
}
