import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { toast } from 'sonner-native';
import { FileDown, Download } from 'lucide-react-native';

import { API_URL } from '@/constants/config';
import {
  useClassSections, useCurrentTerm, useClassTermResults,
  useCalculateTermResults, usePublishTermResults, useSaveResultComment,
} from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen, Section, Row, RowGroup, Text, Button, Badge, Segmented, Field,
  Empty, LoadingRows, Stat, StatRow, Avatar,
} from '@/ui';

/**
 * The moment the whole term waits behind.
 *
 * Three steps in order, and the screen refuses to let them happen out of
 * order: calculate, comment, publish. Publishing is what makes results visible
 * to every parent and student in the class at once, so it sits last, states
 * how many people it is about to notify, and is the only place in the app
 * where a primary button says what it will do rather than what it is called.
 *
 * Once published, the calculate button goes away. Recalculating a published
 * term would silently change grades a parent has already seen, and if that
 * genuinely needs doing it should be a deliberate act on the web, not a
 * mistap on a phone.
 */
export default function Reports() {
  const t = useTheme();
  const { data: sections, isPending: sectionsPending } = useClassSections();
  const { data: term, isPending: termPending } = useCurrentTerm();

  const classes = useMemo(
    () => ((sections as any[]) ?? []).map((s) => ({ value: s.id, label: s.name })),
    [sections],
  );
  const [classId, setClassId] = useState('');
  const active = classId || classes[0]?.value;

  const { data: results, isPending, fetchStatus } = useClassTermResults(active, term?.id);

  // The class list and the term both have to arrive before the results can
  // even be asked for. Reading isPending alone showed the empty state, then a
  // skeleton, then the answer, and a query still waiting on a term it has not
  // been given is pending forever.
  const loading =
    sectionsPending || termPending || (isPending && fetchStatus !== 'idle');
  const calculate = useCalculateTermResults();
  const publish = usePublishTermResults();
  const comment = useSaveResultComment();

  const [confirming, setConfirming] = useState(false);
  const [headNote, setHeadNote] = useState('');

  const rows = (results as any[]) ?? [];
  const published = rows.length > 0 && rows.every((r) => r.isPublished);
  const anyPublished = rows.some((r) => r.isPublished);
  const average = rows.length
    ? Math.round(rows.reduce((s, r) => s + (r.average ?? 0), 0) / rows.length)
    : 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Report cards' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        {classes.length ? <Segmented value={active} onChange={setClassId} options={classes} /> : null}

        {loading ? (
          <LoadingRows count={6} />
        ) : (
          <>
            <View style={{ gap: space.lg }}>
              <StatRow>
                <Stat value={rows.length} label="Results" />
                <Stat value={rows.length ? `${average}%` : '-'} label="Class average" />
                <Stat
                  value={published ? 'Yes' : 'No'}
                  label="Published"
                  tone={published ? 'positive' : 'caution'}
                />
              </StatRow>
              <Text variant="callout" tone="secondary">
                {term?.name ?? 'No current term'}
                {term?.isClosed ? ', closed for marks' : ''}
              </Text>
            </View>

            <Section title="1. Work out the results">
              {published ? (
                <Text variant="callout" tone="secondary">
                  Already calculated and published. Recalculating a published term would change grades
                  parents have already seen, so it is deliberately not offered here.
                </Text>
              ) : (
                <Button
                  label={rows.length ? 'Recalculate' : 'Calculate for this class'}
                  kind={rows.length ? 'secondary' : 'primary'}
                  block
                  loading={calculate.isPending}
                  onPress={() =>
                    calculate.mutate(
                      { classSectionId: active, termId: term?.id ?? '' },
                      {
                        onSuccess: () => toast.success('Results worked out'),
                        onError: (e: any) =>
                          toast.error(e?.response?.data?.message ?? 'Could not calculate those'),
                      },
                    )
                  }
                />
              )}
            </Section>

            {rows.length ? (
              <>
                <Section title="2. The head teacher's word">
                  <View style={{ gap: space.md }}>
                    <Field
                      label="Comment for the whole class"
                      hint="Applied to every card in this class. Leave it blank to skip."
                      value={headNote}
                      onChangeText={setHeadNote}
                      multiline
                      minHeight={100}
                    />
                    <Button
                      label="Save the comment"
                      kind="secondary"
                      disabled={!headNote.trim()}
                      loading={comment.isPending}
                      onPress={() => {
                        rows.forEach((r) =>
                          comment.mutate({ id: r.id, headmasterComment: headNote.trim() }),
                        );
                        toast.success('Comment added to every card');
                      }}
                    />
                  </View>
                </Section>

                <Section title="3. Publish">
                  {published ? (
                    <Text variant="callout" tone="positive">
                      Published. Every parent and student in this class can see their card.
                    </Text>
                  ) : confirming ? (
                    <View style={{ gap: space.md, padding: space.lg, backgroundColor: t.bg.fill, borderRadius: 12 }}>
                      <Text variant="bodyMedium">Publish {rows.length} report cards?</Text>
                      <Text variant="callout" tone="secondary">
                        Every parent and student in this class will be able to see their marks, their
                        grade and their position immediately. This is the point at which results
                        become real.
                      </Text>
                      <View style={{ flexDirection: 'row', gap: space.md }}>
                        <Button
                          label={`Publish ${rows.length} cards`}
                          kind="primary"
                          loading={publish.isPending}
                          onPress={() =>
                            publish.mutate(
                              { classSectionId: active, termId: term?.id ?? '' },
                              {
                                onSuccess: () => {
                                  toast.success('Published');
                                  setConfirming(false);
                                },
                                onError: (e: any) =>
                                  toast.error(e?.response?.data?.message ?? 'Could not publish'),
                              },
                            )
                          }
                        />
                        <Button label="Not yet" kind="quiet" onPress={() => setConfirming(false)} />
                      </View>
                    </View>
                  ) : (
                    <Button label="Publish this class" kind="primary" block onPress={() => setConfirming(true)} />
                  )}
                </Section>

                <Section title="The class">
                  <RowGroup>
                    {rows.map((r, i) => {
                      const name = `${r.student?.user?.firstName ?? ''} ${
                        r.student?.user?.lastName ?? ''
                      }`.trim();
                      return (
                        <Row
                          key={r.id}
                          title={name || 'Student'}
                          subtitle={r.rank ? `Position ${r.rank}` : undefined}
                          lead={<Avatar name={name || 'Student'} size="sm" />}
                          value={
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                              <Text variant="callout" tone="secondary" numeric>
                                {r.average != null ? `${Math.round(r.average)}%` : '-'}
                              </Text>
                              <Badge label={r.letterGrade ?? '-'} tone="neutral" />
                            </View>
                          }
                          chevron={false}
                          last={i === rows.length - 1}
                        />
                      );
                    })}
                  </RowGroup>
                </Section>

                <Section title="Print and export">
                  <View style={{ gap: space.md }}>
                    <Button
                      label="Open the class as one PDF"
                      kind="secondary"
                      block
                      icon={<FileDown size={18} color={t.fg.primary} strokeWidth={2} />}
                      onPress={() =>
                        WebBrowser.openBrowserAsync(
                          `${API_URL}/reports/term/class?classSectionId=${active}&termId=${term?.id}`,
                        )
                      }
                    />
                    <Button
                      label="Download everything as a ZIP"
                      kind="quiet"
                      icon={<Download size={18} color={t.brand.text} strokeWidth={2} />}
                      onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/reports/export/all`)}
                    />
                  </View>
                </Section>
              </>
            ) : (
              <Empty
                title="Nothing calculated yet"
                body="Work out the results for this class first, then you can comment on them and publish."
              />
            )}
          </>
        )}
      </Screen>
    </>
  );
}
