import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';

import { useClassLevels, useClassSections, useTrades } from '@/hooks/useApi';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Badge, Segmented, Empty, LoadingRows } from '@/ui';

/**
 * Levels, sections and trades.
 *
 * Grouped by level rather than listed flat, because the school is organised
 * that way in everybody's head: Senior 3 has an A and a B, Level 4 has one
 * section per trade. A flat list of forty section names sorted alphabetically
 * would be technically complete and impossible to read.
 *
 * O-Level and A-Level are separated because they behave differently. A-Level
 * sections carry a trade and O-Level ones do not, and mixing them makes the
 * empty trade column look like missing data.
 */
export default function Classes() {
  const { data: levels, isPending } = useClassLevels();
  const { data: sections } = useClassSections();
  const { data: trades } = useTrades();
  const [stage, setStage] = useState<'O_LEVEL' | 'A_LEVEL'>('O_LEVEL');

  const grouped = useMemo(() => {
    const relevant = (levels ?? []).filter((l) => l.stage === stage).sort((a, b) => a.order - b.order);
    return relevant.map((level) => ({
      level,
      sections: ((sections as any[]) ?? []).filter((s) => s.classLevelId === level.id),
    }));
  }, [levels, sections, stage]);

  return (
    <>
      <Stack.Screen options={{ title: 'Classes' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        <Segmented
          value={stage}
          onChange={(v) => setStage(v as never)}
          options={[
            { value: 'O_LEVEL', label: 'O-Level' },
            { value: 'A_LEVEL', label: 'A-Level, TVET' },
          ]}
        />

        {isPending ? (
          <LoadingRows count={6} />
        ) : !grouped.length ? (
          <Empty title="Nothing at this stage" body="No class levels have been created for it yet." />
        ) : (
          grouped.map(({ level, sections: rows }) => (
            <Section key={level.id} title={level.name}>
              <RowGroup>
                {rows.length ? (
                  rows.map((section: any, i: number) => (
                    <Row
                      key={section.id}
                      title={section.name}
                      subtitle={section.trade?.name}
                      value={
                        section.trade ? <Badge label={section.trade.code} tone="brand" /> : undefined
                      }
                      chevron={false}
                      last={i === rows.length - 1}
                    />
                  ))
                ) : (
                  <Row title="No sections yet" chevron={false} last />
                )}
              </RowGroup>
            </Section>
          ))
        )}

        {stage === 'A_LEVEL' && trades?.length ? (
          <Section title="Trades">
            <RowGroup>
              {trades.map((trade, i) => (
                <Row
                  key={trade.id}
                  title={trade.name}
                  subtitle={trade.sector}
                  value={<Badge label={trade.code} tone="neutral" />}
                  chevron={false}
                  last={i === trades.length - 1}
                />
              ))}
            </RowGroup>
          </Section>
        ) : null}

        <Text variant="footnote" tone="tertiary">
          Adding levels, sections and trades stays on the web dashboard.
        </Text>
      </Screen>
    </>
  );
}
