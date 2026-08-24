import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { toast } from 'sonner-native';

import { useAuthStore } from '@/stores/auth-store';
import {
  useTeacherAssignments, useHomeworkList, useCreateHomework,
  useGradeSubmission, useCurrentTerm,
} from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen, Section, Row, RowGroup, Text, Field, Button, Badge, Segmented,
  Empty, LoadingRows, Avatar, Meter,
} from '@/ui';

/**
 * Setting homework, then marking it.
 *
 * Two jobs that happen weeks apart, so they are two tabs rather than one long
 * screen. Setting is a short form. Marking is a list of who handed in, with the
 * mark typed straight into the row, because opening a detail screen per student
 * to type one number is thirty extra taps.
 *
 * Late submissions are flagged but not punished automatically here. The
 * deduction is school policy and lives on the assignment, so the screen shows
 * what it will cost rather than silently applying it.
 */
export default function HomeworkManage() {
  const [tab, setTab] = useState<'set' | 'mark'>('set');

  return (
    <>
      <Stack.Screen options={{ title: 'Homework' }} />
      <Screen contentContainerStyle={{ gap: space.xl }}>
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as never)}
          options={[
            { value: 'set', label: 'Set new' },
            { value: 'mark', label: 'Mark' },
          ]}
        />
        {tab === 'set' ? <SetHomework /> : <MarkHomework onSwitchToSet={() => setTab('set')} />}
      </Screen>
    </>
  );
}

function SetHomework() {
  const teacherId = useAuthStore((s) => s.user?.teacherId);
  const { data: assignments } = useTeacherAssignments(teacherId);
  const { data: term } = useCurrentTerm();
  const create = useCreateHomework();

  const pairs = useMemo(() => {
    const out: { value: string; label: string; classId: string; subjectId: string }[] = [];
    for (const a of assignments ?? []) {
      const section: any = (a as any).classSection;
      const subject: any = (a as any).subject;
      if (!section || !subject) continue;
      const value = `${section.id}:${subject.id}`;
      if (!out.some((p) => p.value === value)) {
        out.push({ value, label: `${section.name} ${subject.name}`, classId: section.id, subjectId: subject.id });
      }
    }
    return out;
  }, [assignments]);

  const [pair, setPair] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDays, setDueDays] = useState('7');
  const [maxMarks, setMaxMarks] = useState('20');

  const chosen = pairs.find((p) => p.value === (pair || pairs[0]?.value));

  const submit = () => {
    if (!chosen) return;
    if (title.trim().length < 3) {
      toast.error('Give it a title the class will recognise');
      return;
    }
    const due = new Date();
    due.setDate(due.getDate() + Math.max(1, Number(dueDays) || 7));

    create.mutate(
      {
        classSectionId: chosen.classId,
        subjectId: chosen.subjectId,
        termId: term?.id,
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate: due.toISOString(),
        maxMarks: Number(maxMarks) || undefined,
      } as never,
      {
        onSuccess: () => {
          toast.success('Set. The class can see it now.');
          setTitle('');
          setDescription('');
        },
        onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not set that'),
      },
    );
  };

  if (!pairs.length) return <Empty title="No classes" body="You need a subject and a class assigned first." />;

  return (
    <View style={{ gap: space.xl }}>
      <Segmented value={pair || pairs[0].value} onChange={setPair} options={pairs} />

      <View style={{ gap: space.lg }}>
        <Field label="Title" value={title} onChangeText={setTitle} required placeholder="Chapter 4 exercises" />
        <Field
          label="What to do"
          value={description}
          onChangeText={setDescription}
          multiline
          minHeight={110}
        />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Due in days" value={dueDays} onChangeText={setDueDays} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Out of" value={maxMarks} onChangeText={setMaxMarks} keyboardType="number-pad" />
          </View>
        </View>
        <Button label="Set the homework" kind="primary" block loading={create.isPending} onPress={submit} />
      </View>
    </View>
  );
}

function MarkHomework({ onSwitchToSet }: { onSwitchToSet: () => void }) {
  const { data: term } = useCurrentTerm();
  const { data, isPending } = useHomeworkList({ termId: term?.id });
  const grade = useGradeSubmission();
  const [openId, setOpenId] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});

  if (isPending) return <LoadingRows count={5} />;
  if (!data?.length)
    return (
      <Empty
        title="Nothing set yet"
        body="Homework you set appears here once a class has something to hand in."
        action={{ label: 'Set some homework', onPress: onSwitchToSet }}
      />
    );

  return (
    <View style={{ gap: space.xxl }}>
      {(data as any[]).map((hw) => {
        const submissions: any[] = hw.submissions ?? [];
        const marked = submissions.filter((s) => s.marks != null).length;
        const open = openId === hw.id;

        return (
          <View key={hw.id} style={{ gap: space.md }}>
            <Row
              title={hw.title}
              subtitle={`${hw.classSection?.name ?? ''}   ·   due ${new Date(hw.dueDate).toLocaleDateString()}`}
              value={<Badge label={`${marked}/${submissions.length}`} tone={marked === submissions.length && submissions.length > 0 ? 'positive' : 'neutral'} numeric />}
              inset={false}
              onPress={() => setOpenId(open ? null : hw.id)}
              last
            />

            {submissions.length ? (
              <Meter
                value={marked}
                max={submissions.length}
                label={`${marked} of ${submissions.length} marked`}
                showValue={false}
                tone={marked === submissions.length ? 'positive' : 'brand'}
              />
            ) : (
              <Text variant="footnote" tone="tertiary">Nobody has handed this in yet.</Text>
            )}

            {open && submissions.length ? (
              <Section title="Handed in">
                <RowGroup>
                  {submissions.map((sub, i) => {
                    const name = `${sub.student?.user?.firstName ?? ''} ${
                      sub.student?.user?.lastName ?? ''
                    }`.trim();
                    const key = sub.id;
                    return (
                      <Row
                        key={key}
                        title={name || 'Student'}
                        subtitle={sub.isLate ? 'Handed in late' : 'On time'}
                        lead={<Avatar name={name || 'Student'} size="sm" />}
                        value={
                          <View style={{ width: 92 }}>
                            <Field
                              label=""
                              // The label is deliberately blank on screen, so
                              // without this a screen reader lands on an
                              // unnamed box in a list of thirty identical ones.
                              accessibilityLabel={`Mark for ${name || 'student'}`}
                              value={marks[key] ?? (sub.marks != null ? String(sub.marks) : '')}
                              onChangeText={(v) => setMarks((prev) => ({ ...prev, [key]: v.replace(/[^\d.]/g, '') }))}
                              keyboardType="numeric"
                              placeholder={hw.maxMarks ? `/${hw.maxMarks}` : '-'}
                              onBlur={() => {
                                const raw = marks[key];
                                if (raw == null || raw === '') return;
                                grade.mutate(
                                  { submissionId: key, marks: Number(raw) } as never,
                                  { onError: () => toast.error(`Could not save ${name}`) },
                                );
                              }}
                            />
                          </View>
                        }
                        chevron={false}
                        last={i === submissions.length - 1}
                      />
                    );
                  })}
                </RowGroup>
              </Section>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
