import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { toast } from 'sonner-native';

import { useAuthStore } from '@/stores/auth-store';
import {
  useIncidents, useCreateIncident, useCurrentTerm, usePendingAppeals,
  useReviewAppeal, useTeacherAssignments, useClassStudents,
} from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen, Section, Row, RowGroup, Text, Field, Button, Badge, Segmented,
  Empty, LoadingRows, Avatar, statusTone, humanise,
} from '@/ui';

/**
 * Recording an incident, and for admins, judging the appeals.
 *
 * The action taken drives the points, not the other way around. A teacher
 * decides "this is a written warning" and the deduction follows from school
 * policy, rather than a teacher inventing a number. Getting that the wrong way
 * round is how one class ends up harsher than another for the same behaviour.
 *
 * The description is required and the field says why: this is the text a
 * parent will read, and possibly appeal against.
 */

const ACTIONS = [
  { value: 'VERBAL_WARNING', label: 'Verbal warning', points: 2 },
  { value: 'WRITTEN_WARNING', label: 'Written warning', points: 5 },
  { value: 'DETENTION', label: 'Detention', points: 10 },
  { value: 'SUSPENSION', label: 'Suspension', points: 20 },
  { value: 'EXPULSION', label: 'Expulsion', points: 50 },
];

export default function DisciplineLog() {
  const role = useAuthStore((s) => s.user?.role);
  const [tab, setTab] = useState<'record' | 'log' | 'appeals'>('record');

  const tabs =
    role === 'ADMIN'
      ? [
          { value: 'record', label: 'Record' },
          { value: 'log', label: 'Recent' },
          { value: 'appeals', label: 'Appeals' },
        ]
      : [
          { value: 'record', label: 'Record' },
          { value: 'log', label: 'Recent' },
        ];

  return (
    <>
      <Stack.Screen options={{ title: 'Discipline' }} />
      <Screen contentContainerStyle={{ gap: space.xl }}>
        <Segmented value={tab} onChange={(v) => setTab(v as never)} options={tabs as never} />
        {tab === 'record' ? <Record /> : tab === 'log' ? <Log /> : <Appeals />}
      </Screen>
    </>
  );
}

function Record() {
  const t = useTheme();
  const teacherId = useAuthStore((s) => s.user?.teacherId);
  const { data: term } = useCurrentTerm();
  const { data: assignments } = useTeacherAssignments(teacherId);
  const create = useCreateIncident();

  const classes = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments ?? []) {
      const section: any = (a as any).classSection;
      if (section) map.set(section.id, section.name);
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [assignments]);

  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [action, setAction] = useState(ACTIONS[0].value);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');

  const { data: students } = useClassStudents(classId || classes[0]?.value);
  const chosen = ACTIONS.find((a) => a.value === action)!;

  const submit = () => {
    if (!studentId) {
      toast.error('Pick the student first');
      return;
    }
    if (description.trim().length < 15) {
      toast.error('Describe what happened. A parent will read this.');
      return;
    }
    create.mutate(
      {
        studentId,
        termId: term?.id,
        description: description.trim(),
        location: location.trim() || undefined,
        actionTaken: action,
        pointsDeducted: chosen.points,
        date: new Date().toISOString().slice(0, 10),
      } as never,
      {
        onSuccess: () => {
          toast.success('Recorded. The parent has been told.');
          setStudentId('');
          setDescription('');
          setLocation('');
        },
        onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not record that'),
      },
    );
  };

  if (!classes.length)
    return <Empty title="No classes" body="You need a class assigned before you can record anything." />;

  return (
    <View style={{ gap: space.xl }}>
      <Segmented value={classId || classes[0].value} onChange={setClassId} options={classes} />

      <Section title="Who">
        <RowGroup>
          {((students as any[]) ?? []).map((s, i, arr) => {
            const name = `${s.firstName ?? s.user?.firstName ?? ''} ${
              s.lastName ?? s.user?.lastName ?? ''
            }`.trim();
            return (
              <Row
                key={s.id}
                title={name}
                lead={<Avatar name={name} size="sm" />}
                value={studentId === s.id ? <Badge label="Selected" tone="brand" /> : undefined}
                chevron={false}
                onPress={() => setStudentId(s.id)}
                last={i === arr.length - 1}
              />
            );
          })}
        </RowGroup>
      </Section>

      <Section title="What was decided">
        <View style={{ gap: space.md }}>
          <Segmented
            value={action}
            onChange={setAction}
            options={ACTIONS.map((a) => ({ value: a.value, label: a.label }))}
          />
          <Text variant="footnote" tone="tertiary" numeric>
            Costs {chosen.points} conduct points. The action sets the deduction, not the other way round.
          </Text>
        </View>
      </Section>

      <Section title="What happened">
        <View style={{ gap: space.lg }}>
          <Field
            label="Description"
            hint="A parent reads this word for word, and may appeal against it."
            value={description}
            onChangeText={setDescription}
            multiline
            minHeight={120}
            required
          />
          <Field label="Where" value={location} onChangeText={setLocation} placeholder="Classroom, corridor, field" />
          <Button label="Record it" kind="primary" block loading={create.isPending} onPress={submit} />
        </View>
      </Section>
    </View>
  );
}

function Log() {
  const { data: term } = useCurrentTerm();
  const { data, isPending } = useIncidents({ termId: term?.id });

  if (isPending) return <LoadingRows count={6} />;
  if (!data?.length) return <Empty title="Nothing recorded" body="No incidents this term." />;

  return (
    <Section title={`${data.length} this term`}>
      <RowGroup>
        {(data as any[]).map((incident, i, arr) => (
          <Row
            key={incident.id}
            title={
              `${incident.student?.user?.firstName ?? ''} ${incident.student?.user?.lastName ?? ''}`.trim() ||
              'Student'
            }
            subtitle={incident.description}
            value={<Badge label={`-${incident.pointsDeducted}`} tone="critical" numeric />}
            chevron={false}
            last={i === arr.length - 1}
          />
        ))}
      </RowGroup>
    </Section>
  );
}

function Appeals() {
  const { data, isPending } = usePendingAppeals();
  const review = useReviewAppeal();

  if (isPending) return <LoadingRows count={4} />;
  if (!(data as any[])?.length)
    return <Empty title="No appeals waiting" body="Nothing has been contested." />;

  return (
    <View style={{ gap: space.xxl }}>
      {(data as any[]).map((appeal) => (
        <View key={appeal.id} style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
            <Text variant="title3" style={{ flex: 1 }}>
              {`${appeal.incident?.student?.user?.firstName ?? ''} ${
                appeal.incident?.student?.user?.lastName ?? ''
              }`.trim() || 'Student'}
            </Text>
            <Badge label={humanise(appeal.status)} tone={statusTone[appeal.status] ?? 'neutral'} />
          </View>

          <Text variant="footnote" tone="tertiary">
            Against: {appeal.incident?.description}
          </Text>
          <Text variant="body" tone="secondary" selectable>
            {appeal.statement}
          </Text>

          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Button
              label="Uphold the appeal"
              kind="primary"
              onPress={() =>
                review.mutate(
                  { id: appeal.id, status: 'APPROVED' },
                  { onSuccess: () => toast.success('Points restored') },
                )
              }
            />
            <Button
              label="Reject"
              kind="quiet"
              onPress={() =>
                review.mutate(
                  { id: appeal.id, status: 'REJECTED' },
                  { onSuccess: () => toast.success('Appeal rejected') },
                )
              }
            />
          </View>
        </View>
      ))}
    </View>
  );
}
