import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { toast } from 'sonner-native';

import {
  useAnswerPhotoConsent,
  usePhotoConsent,
  type PhotoAnswer,
  type PhotoConsent,
} from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { Failed, LoadingRows, Screen, Section, Segmented, Text } from '@/ui';

/**
 * A child's photo, and what the family agrees to (B6 in
 * docs/STUDENT-LIFE-DESIGN.md). Three questions, each answered with one tap
 * and saved straight away. From 18 the student answers instead, and this
 * says so rather than offering buttons that would be refused.
 */

const USES: { key: 'forId' | 'inApp' | 'publicity'; label: string; hint: string }[] = [
  {
    key: 'forId',
    label: 'On the ID card and report card',
    hint: 'So the gate and the exam room can tell it is them',
  },
  {
    key: 'inApp',
    label: 'In the app, for classmates and other parents',
    hint: 'Beside their name in chats. The staff always see it',
  },
  {
    key: 'publicity',
    label: "In the school's publicity",
    hint: 'The website, posters and social media',
  },
];

const WORDS: Record<PhotoAnswer, string> = {
  YES: 'Yes',
  NO: 'No',
  NOT_ASKED: 'Not answered yet',
};

const HOW: Record<string, string> = {
  IN_THE_APP: 'in the app',
  PAPER_FORM: 'on a paper form',
  ADMISSION_FORM: 'on the admission form',
};

export default function ChildPhoto() {
  const t = useTheme();
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name?: string }>();
  const { data, isPending, isError, refetch, isRefetching } = usePhotoConsent(studentId);
  const answer = useAnswerPhotoConsent(studentId);
  const first = name?.split(' ')[0] ?? 'Your child';

  const set = (current: PhotoConsent, key: (typeof USES)[number]['key'], value: PhotoAnswer) =>
    answer.mutate(
      {
        forId: current.forId,
        inApp: current.inApp,
        publicity: current.publicity,
        [key]: value,
      },
      {
        onSuccess: () => toast.success('Saved'),
        onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not save that'),
      },
    );

  const last = data?.history[0];

  return (
    <>
      <Stack.Screen options={{ title: name ? `${name}, photo` : 'Photo' }} />
      <Screen onRefresh={refetch} refreshing={isRefetching} contentContainerStyle={{ gap: space.xxl }}>
        {isPending ? (
          <LoadingRows count={3} />
        ) : isError || !data ? (
          <Failed onRetry={refetch} />
        ) : (
          <>
            <Text variant="body" tone="secondary">
              {data.mayAnswer
                ? `May the school use ${first}'s photo for each of these? You can change your answers at any time.`
                : `${first} is 18 or over, so ${first} decides this now.`}
            </Text>
            <Section title="The three uses">
              {USES.map((u) => (
                <View
                  key={u.key}
                  style={{ backgroundColor: t.bg.surface, borderRadius: 12, padding: space.lg, gap: space.md }}
                >
                  <View style={{ gap: 4 }}>
                    <Text variant="body">{u.label}</Text>
                    <Text variant="caption" tone="tertiary">
                      {u.hint}
                    </Text>
                    <Text variant="caption" tone="secondary">
                      {`Now: ${WORDS[data[u.key]]}`}
                    </Text>
                  </View>
                  {data.mayAnswer && (
                    <Segmented
                      options={[
                        { value: 'YES', label: WORDS.YES },
                        { value: 'NO', label: WORDS.NO },
                      ]}
                      value={data[u.key]}
                      onChange={(a) => {
                        if (a !== data[u.key] && !answer.isPending) set(data, u.key, a);
                      }}
                    />
                  )}
                </View>
              ))}
            </Section>
            {data.publicity === 'NOT_ASKED' && (
              <Text variant="caption" tone="tertiary">
                Until you answer, the school counts publicity as No.
              </Text>
            )}
            {last ? (
              <Text variant="caption" tone="tertiary">
                {`Last answered by ${last.answeredBy} ${HOW[last.how] ?? ''}.`}
              </Text>
            ) : null}
          </>
        )}
      </Screen>
    </>
  );
}
