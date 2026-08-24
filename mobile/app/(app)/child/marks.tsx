import { useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { useStudentTermResult, useTerms, useAcademicYears, useCurrentTerm } from '@/hooks/useApi';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Segmented, Stat, StatRow, Empty, LoadingRows, Badge } from '@/ui';

/**
 * A child's marks, by subject, for one term.
 *
 * Nothing shows until the term is published. That is not a technical
 * limitation, it is the point of the publish step: a school signs results off
 * before parents act on them, and an app that leaked running averages would
 * quietly take that decision away from the school.
 *
 * Where marks do show, the subject leads and the grade sits right, because a
 * parent scans down the subject column looking for the one that worries them.
 */
export default function ChildMarks() {
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name?: string }>();

  const { data: years, isPending: yearsPending } = useAcademicYears();
  const currentYear = years?.find((y) => y.isCurrent);
  const { data: terms } = useTerms(currentYear?.id);
  const { data: current, isPending: termPending } = useCurrentTerm();

  const [termId, setTermId] = useState<string>('');
  const active = termId || current?.id || '';

  const { data: result, isPending, fetchStatus } = useStudentTermResult(studentId, active);

  // The year and the term both have to arrive before the result can even be
  // asked for. Reading isPending alone showed the empty state, then a
  // skeleton, then the answer, and a query still waiting on a term it has not
  // been given is pending forever.
  const loading =
    yearsPending || termPending || (isPending && fetchStatus !== 'idle');

  const r: any = result ?? {};
  const published = Boolean(r.isPublished);
  const subjects: any[] = r.subjects ?? [];

  return (
    <>
      <Stack.Screen options={{ title: name ? `${name}, marks` : 'Marks' }} />
      <Screen bleed contentContainerStyle={{ paddingHorizontal: 0, gap: space.xl }}>
        {terms?.length ? (
          <View style={{ paddingHorizontal: space.xl }}>
            <Segmented
              value={active}
              onChange={setTermId}
              options={terms.map((term) => ({ value: term.id, label: term.name }))}
            />
          </View>
        ) : null}

        {loading ? (
          <LoadingRows count={6} />
        ) : !published ? (
          <Empty
            title="Not published yet"
            body="The school publishes marks once every teacher has finished and the results have been checked. It will appear here the moment they do."
          />
        ) : (
          <>
            <View style={{ paddingHorizontal: space.xl }}>
              <StatRow>
                <Stat value={r.letterGrade ?? '-'} label="Overall" tone="brand" />
                <Stat value={r.average != null ? `${Math.round(r.average)}%` : '-'} label="Average" />
                {r.rank ? <Stat value={r.rank} label="Position in class" /> : null}
              </StatRow>
            </View>

            <Section title="By subject">
              <RowGroup>
                {subjects.length ? (
                  subjects.map((s: any, i: number) => (
                    <Row
                      key={s.subjectId ?? s.subjectName ?? i}
                      title={s.subjectName ?? s.name}
                      subtitle={s.remark}
                      value={
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                          <Text variant="callout" tone="secondary" numeric>
                            {s.total != null ? `${Math.round(s.total)}%` : '-'}
                          </Text>
                          <Badge label={s.letter ?? '-'} tone="neutral" />
                        </View>
                      }
                      chevron={false}
                      last={i === subjects.length - 1}
                    />
                  ))
                ) : (
                  <Row
                    title="No subject breakdown"
                    subtitle="The result exists but carries no per subject detail"
                    chevron={false}
                    last
                  />
                )}
              </RowGroup>
            </Section>

            {r.teacherComment ? (
              <Section title="What the teacher said">
                <View style={{ paddingHorizontal: space.xl }}>
                  <Text variant="body" tone="secondary" selectable>
                    {r.teacherComment}
                  </Text>
                </View>
              </Section>
            ) : null}

            {r.headmasterComment ? (
              <Section title="From the head teacher">
                <View style={{ paddingHorizontal: space.xl }}>
                  <Text variant="body" tone="secondary" selectable>
                    {r.headmasterComment}
                  </Text>
                </View>
              </Section>
            ) : null}
          </>
        )}
      </Screen>
    </>
  );
}
