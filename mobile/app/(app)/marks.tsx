import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';

import { useClassSections, useCurrentTerm, useMarksCompletion } from '@/hooks/useApi';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Segmented, Meter, Badge, Empty, LoadingRows, Stat, StatRow } from '@/ui';

/**
 * What is still missing.
 *
 * This is the screen that answers the only question worth asking before a term
 * closes: whose marks are we waiting on. It shows the gap rather than the
 * progress, so an incomplete row is what stands out, not a wall of green ticks
 * for the work already done.
 *
 * Fully entered subjects are collapsed to a single line at the bottom. They are
 * confirmation, not information.
 */
export default function MarksCompletion() {
  const { data: sections, isPending: sectionsPending } = useClassSections();
  const { data: term, isPending: termPending } = useCurrentTerm();
  const [classId, setClassId] = useState('');

  const classes = useMemo(
    () => ((sections as any[]) ?? []).map((s) => ({ value: s.id, label: s.name })),
    [sections],
  );
  const active = classId || classes[0]?.value;

  const { data, isPending, fetchStatus } = useMarksCompletion(active, term?.id);

  // The class list and the term both have to arrive before the gaps can even
  // be asked for. Reading isPending alone showed the empty state, then a
  // skeleton, then the answer, and a query still waiting on a term it has not
  // been given is pending forever.
  const loading =
    sectionsPending || termPending || (isPending && fetchStatus !== 'idle');

  const rows = (data as any[]) ?? [];
  const missing = rows.filter((r) => r.entered < r.expected);
  const done = rows.filter((r) => r.entered >= r.expected && r.expected > 0);
  const totalExpected = rows.reduce((s, r) => s + (r.expected ?? 0), 0);
  const totalEntered = rows.reduce((s, r) => s + (r.entered ?? 0), 0);

  return (
    <>
      <Stack.Screen options={{ title: 'Marks completion' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        {classes.length ? <Segmented value={active} onChange={setClassId} options={classes} /> : null}

        {loading ? (
          <LoadingRows count={6} />
        ) : !rows.length ? (
          <Empty
            title="Nothing to track yet"
            body="Once subjects and assessments exist for this class, the gaps show up here."
          />
        ) : (
          <>
            <View style={{ gap: space.lg }}>
              <StatRow>
                <Stat
                  value={missing.length}
                  label="Still open"
                  tone={missing.length ? 'caution' : 'positive'}
                />
                <Stat value={done.length} label="Complete" />
                <Stat
                  value={`${totalExpected ? Math.round((totalEntered / totalExpected) * 100) : 0}%`}
                  label="Of all marks"
                />
              </StatRow>
              <Meter
                value={totalEntered}
                max={totalExpected || 1}
                label={term?.name ?? 'This term'}
                tone={missing.length === 0 ? 'positive' : 'brand'}
                showValue={false}
              />
            </View>

            {missing.length ? (
              <Section title="Waiting on">
                <RowGroup>
                  {missing.map((row, i) => (
                    <Row
                      key={`${row.subjectId}-${row.assessmentTypeId}`}
                      title={row.subjectName}
                      subtitle={row.assessmentTypeName}
                      value={
                        <Badge
                          label={`${row.entered} of ${row.expected}`}
                          tone={row.entered === 0 ? 'critical' : 'caution'}
                          numeric
                        />
                      }
                      chevron={false}
                      last={i === missing.length - 1}
                    />
                  ))}
                </RowGroup>
              </Section>
            ) : (
              <Text variant="callout" tone="positive">
                Every subject and assessment for this class is fully entered.
              </Text>
            )}

            {done.length ? (
              <Text variant="footnote" tone="tertiary">
                {done.length} subject and assessment pair{done.length === 1 ? '' : 's'} already complete.
              </Text>
            ) : null}
          </>
        )}
      </Screen>
    </>
  );
}
