import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { toast } from 'sonner-native';

import { useAuthStore } from '@/stores/auth-store';
import {
  useIncidents, useCreateIncident, useCurrentTerm, usePendingAppeals,
  useReviewAppeal, useTeacherAssignments, useClassStudents, useAwardMerit,
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

/**
 * What a merit can be given for.
 *
 * The same list the web uses, worded for the things a Rwandan secondary school
 * already praises at assembly.
 */
const MERITS = [
  { value: 'HELPING_OTHERS', label: 'Helping others', points: 5 },
  { value: 'ACADEMIC_EFFORT', label: 'Real effort', points: 8 },
  { value: 'LEADERSHIP', label: 'Leadership', points: 10 },
  { value: 'SPORT', label: 'Sport', points: 5 },
  { value: 'ARTS', label: 'Arts', points: 8 },
  { value: 'SERVICE', label: 'Service', points: 8 },
  { value: 'HONESTY', label: 'Honesty', points: 10 },
  { value: 'IMPROVEMENT', label: 'Turning it around', points: 12 },
];

export default function DisciplineLog() {
  const role = useAuthStore((s) => s.user?.role);
  const [tab, setTab] = useState<'record' | 'merit' | 'log' | 'appeals'>('record');

  // Recognising a student sits beside recording an incident, deliberately. A
  // conduct system with only deductions teaches a student that the best
  // possible outcome is to be unnoticed, and a merit form filed on a separate
  // screen is a merit form nobody opens.
  const tabs =
    role === 'ADMIN'
      ? [
          { value: 'record', label: 'Incident' },
          { value: 'merit', label: 'Recognise' },
          { value: 'log', label: 'Recent' },
          { value: 'appeals', label: 'Appeals' },
        ]
      : [
          { value: 'record', label: 'Incident' },
          { value: 'merit', label: 'Recognise' },
          { value: 'log', label: 'Recent' },
        ];

  return (
    <>
      <Stack.Screen options={{ title: 'Behaviour' }} />
      <Screen contentContainerStyle={{ gap: space.xl }}>
        <Segmented value={tab} onChange={(v) => setTab(v as never)} options={tabs as never} />
        {tab === 'record' ? (
          <Record />
        ) : tab === 'merit' ? (
          <Merit />
        ) : tab === 'log' ? (
          <Log />
        ) : (
          <Appeals />
        )}
      </Screen>
    </>
  );
}

/**
 * Recognising a student.
 *
 * The points restore a conduct score up to a clean sheet and never past it, so
 * a merit is a way back rather than a currency to bank against future trouble.
 * The recognition itself stands either way.
 */
function Merit() {
  const teacherId = useAuthStore((s) => s.user?.teacherId);
  const { data: term } = useCurrentTerm();
  const { data: assignments } = useTeacherAssignments(teacherId);
  const award = useAwardMerit();

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
  const [category, setCategory] = useState(MERITS[0].value);
  const [description, setDescription] = useState('');

  const { data: students } = useClassStudents(classId || classes[0]?.value);
  const chosen = MERITS.find((m) => m.value === category)!;

  const submit = () => {
    if (!studentId) {
      toast.error('Pick the student first');
      return;
    }
    if (description.trim().length < 10) {
      toast.error('Say what they did. It goes on their record and home to their family.');
      return;
    }
    award.mutate(
      {
        studentId,
        termId: term?.id,
        category,
        description: description.trim(),
        points: chosen.points,
        date: new Date().toISOString().slice(0, 10),
      },
      {
        onSuccess: (res: any) => {
          toast.success(
            res?.pointsRestored > 0
              ? `Recorded. ${res.pointsRestored} points restored.`
              : 'Recorded. Their conduct score was already clean.',
          );
          setStudentId('');
          setDescription('');
        },
        onError: (e: any) =>
          toast.error(e?.response?.data?.message ?? 'Could not record that'),
      },
    );
  };

  if (!classes.length)
    return (
      <Empty
        title="No classes"
        body="You need a class assigned before you can recognise anybody."
      />
    );

  return (
    <View style={{ gap: space.xl }}>
      <Segmented value={classId || classes[0].value} onChange={setClassId} options={classes} />

      <Section title="Who">
        <RowGroup>
          {((students as any[]) ?? []).map((s, i, arr) => {
            // useClassStudents always hands back the nested shape, whatever
            // the endpoint answered with, so there is only one place to look.
            const name = `${s.user?.firstName ?? ''} ${s.user?.lastName ?? ''}`.trim();
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

      <Section title="What for">
        <View style={{ gap: space.md }}>
          <Segmented
            value={category}
            onChange={setCategory}
            options={MERITS.map((m) => ({ value: m.value, label: m.label }))}
          />
          <Text variant="footnote" tone="tertiary" numeric>
            Worth {chosen.points} points, restoring their score up to a clean
            sheet and never past it.
          </Text>
        </View>
      </Section>

      <Section title="What they did">
        <View style={{ gap: space.lg }}>
          <Field
            label="Description"
            hint="Their family reads this word for word, so make it worth reading."
            value={description}
            onChangeText={setDescription}
            multiline
            minHeight={100}
            required
          />
          <Button
            label="Recognise them"
            kind="primary"
            block
            loading={award.isPending}
            onPress={submit}
          />
        </View>
      </Section>
    </View>
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
            // useClassStudents always hands back the nested shape, whatever
            // the endpoint answered with, so there is only one place to look.
            const name = `${s.user?.firstName ?? ''} ${s.user?.lastName ?? ''}`.trim();
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
          <Field label="Where" value={location} onChangeText={setLocation} optional placeholder="Classroom, corridor, field" />
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
