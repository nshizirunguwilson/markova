import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { FileDown, ShieldCheck } from 'lucide-react-native';

import { API_URL } from '@/constants/config';
import { useCurrentTerm, useStudentTermResult } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { Screen, Text, Button, Fact, Empty, Badge } from '@/ui';
import { KeptPrivate } from '@/components/KeptPrivate';
import { keptPrivate } from '@/lib/kept-private';

/**
 * The report card.
 *
 * The PDF is rendered on the server through headless Chrome, so this screen
 * does not try to reproduce it. Reimplementing an A4 document on a phone gives
 * you a worse version of a thing that already exists and prints correctly.
 *
 * What it does instead is show the parts a parent wants without opening a
 * document, then hand over the real thing. The verification code sits here in
 * mono and selectable, because that is the number somebody reads out when a
 * school or an employer asks whether a printed card is genuine.
 */
export default function ChildReport() {
  const t = useTheme();
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name?: string }>();
  const { data: term } = useCurrentTerm();
  const { data: result, error } = useStudentTermResult(studentId, term?.id);
  // An adult child may keep their results from their parents (A8).
  const kept = keptPrivate(error);

  const r: any = result ?? {};
  const published = Boolean(r.isPublished);
  const code: string | undefined = r.verification?.code;

  if (kept)
    return (
      <>
        <Stack.Screen options={{ title: 'Report card' }} />
        <Screen>
          <KeptPrivate message={kept} />
        </Screen>
      </>
    );

  if (!published)
    return (
      <>
        <Stack.Screen options={{ title: 'Report card' }} />
        <Screen>
          <Empty
            title="Not published yet"
            body="Report cards appear here once the school has checked the results and signed them off."
          />
        </Screen>
      </>
    );

  return (
    <>
      <Stack.Screen options={{ title: 'Report card' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        <View style={{ gap: space.xs }}>
          <Text variant="title1">{name ?? 'Report card'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text variant="callout" tone="secondary">
              {term?.name}
            </Text>
            <Badge label="Published" tone="positive" />
          </View>
        </View>

        <View>
          <Fact label="Overall grade" value={r.letterGrade ?? '-'} />
          <Fact label="Average" value={r.average != null ? `${Math.round(r.average)}%` : '-'} />
          <Fact
            label="Aggregate"
            value={r.aggregate != null ? `${r.aggregate} of ${r.aggregateMax ?? '-'}` : '-'}
          />
          <Fact label="Position in class" value={r.rank ?? '-'} last={!code} />
          {code ? <Fact label="Verification code" value={code} mono last /> : null}
        </View>

        <View style={{ gap: space.md }}>
          <Button
            label="Open the full report card"
            kind="primary"
            block
            icon={<FileDown size={18} color={t.brand.onSolid} strokeWidth={2} />}
            onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/reports/term/${studentId}/pdf`)}
          />

          {code ? (
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
              <ShieldCheck size={16} color={t.fg.tertiary} strokeWidth={2} style={{ marginTop: 2 }} />
              <Text variant="footnote" tone="tertiary" style={{ flex: 1 }}>
                Anyone can check a printed copy against the code above, with no account and no app.
              </Text>
            </View>
          ) : null}
        </View>
      </Screen>
    </>
  );
}
