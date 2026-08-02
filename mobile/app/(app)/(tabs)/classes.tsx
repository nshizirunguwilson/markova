import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Backpack } from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { useTeacherAssignments, useCurrentTerm } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Empty, LoadingRows, Failed, Text } from '@/ui';

/**
 * What a teacher teaches.
 *
 * The API returns one row per teacher, subject, class and year, so somebody
 * with three subjects across four classes gets twelve rows back. Listing all
 * twelve would be faithful to the data and useless to the person. They are
 * grouped by class here, because a teacher thinks in classes: they walk into
 * S3 A and teach whatever they teach there.
 */
export default function Classes() {
  const t = useTheme();
  const router = useRouter();
  const teacherId = useAuthStore((s) => s.user?.teacherId);
  const { data: term } = useCurrentTerm();
  const { data: assignments, isPending, isError, refetch, isRefetching } =
    useTeacherAssignments(teacherId);

  const byClass = useMemo(() => {
    type Group = { id: string; name: string; subjects: { id: string; name: string }[] };
    const map = new Map<string, Group>();
    for (const a of assignments ?? []) {
      const section: any = (a as any).classSection;
      const subject: any = (a as any).subject;
      if (!section) continue;
      const entry: Group = map.get(section.id) ?? { id: section.id, name: section.name, subjects: [] };
      if (subject && !entry.subjects.some((s) => s.id === subject.id)) {
        entry.subjects.push({ id: subject.id, name: subject.name });
      }
      map.set(section.id, entry);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments]);

  if (isPending)
    return (
      <Screen bleed>
        <LoadingRows count={4} />
      </Screen>
    );

  if (isError)
    return (
      <Screen>
        <Failed onRetry={refetch} />
      </Screen>
    );

  if (!byClass.length)
    return (
      <Screen>
        <Empty
          icon={<Backpack size={30} color={t.fg.placeholder} strokeWidth={1.6} />}
          title="No classes assigned"
          body="Once the office gives you a subject and a class for this year, they will show up here."
        />
      </Screen>
    );

  return (
    <Screen
      bleed
      onRefresh={refetch}
      refreshing={isRefetching}
      contentContainerStyle={{ paddingHorizontal: 0, gap: space.xxl }}
    >
      <Section
        title={term ? `${term.name}   ·   ${byClass.length} classes` : `${byClass.length} classes`}
      >
        <RowGroup>
          {byClass.map((section, i) => (
            <Row
              key={section.id}
              title={section.name}
              subtitle={section.subjects.map((s) => s.name).join(', ')}
              value={
                <Text variant="callout" tone="tertiary" numeric>
                  {section.subjects.length}
                </Text>
              }
              onPress={() =>
                router.push({
                  pathname: '/(app)/marks-entry',
                  params: { classSectionId: section.id, className: section.name },
                })
              }
              last={i === byClass.length - 1}
            />
          ))}
        </RowGroup>
      </Section>

      <Section title="For a class">
        <RowGroup>
          <Row
            title="Take the register"
            subtitle="Manual, QR, or a card tap"
            onPress={() => router.push('/(app)/(tabs)/attendance')}
          />
          <Row title="Set or grade homework" onPress={() => router.push('/(app)/homework-manage')} />
          <Row
            title="How the class is doing"
            onPress={() => router.push('/(app)/class-analytics')}
            last
          />
        </RowGroup>
      </Section>
    </Screen>
  );
}
