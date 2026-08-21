import { View } from 'react-native';
import { Stack } from 'expo-router';

import { useAssessmentTypes } from '@/hooks/useApi';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Empty, LoadingRows, Fact } from '@/ui';

/**
 * Assessment types.
 *
 * A very short list that carries more weight than its length suggests. These
 * names are matched character for character against the weight table in the
 * grading code, so renaming "CAT 1" to "Cat 1" quietly drops it out of every
 * term calculation in the school.
 *
 * The screen says that, because it is exactly the kind of thing somebody tidies
 * up on a Friday without knowing.
 */
export default function Assessments() {
  const { data, isPending } = useAssessmentTypes();

  return (
    <>
      <Stack.Screen options={{ title: 'Assessment types' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        {isPending ? (
          <LoadingRows count={4} />
        ) : !data?.length ? (
          <Empty title="None set up" body="Term results cannot be calculated until these exist." />
        ) : (
          <Section title={`${data.length} in use`}>
            <RowGroup>
              {(data as any[]).map((type, i, arr) => (
                <Row key={type.id} title={type.name} chevron={false} last={i === arr.length - 1} />
              ))}
            </RowGroup>
          </Section>
        )}

        <Section title="How they are weighted">
          <View>
            <Fact label="O-Level core and elective" value="CAT 20, CAT 20, exam 60" />
            <Fact label="A-Level general" value="CAT 20, CAT 20, exam 60" />
            <Fact label="Trade modules" value="CAT 15, CAT 15, practical 30, exam 40" last />
          </View>
        </Section>

        <Text variant="footnote" tone="critical">
          These names are matched exactly against the grading rules. Renaming one, even changing its
          capitals, drops it out of every term calculation in the school.
        </Text>
      </Screen>
    </>
  );
}

