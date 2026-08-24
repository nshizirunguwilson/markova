import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';

import { useAllAssignments } from '@/hooks/useApi';
import { useDebounce } from '@/hooks/useDebounce';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Field, Segmented, Empty, LoadingRows, Avatar, Badge } from '@/ui';

/**
 * Who teaches what.
 *
 * The same data can be read two ways and an admin needs both. Looking for gaps
 * you group by class, because the question is "does S3 A have a maths teacher".
 * Checking workload you group by teacher, because the question is "how much is
 * Aline carrying this year". So the grouping is a switch rather than a
 * decision made for them.
 *
 * A class with no teacher for a subject is called out rather than silently
 * absent, since an empty row is the thing this screen exists to find.
 */
export default function Loads() {
  const { data: assignments, isPending } = useAllAssignments();
  const [by, setBy] = useState<'class' | 'teacher'>('class');
  const [query, setQuery] = useState('');
  const search = useDebounce(query, 250).toLowerCase();

  const groups = useMemo(() => {
    type Item = { line: string; unassigned: boolean };
    type Group = { key: string; title: string; items: Item[] };
    const map = new Map<string, Group>();

    for (const a of ((assignments as any[]) ?? [])) {
      const section = a.classSection;
      const subject = a.subject;
      const teacher = a.teacher?.user;
      if (!section || !subject) continue;

      const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}`.trim() : 'Unassigned';

      const key = by === 'class' ? section.id : (a.teacherId ?? 'unassigned');
      const title = by === 'class' ? section.name : teacherName;
      const line = by === 'class' ? `${subject.name}  ·  ${teacherName}` : `${subject.name}  ·  ${section.name}`;

      const entry: Group = map.get(key) ?? { key, title, items: [] };
      // Carried rather than inferred from the line: a teacher actually named
      // Unassigned would otherwise be flagged as a gap.
      entry.items.push({ line, unassigned: !teacher });
      map.set(key, entry);
    }

    let out = [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
    if (search)
      out = out.filter(
        (g) =>
          g.title.toLowerCase().includes(search) ||
          g.items.some((i) => i.line.toLowerCase().includes(search)),
      );
    return out;
  }, [assignments, by, search]);

  return (
    <>
      <Stack.Screen options={{ title: 'Who teaches what' }} />
      <Screen contentContainerStyle={{ gap: space.xl }}>
        <Segmented
          value={by}
          onChange={(v) => setBy(v as never)}
          options={[
            { value: 'class', label: 'By class' },
            { value: 'teacher', label: 'By teacher' },
          ]}
        />

        <Field
          label="Search"
          value={query}
          onChangeText={setQuery}
          placeholder={by === 'class' ? 'A class or a subject' : 'A teacher or a subject'}
          autoCapitalize="none"
        />

        {isPending ? (
          <LoadingRows count={7} />
        ) : !groups.length ? (
          <Empty
            title={search ? 'Nothing matches' : 'No teaching loads set'}
            body={search ? undefined : 'Nobody has been assigned to a subject and class for this year yet.'}
          />
        ) : (
          groups.map((group) => (
            <Section key={group.key} title={group.title}>
              <RowGroup>
                {group.items.map((item, i) => (
                  <Row
                    key={item.line + i}
                    title={item.line.split('  ·  ')[0]}
                    subtitle={item.line.split('  ·  ')[1]}
                    lead={
                      by === 'teacher' ? undefined : (
                        <Avatar name={item.line.split('  ·  ')[1] ?? '?'} size="sm" />
                      )
                    }
                    value={
                      item.unassigned ? (
                        <Badge label="No teacher" tone="critical" />
                      ) : undefined
                    }
                    chevron={false}
                    last={i === group.items.length - 1}
                  />
                ))}
              </RowGroup>
            </Section>
          ))
        )}

        <Text variant="footnote" tone="tertiary">
          Assigning and removing loads stays on the web dashboard, where a whole year can be set up at
          once.
        </Text>
      </Screen>
    </>
  );
}
