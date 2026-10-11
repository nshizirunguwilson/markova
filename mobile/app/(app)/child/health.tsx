import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { HeartPulse } from 'lucide-react-native';

import { useEmergencyCard, useStudentVisits, type ClinicVisit } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen,
  Section,
  Row,
  RowGroup,
  Badge,
  Empty,
  LoadingRows,
  Fact,
  Text,
} from '@/ui';
import { KeptPrivate } from '@/components/KeptPrivate';
import { keptPrivate } from '@/lib/kept-private';

/**
 * A parent's view of the sick bay.
 *
 * Read only on purpose: the record is the school's clinical note, and a parent
 * editing it would make it worthless the day somebody has to account for what
 * happened. What a parent gets instead is the thing they never had, which is
 * knowing at all.
 */

const OUTCOMES: Record<ClinicVisit['outcome'], string> = {
  RETURNED_TO_CLASS: 'Went back to class',
  RESTING_IN_SICK_BAY: 'Rested in the sick bay',
  REFERRED_OUT: 'Sent to a health centre',
  SENT_HOME: 'Collected from school',
};

const SEVERITY_TONE: Record<ClinicVisit['severity'], 'neutral' | 'caution' | 'critical'> = {
  MINOR: 'neutral',
  MODERATE: 'caution',
  SERIOUS: 'critical',
};

function when(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChildHealth() {
  const t = useTheme();
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name?: string }>();
  const { data: card, isPending, refetch, isRefetching, error } = useEmergencyCard(studentId);
  // An adult child may keep their health visits from their parents (A8).
  const kept = keptPrivate(error);
  const { data: visitPage } = useStudentVisits(studentId);

  const visits: ClinicVisit[] = visitPage?.data ?? [];
  const record = card?.student?.healthRecord;

  return (
    <>
      <Stack.Screen options={{ title: name ? `${name}, health` : 'Health' }} />
      <Screen
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={{ gap: space.xxl }}
      >
        {isPending ? (
          <LoadingRows count={5} />
        ) : kept ? (
          <KeptPrivate message={kept} />
        ) : (
          <>
            <Section title="On record">
              {/* An allergy is the one line somebody has to read first, so it
                  is set apart rather than sitting in a list of facts. */}
              <View
                style={{
                  backgroundColor: t.bg.surface,
                  borderRadius: 12,
                  padding: space.lg,
                  borderLeftWidth: 3,
                  borderLeftColor: t.status.critical.solid,
                }}
              >
                <Text variant="caption" tone="tertiary">
                  Allergic to
                </Text>
                <Text variant="body">
                  {card?.student?.allergies ?? record?.allergyNotes ?? 'Nothing on record'}
                </Text>
              </View>

              <RowGroup>
                <Fact label="Blood type" value={card?.student?.bloodType ?? 'Not recorded'} />
                <Fact
                  label="Long-term conditions"
                  value={record?.chronicConditions ?? 'None recorded'}
                />
                <Fact
                  label="Regular medication"
                  value={record?.regularMedication ?? 'None recorded'}
                />
                <Fact
                  label="School rings first"
                  value={
                    record?.emergencyContactName
                      ? `${record.emergencyContactName}${
                          record.emergencyRelationship
                            ? ` (${record.emergencyRelationship})`
                            : ''
                        }`
                      : 'You'
                  }
                />
                <Fact
                  label="On this number"
                  value={record?.emergencyContactPhone ?? '-'}
                  mono
                  last
                />
              </RowGroup>
            </Section>

            <Section title="Visits to the sick bay">
              {visits.length === 0 ? (
                <Empty
                  icon={<HeartPulse size={30} color={t.fg.placeholder} strokeWidth={1.6} />}
                  title="Never been"
                  body="Your child has not been to the sick bay."
                />
              ) : (
                <RowGroup>
                  {visits.map((v, i) => (
                    <Row
                      key={v.id}
                      title={v.complaint}
                      subtitle={[
                        when(v.visitedAt),
                        v.treatment,
                        v.referredTo ? `Sent to ${v.referredTo}` : null,
                        `Seen by ${v.seenBy.firstName} ${v.seenBy.lastName}`,
                      ]
                        .filter(Boolean)
                        .join('   ·   ')}
                      value={
                        <Badge label={OUTCOMES[v.outcome]} tone={SEVERITY_TONE[v.severity]} />
                      }
                      chevron={false}
                      last={i === visits.length - 1}
                    />
                  ))}
                </RowGroup>
              )}
            </Section>
          </>
        )}
      </Screen>
    </>
  );
}
