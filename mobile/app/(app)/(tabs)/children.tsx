import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { GraduationCap } from 'lucide-react-native';

import { useParentChildren } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Avatar, Badge, Empty, LoadingRows, Failed } from '@/ui';

/**
 * A parent's children.
 *
 * Most parents here have one or two, so this is usually a very short list, and
 * a short list should not be dressed up as a dashboard. Name, class, and how
 * their conduct is holding up. Everything else is one tap away on the child's
 * own screen.
 *
 * Conduct points lead rather than marks, because marks only exist once a term
 * is published, and a parent opening this in week four wants to know whether
 * anything has gone wrong, not what the average was last April.
 */
export default function Children() {
  const t = useTheme();
  const router = useRouter();
  const { data: children, isPending, isError, refetch, isRefetching } = useParentChildren();

  if (isPending)
    return (
      <Screen bleed>
        <LoadingRows count={3} lead />
      </Screen>
    );

  if (isError)
    return (
      <Screen>
        <Failed onRetry={refetch} />
      </Screen>
    );

  if (!children?.length)
    return (
      <Screen>
        <Empty
          icon={<GraduationCap size={30} color={t.fg.placeholder} strokeWidth={1.6} />}
          title="No children linked yet"
          body="The school links your account to your children. If this looks wrong, the office can put it right in a minute."
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
      <Section title={children.length === 1 ? 'Your child' : `Your ${children.length} children`}>
        <RowGroup>
          {children.map((child: any, i: number) => {
            const name = `${child.user?.firstName ?? child.firstName ?? ''} ${
              child.user?.lastName ?? child.lastName ?? ''
            }`.trim();
            const points: number = child.disciplinePoints ?? 100;

            return (
              <Row
                key={child.id}
                title={name}
                subtitle={[child.classSection?.name, child.studentIdNumber]
                  .filter(Boolean)
                  .join('   ·   ')}
                lead={<Avatar name={name} photoUrl={child.user?.photoUrl} size="lg" />}
                value={
                  points < 100 ? (
                    <Badge
                      label={`${points} pts`}
                      tone={points < 50 ? 'critical' : points < 80 ? 'caution' : 'neutral'}
                      numeric
                    />
                  ) : undefined
                }
                onPress={() => router.push(`/(app)/child/${child.id}`)}
                last={i === children.length - 1}
              />
            );
          })}
        </RowGroup>
      </Section>

      <View style={{ paddingHorizontal: space.xl }}>
        <Row
          title="Message a teacher"
          subtitle="Start a conversation with any of their teachers"
          onPress={() => router.push('/(app)/(tabs)/messages')}
          last
          inset={false}
        />
      </View>
    </Screen>
  );
}
