import { useState } from 'react';
import { View } from 'react-native';
import { HeartPulse } from 'lucide-react-native';
import { toast } from 'sonner-native';

import {
  useClinicSummary,
  useClinicVisits,
  useDischarge,
  useGiveMedicine,
  useMarkParentNotified,
  type ClinicVisit,
} from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen,
  Section,
  Row,
  RowGroup,
  Avatar,
  Badge,
  Button,
  Empty,
  Field,
  LoadingRows,
  Failed,
  Segmented,
  Stat,
  StatRow,
  Text,
} from '@/ui';

/**
 * The sick bay, in a matron's hand.
 *
 * This is the screen the phone was made for. A matron walking a child to the
 * clinic at two in the morning is not going to open a laptop, and the exercise
 * book that stands in for this today is downstairs in the office.
 *
 * The list opens on who is lying in there right now, because that is the only
 * question anybody asks first.
 */

const OUTCOMES: Record<ClinicVisit['outcome'], string> = {
  RETURNED_TO_CLASS: 'Back to class',
  RESTING_IN_SICK_BAY: 'Resting here',
  REFERRED_OUT: 'Referred out',
  SENT_HOME: 'Collected',
};

const SEVERITY_TONE: Record<ClinicVisit['severity'], 'neutral' | 'caution' | 'critical'> = {
  MINOR: 'neutral',
  MODERATE: 'caution',
  SERIOUS: 'critical',
};

function nameOf(v: ClinicVisit) {
  return `${v.student.user.firstName} ${v.student.user.lastName}`;
}

function when(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Clinic() {
  const t = useTheme();
  const [tab, setTab] = useState<'now' | 'book'>('now');
  const [open, setOpen] = useState<string | null>(null);

  const { data: summary } = useClinicSummary(30);
  const { data, isPending, isError, refetch, isRefetching } = useClinicVisits(
    tab === 'now' ? { inSickBay: 'true', limit: 50 } : { limit: 30 },
  );

  const visits = data?.data ?? [];
  const selected = visits.find((v) => v.id === open) ?? null;

  if (isPending)
    return (
      <Screen bleed>
        <LoadingRows count={4} lead />
      </Screen>
    );

  if (isError)
    return (
      <Screen>
        <Failed onRetry={refetch} />
      </Screen>
    );

  if (selected) return <VisitDetail visit={selected} onBack={() => setOpen(null)} />;

  return (
    <Screen
      bleed
      onRefresh={refetch}
      refreshing={isRefetching}
      contentContainerStyle={{ paddingHorizontal: 0, gap: space.xxl }}
    >
      <View style={{ paddingHorizontal: space.xl }}>
        <StatRow>
          <Stat
            value={summary?.inSickBay ?? 0}
            label="In the sick bay"
            tone={(summary?.inSickBay ?? 0) > 0 ? 'caution' : 'primary'}
          />
          <Stat value={summary?.visits ?? 0} label="Visits, 30 days" />
          <Stat value={summary?.dosesGiven ?? 0} label="Doses given" />
        </StatRow>
      </View>

      <View style={{ paddingHorizontal: space.xl }}>
        <Segmented
          options={[
            { value: 'now', label: 'In the sick bay' },
            { value: 'book', label: 'The book' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {/* Three visits in a month is a pattern, not a run of bad luck. */}
      {(summary?.repeatVisitors?.length ?? 0) > 0 && tab === 'now' && (
        <Section title="Keeps coming back">
          <RowGroup>
            {summary!.repeatVisitors.map((s, i) => (
              <Row
                key={s.id}
                title={`${s.user.firstName} ${s.user.lastName}`}
                subtitle={`${s.visits} visits in the last month`}
                lead={<Avatar name={`${s.user.firstName} ${s.user.lastName}`} size="lg" />}
                last={i === summary!.repeatVisitors.length - 1}
                chevron={false}
              />
            ))}
          </RowGroup>
        </Section>
      )}

      {visits.length === 0 ? (
        <Empty
          icon={<HeartPulse size={30} color={t.fg.placeholder} strokeWidth={1.6} />}
          title={tab === 'now' ? 'Nobody is in the sick bay' : 'Nothing in the book yet'}
          body={
            tab === 'now'
              ? 'A quiet night is a good night.'
              : 'Visits recorded on any device show up here.'
          }
        />
      ) : (
        <Section title={tab === 'now' ? 'Resting here now' : 'Recent visits'}>
          <RowGroup>
            {visits.map((v, i) => (
              <Row
                key={v.id}
                title={nameOf(v)}
                subtitle={[
                  v.complaint,
                  v.student.allergies ? `Allergic to ${v.student.allergies}` : null,
                  when(v.visitedAt),
                ]
                  .filter(Boolean)
                  .join('   ·   ')}
                lead={<Avatar name={nameOf(v)} photoUrl={v.student.user.photoUrl} size="lg" />}
                value={<Badge label={OUTCOMES[v.outcome]} tone={SEVERITY_TONE[v.severity]} />}
                onPress={() => setOpen(v.id)}
                last={i === visits.length - 1}
              />
            ))}
          </RowGroup>
        </Section>
      )}
    </Screen>
  );
}

/**
 * One visit.
 *
 * The allergy is at the top and unmissable. Everything below it is the two
 * things left undone at the end of a shift: giving a dose, and telling the
 * family.
 */
function VisitDetail({ visit, onBack }: { visit: ClinicVisit; onBack: () => void }) {
  const t = useTheme();
  const [medicine, setMedicine] = useState('');
  const [dose, setDose] = useState('');

  const give = useGiveMedicine();
  const discharge = useDischarge();
  const notify = useMarkParentNotified();

  const say = (e: any, fallback: string) =>
    toast.error(e?.response?.data?.message ?? fallback);

  return (
    <Screen contentContainerStyle={{ gap: space.xxl }}>
      <Button label="Back to the sick bay" kind="quiet" onPress={onBack} />

      <Section title={nameOf(visit)}>
        {visit.student.allergies ? (
          <View
            style={{
              backgroundColor: t.bg.surface,
              borderLeftWidth: 3,
              borderLeftColor: t.status.critical.solid,
              padding: space.lg,
              borderRadius: 10,
            }}
          >
            <Text variant="caption" tone="tertiary">
              Allergic to
            </Text>
            <Text variant="body">{visit.student.allergies}</Text>
          </View>
        ) : null}

        <RowGroup>
          <Row title="Said" subtitle={visit.complaint} chevron={false} />
          {visit.findings ? (
            <Row title="Found" subtitle={visit.findings} chevron={false} />
          ) : null}
          {visit.treatment ? (
            <Row title="Given" subtitle={visit.treatment} chevron={false} />
          ) : null}
          {visit.temperature !== null ? (
            <Row title="Temperature" subtitle={`${visit.temperature} °C`} chevron={false} />
          ) : null}
          <Row
            title="Seen by"
            subtitle={`${visit.seenBy.firstName} ${visit.seenBy.lastName}`}
            chevron={false}
          />
          <Row
            title="Blood type"
            subtitle={visit.student.bloodType ?? 'Not recorded'}
            chevron={false}
            last
          />
        </RowGroup>
      </Section>

      <Section title="Doses given">
        {(visit.medications?.length ?? 0) === 0 ? (
          <Text variant="caption" tone="tertiary">
            Nothing given yet.
          </Text>
        ) : (
          <RowGroup>
            {visit.medications!.map((m, i) => (
              <Row
                key={m.id}
                title={`${m.medicine}   ·   ${m.dose}`}
                subtitle={when(m.givenAt)}
                chevron={false}
                last={i === visit.medications!.length - 1}
              />
            ))}
          </RowGroup>
        )}

        <Field label="Medicine" value={medicine} onChangeText={setMedicine} placeholder="Paracetamol" />
        <Field label="Dose" value={dose} onChangeText={setDose} placeholder="500mg" />
        <Text variant="caption" tone="tertiary">
          The same medicine twice within four hours is refused, and you are told
          how long ago the last one was.
        </Text>
        <Button
          label="Record the dose"
          block
          loading={give.isPending}
          disabled={!medicine.trim() || !dose.trim()}
          onPress={() =>
            give.mutate(
              {
                studentId: visit.student.id,
                visitId: visit.id,
                medicine: medicine.trim(),
                dose: dose.trim(),
              },
              {
                onSuccess: () => {
                  setMedicine('');
                  setDose('');
                  toast.success('Dose recorded');
                },
                onError: (e) => say(e, 'Could not record the dose'),
              },
            )
          }
        />
      </Section>

      <Section title="Before you finish">
        {!visit.parentNotifiedAt ? (
          <Button
            label="The family has been told"
            kind="secondary"
            block
            loading={notify.isPending}
            onPress={() =>
              notify.mutate(visit.id, {
                onSuccess: () => toast.success('Noted'),
                onError: (e) => say(e, 'Could not record that'),
              })
            }
          />
        ) : (
          <Badge label="Family told" tone="positive" />
        )}

        {visit.outcome === 'RESTING_IN_SICK_BAY' && !visit.dischargedAt ? (
          <Button
            label="Send back to class"
            block
            loading={discharge.isPending}
            onPress={() =>
              discharge.mutate(visit.id, {
                onSuccess: () => {
                  toast.success('Sent back');
                  onBack();
                },
                onError: (e) => say(e, 'Could not discharge'),
              })
            }
          />
        ) : null}
      </Section>
    </Screen>
  );
}
