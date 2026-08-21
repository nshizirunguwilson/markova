import { useMemo, useState } from 'react';
import { Stack } from 'expo-router';

import { useSubjects } from '@/hooks/useApi';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Badge, Segmented, Empty, LoadingRows } from '@/ui';

/**
 * Subjects, grouped by scope.
 *
 * Scope is the thing that actually matters about a subject in this system,
 * because it decides which grading scale applies and how the term mark is
 * weighted. An O-Level elective is marked on a stricter scale than a core
 * subject, and a trade module carries a practical worth 30 percent that no
 * other subject has.
 *
 * So the grouping is by scope rather than alphabetical, and each group says
 * what its scope costs, which is the one thing somebody checking this screen
 * is usually trying to confirm.
 */

const SCOPES = [
  { value: 'O_CORE', label: 'O-Level core', note: 'CAT 20, CAT 20, exam 60. Standard scale.' },
  { value: 'O_ELECTIVE', label: 'O-Level elective', note: 'CAT 20, CAT 20, exam 60. Stricter scale: an A needs 80.' },
  { value: 'A_GENERAL', label: 'A-Level general', note: 'CAT 20, CAT 20, exam 60. Standard scale.' },
  { value: 'A_SPECIFIC', label: 'Trade modules', note: 'CAT 15, CAT 15, practical 30, exam 40.' },
];

export default function Subjects() {
  const { data, isPending } = useSubjects();
  const [scope, setScope] = useState('O_CORE');

  const rows = useMemo(
    () => ((data as any[]) ?? []).filter((s) => s.scope === scope),
    [data, scope],
  );
  const chosen = SCOPES.find((s) => s.value === scope)!;

  return (
    <>
      <Stack.Screen options={{ title: 'Subjects' }} />
      <Screen contentContainerStyle={{ gap: space.xl }}>
        <Segmented
          value={scope}
          onChange={setScope}
          options={SCOPES.map((s) => ({ value: s.value, label: s.label }))}
        />

        <Text variant="callout" tone="secondary">
          {chosen.note}
        </Text>

        {isPending ? (
          <LoadingRows count={8} />
        ) : !rows.length ? (
          <Empty title="Nothing in this scope" body="No subjects have been created with this scope yet." />
        ) : (
          <Section title={`${rows.length} subject${rows.length === 1 ? '' : 's'}`}>
            <RowGroup>
              {rows.map((subject: any, i: number) => (
                <Row
                  key={subject.id}
                  title={subject.name}
                  subtitle={[subject.trade?.name, subject.classLevel?.name].filter(Boolean).join('   ·   ')}
                  value={
                    !subject.isActive ? (
                      <Badge label="Off" tone="neutral" />
                    ) : subject.maxMarks !== 100 ? (
                      <Badge label={`/${subject.maxMarks}`} tone="neutral" numeric />
                    ) : undefined
                  }
                  chevron={false}
                  last={i === rows.length - 1}
                />
              ))}
            </RowGroup>
          </Section>
        )}

        <Text variant="footnote" tone="tertiary">
          Adding and editing subjects stays on the web dashboard.
        </Text>
      </Screen>
    </>
  );
}
