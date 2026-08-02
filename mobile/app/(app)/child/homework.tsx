import { useMemo } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';

import { useStudentHomework } from '@/hooks/useApi';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Badge, Empty, LoadingRows, Text } from '@/ui';

/**
 * What has been set, and what was handed in.
 *
 * Split into what is still owed and what is finished, rather than one list
 * sorted by date, because those are two different questions and only the first
 * one is urgent. Overdue work is separated again from work that is merely due,
 * so a parent can see at a glance whether they need to say something tonight.
 */
export default function ChildHomework() {
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name?: string }>();
  const { data, isPending, refetch, isRefetching } = useStudentHomework(studentId);

  const { overdue, due, done } = useMemo(() => {
    const now = Date.now();
    const items: any[] = (data as any[]) ?? [];
    return {
      overdue: items.filter((h) => !h.submission && new Date(h.dueDate).getTime() < now),
      due: items.filter((h) => !h.submission && new Date(h.dueDate).getTime() >= now),
      done: items.filter((h) => h.submission),
    };
  }, [data]);

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  const list = (items: any[], showMark = false) => (
    <RowGroup>
      {items.map((h, i) => (
        <Row
          key={h.id}
          title={h.title}
          subtitle={`${h.subject?.name ?? 'Subject'}   ·   due ${when(h.dueDate)}`}
          value={
            showMark && h.submission?.marks != null ? (
              <Text variant="callout" tone="secondary" numeric>
                {h.submission.marks}
                {h.maxMarks ? ` / ${h.maxMarks}` : ''}
              </Text>
            ) : h.submission?.isLate ? (
              <Badge label="Late" tone="caution" />
            ) : showMark ? (
              <Badge label="Handed in" tone="positive" />
            ) : undefined
          }
          chevron={false}
          last={i === items.length - 1}
        />
      ))}
    </RowGroup>
  );

  return (
    <>
      <Stack.Screen options={{ title: name ? `${name}, homework` : 'Homework' }} />
      <Screen
        bleed
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={{ paddingHorizontal: 0, gap: space.xxl }}
      >
        {isPending ? (
          <LoadingRows count={6} />
        ) : !data?.length ? (
          <Empty title="Nothing set" body="No homework has been assigned to this class yet." />
        ) : (
          <>
            {overdue.length ? <Section title="Overdue">{list(overdue)}</Section> : null}
            {due.length ? <Section title="Still to do">{list(due)}</Section> : null}
            {done.length ? <Section title="Handed in">{list(done, true)}</Section> : null}
          </>
        )}
      </Screen>
    </>
  );
}
