import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { toast } from 'sonner-native';

import {
  useClassSections, useAcademicYears, usePromotionPreview, useCommitPromotion,
} from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen, Section, Row, RowGroup, Text, Button, Badge, Segmented,
  Empty, LoadingRows, Stat, StatRow, Avatar,
} from '@/ui';

/**
 * End of year, reviewed rather than configured.
 *
 * On the web an admin sets the thresholds, reads a table of every student and
 * commits. That table is unreadable on a phone and the thresholds are a
 * settings problem, so this screen does the half that suits a phone: it shows
 * the recommendation the server worked out, lets a human disagree with any
 * individual by tapping them, and commits.
 *
 * Overriding is the point. The server recommends on a pass mark and a conduct
 * mark, and a head teacher knows things the two numbers do not. So a changed
 * decision is visibly marked as a human decision rather than blending back in.
 */
export default function Promotion() {
  const t = useTheme();
  const { data: sections } = useClassSections();
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y) => y.isCurrent);

  const classes = useMemo(
    () => ((sections as any[]) ?? []).map((s) => ({ value: s.id, label: s.name })),
    [sections],
  );
  const [classId, setClassId] = useState('');
  const active = classId || classes[0]?.value;

  const { data, isPending } = usePromotionPreview({
    fromClassSectionId: active,
    academicYearId: currentYear?.id,
  });
  const commit = useCommitPromotion();

  const rows: any[] = Array.isArray(data) ? data : ((data as any)?.rows ?? []);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);

  const decisionFor = (row: any) =>
    overrides[row.studentId] ?? String(row.recommendation).toUpperCase().includes('PROMOTE');

  const promoting = rows.filter(decisionFor).length;
  const repeating = rows.length - promoting;
  const changed = Object.keys(overrides).length;

  const submit = () => {
    commit.mutate(
      {
        academicYearId: currentYear?.id ?? '',
        decisions: rows.map((r) => ({ studentId: r.studentId, promote: decisionFor(r) })),
      },
      {
        onSuccess: () => {
          toast.success(`${promoting} promoted, ${repeating} repeating`);
          setConfirming(false);
          setOverrides({});
        },
        onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not commit that'),
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Promotion' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        {classes.length ? <Segmented value={active} onChange={setClassId} options={classes} /> : null}

        {isPending ? (
          <LoadingRows count={8} lead />
        ) : !rows.length ? (
          <Empty
            title="Nothing to decide"
            body="Year results have to be worked out before promotion can be reviewed."
          />
        ) : (
          <>
            <StatRow>
              <Stat value={promoting} label="Moving up" tone="positive" />
              <Stat value={repeating} label="Repeating" tone={repeating ? 'caution' : 'primary'} />
              {changed ? <Stat value={changed} label="You changed" tone="brand" /> : null}
            </StatRow>

            <Text variant="callout" tone="secondary">
              The recommendation comes from a pass mark of 50 and a conduct mark of 50. Tap anybody to
              disagree with it. Changing those thresholds stays on the web.
            </Text>

            <Section title={`${rows.length} students`}>
              <RowGroup>
                {rows.map((row, i) => {
                  const promote = decisionFor(row);
                  const overridden = overrides[row.studentId] !== undefined;
                  return (
                    <Row
                      key={row.studentId}
                      title={row.studentName ?? 'Student'}
                      subtitle={`${
                        row.average != null ? `${Math.round(row.average)}%` : 'No average'
                      }   ·   ${row.disciplinePoints ?? 100} conduct`}
                      lead={<Avatar name={row.studentName ?? 'Student'} size="sm" />}
                      value={
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                          {overridden ? <Badge label="Your call" tone="brand" /> : null}
                          <Badge
                            label={promote ? 'Up' : 'Repeat'}
                            tone={promote ? 'positive' : 'caution'}
                          />
                        </View>
                      }
                      chevron={false}
                      onPress={() =>
                        setOverrides((prev) => {
                          const next = { ...prev };
                          const recommended = String(row.recommendation).toUpperCase().includes('PROMOTE');
                          if (next[row.studentId] === undefined) next[row.studentId] = !recommended;
                          else if (next[row.studentId] === recommended) delete next[row.studentId];
                          else delete next[row.studentId];
                          return next;
                        })
                      }
                      last={i === rows.length - 1}
                    />
                  );
                })}
              </RowGroup>
            </Section>

            {confirming ? (
              <View style={{ gap: space.md, padding: space.lg, backgroundColor: t.bg.fill, borderRadius: 12 }}>
                <Text variant="bodyMedium">Commit these decisions?</Text>
                <Text variant="callout" tone="secondary">
                  {promoting} students move up and {repeating} repeat the year. Their class changes
                  immediately, and this is not something to undo casually.
                </Text>
                <View style={{ flexDirection: 'row', gap: space.md }}>
                  <Button label="Commit" kind="primary" loading={commit.isPending} onPress={submit} />
                  <Button label="Not yet" kind="quiet" onPress={() => setConfirming(false)} />
                </View>
              </View>
            ) : (
              <Button label="Commit these decisions" kind="primary" block onPress={() => setConfirming(true)} />
            )}
          </>
        )}
      </Screen>
    </>
  );
}
