import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { toast } from 'sonner-native';

import { useAcademicYears, useTerms, useCloseTerm } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Badge, Button, Empty, LoadingRows, Fact } from '@/ui';

/**
 * Years and terms.
 *
 * The only action that belongs on a phone here is opening and closing a term,
 * and it is the highest consequence switch in the whole system: closing a term
 * stops every teacher in the school from entering marks. So it is a deliberate
 * two step, it says what will happen in plain words, and it is never the
 * primary button on the row.
 *
 * Creating years and terms stays on the web. It is a form with four dates that
 * has to be right, and it is done twice a year at a desk.
 */
export default function Years() {
  const t = useTheme();
  const { data: years, isPending } = useAcademicYears();
  const current = years?.find((y) => y.isCurrent);
  const { data: terms } = useTerms(current?.id);
  const close = useCloseTerm();
  const [confirming, setConfirming] = useState<string | null>(null);

  const toggle = (id: string, reopen: boolean) => {
    close.mutate(
      { id, reopen },
      {
        onSuccess: () => {
          toast.success(reopen ? 'Term reopened. Teachers can enter marks again.' : 'Term closed.');
          setConfirming(null);
        },
        onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not change that'),
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Years and terms' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        {isPending ? (
          <LoadingRows count={4} />
        ) : !years?.length ? (
          <Empty title="No years set up" body="An academic year has to exist on the web before anything else works." />
        ) : (
          <>
            <Section title="This year">
              <View>
                <Fact label="Year" value={current?.name ?? 'None marked current'} />
                <Fact
                  label="Runs"
                  value={
                    current
                      ? `${new Date(current.startDate).toLocaleDateString()} to ${new Date(
                          current.endDate,
                        ).toLocaleDateString()}`
                      : '-'
                  }
                  last
                />
              </View>
            </Section>

            <Section title="Terms">
              <RowGroup>
                {(terms ?? []).map((term, i, arr) => (
                  <Row
                    key={term.id}
                    title={term.name}
                    subtitle={`${new Date(term.startDate).toLocaleDateString()} to ${new Date(
                      term.endDate,
                    ).toLocaleDateString()}`}
                    value={
                      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                        {term.isCurrent ? <Badge label="Current" tone="brand" /> : null}
                        <Badge
                          label={term.isClosed ? 'Closed' : 'Open'}
                          tone={term.isClosed ? 'neutral' : 'positive'}
                        />
                      </View>
                    }
                    chevron={false}
                    onPress={() => setConfirming(confirming === term.id ? null : term.id)}
                    last={i === arr.length - 1}
                  />
                ))}
              </RowGroup>

              {confirming
                ? (() => {
                    const term = terms?.find((x) => x.id === confirming);
                    if (!term) return null;
                    return (
                      <View
                        style={{
                          gap: space.md,
                          padding: space.lg,
                          backgroundColor: t.bg.fill,
                          borderRadius: 12,
                        }}
                      >
                        <Text variant="bodyMedium">
                          {term.isClosed ? `Reopen ${term.name}?` : `Close ${term.name}?`}
                        </Text>
                        <Text variant="callout" tone="secondary">
                          {term.isClosed
                            ? 'Every teacher will be able to enter and change marks for this term again.'
                            : 'No teacher in the school will be able to enter or change marks for this term until it is reopened.'}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: space.md }}>
                          <Button
                            label={term.isClosed ? 'Reopen it' : 'Close it'}
                            kind={term.isClosed ? 'primary' : 'destructive'}
                            loading={close.isPending}
                            onPress={() => toggle(term.id, Boolean(term.isClosed))}
                          />
                          <Button label="Leave it" kind="quiet" onPress={() => setConfirming(null)} />
                        </View>
                      </View>
                    );
                  })()
                : null}
            </Section>

            <Section title="Earlier years">
              <RowGroup>
                {years
                  .filter((y) => !y.isCurrent)
                  .map((year, i, arr) => (
                    <Row key={year.id} title={year.name} chevron={false} last={i === arr.length - 1} />
                  ))}
                {years.filter((y) => !y.isCurrent).length === 0 ? (
                  <Row title="This is the first year on record" chevron={false} last />
                ) : null}
              </RowGroup>
            </Section>

            <Text variant="footnote" tone="tertiary">
              Creating years and terms stays on the web dashboard. It is a form of dates that has to be
              exactly right and it is done twice a year at a desk.
            </Text>
          </>
        )}
      </Screen>
    </>
  );
}
