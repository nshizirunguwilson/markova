import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';

import { useAuthStore } from '@/stores/auth-store';
import {
  useAdminAnalytics, useParentChildren, useParentChildTrends,
  useAcademicYears, useCurrentTerm,
} from '@/hooks/useApi';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Stat, StatRow, Meter, Segmented, Empty, LoadingRows } from '@/ui';

/**
 * Analytics, read rather than configured.
 *
 * The web has eight admin views with filters and charts. A phone is a bad
 * place to interrogate data and a good place to be told a number, so this is
 * the reading version: the figures that would make somebody act, with the
 * comparison that gives them meaning, and no chart that needs pinching.
 *
 * Parents get their own child's trend instead, which is the only analytics
 * question a parent actually has.
 */
export default function Analytics() {
  const role = useAuthStore((s) => s.user?.role);
  if (role === 'PARENT') return <ParentTrends />;
  return <SchoolAnalytics />;
}

function SchoolAnalytics() {
  const [view, setView] = useState('dashboard');
  const { data: term } = useCurrentTerm();
  const { data, isPending } = useAdminAnalytics(view, { termId: term?.id });

  const d: any = data ?? {};

  return (
    <>
      <Stack.Screen options={{ title: 'Analytics' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'dashboard', label: 'Overview' },
            { value: 'attendance', label: 'Attendance' },
            { value: 'grade-distribution', label: 'Grades' },
            { value: 'discipline', label: 'Discipline' },
            { value: 'enrollment', label: 'Enrolment' },
            { value: 'library', label: 'Library' },
          ]}
        />

        {isPending ? (
          <LoadingRows count={5} />
        ) : (
          <View style={{ gap: space.xxl }}>
            <StatRow>
              {Object.entries(d)
                .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
                .slice(0, 6)
                .map(([key, value]) => (
                  <Stat
                    key={key}
                    value={typeof value === 'number' ? Math.round(value as number) : String(value)}
                    label={key
                      .replace(/([A-Z])/g, ' $1')
                      .replace(/^./, (c) => c.toUpperCase())
                      .trim()}
                  />
                ))}
            </StatRow>

            {Object.entries(d)
              .filter(([, v]) => Array.isArray(v) && (v as any[]).length)
              .map(([key, rows]) => (
                <Section
                  key={key}
                  title={key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()}
                >
                  <RowGroup>
                    {(rows as any[]).slice(0, 25).map((row, i, arr) => {
                      const label =
                        row.name ?? row.label ?? row.className ?? row.subject ?? row.title ?? row.grade ?? '-';
                      const figure =
                        row.value ?? row.count ?? row.total ?? row.rate ?? row.average ?? row.students;
                      return (
                        <Row
                          key={`${label}-${i}`}
                          title={String(label)}
                          value={typeof figure === 'number' ? Math.round(figure) : figure ? String(figure) : undefined}
                          chevron={false}
                          last={i === Math.min(arr.length, 25) - 1}
                        />
                      );
                    })}
                  </RowGroup>
                </Section>
              ))}

            {!Object.keys(d).length ? (
              <Empty title="Nothing to show yet" body="This view needs data that has not been recorded yet." />
            ) : null}
          </View>
        )}
      </Screen>
    </>
  );
}

function ParentTrends() {
  const { data: children } = useParentChildren();
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y) => y.isCurrent);

  const [childId, setChildId] = useState('');
  const active = childId || (children as any[])?.[0]?.id || '';
  const { data, isPending } = useParentChildTrends(active, currentYear?.id);

  const d: any = data ?? {};
  const terms: any[] = d.terms ?? d.trend ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'How they are doing' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        {(children as any[])?.length > 1 ? (
          <Segmented
            value={active}
            onChange={setChildId}
            options={(children as any[]).map((c) => ({
              value: c.id,
              label: c.user?.firstName ?? 'Child',
            }))}
          />
        ) : null}

        {isPending ? (
          <LoadingRows count={4} />
        ) : !terms.length ? (
          <Empty
            title="Not enough history yet"
            body="Once a term has been published, the change from one term to the next shows up here."
          />
        ) : (
          <Section title={currentYear?.name ?? 'This year'}>
            <View style={{ gap: space.xl }}>
              {terms.map((row: any) => (
                <Meter
                  key={row.termId ?? row.term ?? row.name}
                  value={row.average ?? 0}
                  label={row.termName ?? row.term ?? row.name}
                  tone={
                    (row.average ?? 0) >= 70 ? 'positive' : (row.average ?? 0) >= 50 ? 'caution' : 'critical'
                  }
                />
              ))}
            </View>
          </Section>
        )}

        <Text variant="footnote" tone="tertiary">
          Only published terms are counted here.
        </Text>
      </Screen>
    </>
  );
}
