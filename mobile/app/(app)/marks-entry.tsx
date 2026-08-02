import { useEffect, useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { toast } from 'sonner-native';

import { useAuthStore } from '@/stores/auth-store';
import {
  useTeacherAssignments, useClassStudents, useAssessmentTypes,
  useCurrentTerm, useBatchMarks, useStudentMarks,
} from '@/hooks/useApi';
import { useTheme } from '@/design';
import { curve, gutter, radius, space, touch, type as typeScale } from '@/design/tokens';
import { Avatar, Button, Empty, LoadingRows, Segmented, Text, Meter } from '@/ui';

/**
 * Entering marks.
 *
 * The most repeated task a teacher has, so the whole screen is built around
 * the loop of read a script, type a number, move on.
 *
 * The keyboard stays numeric and never dismisses between students. Each field
 * advances to the next on submit, so a teacher can go down a class of thirty
 * without touching the screen again after the first tap. Out of range values
 * are caught as they are typed rather than on save, because finding out at the
 * end that entry number nine was 105 means hunting for it.
 *
 * Nothing is saved until Save, and the count of what has been filled is always
 * visible, because being interrupted halfway through a class is the normal
 * case here.
 */
export default function MarksEntry() {
  const t = useTheme();
  const params = useLocalSearchParams<{ classSectionId?: string; className?: string }>();
  const teacherId = useAuthStore((s) => s.user?.teacherId);

  const { data: assignments } = useTeacherAssignments(teacherId);
  const { data: term } = useCurrentTerm();
  const { data: assessments } = useAssessmentTypes();
  const batch = useBatchMarks();

  const classes = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments ?? []) {
      const section: any = (a as any).classSection;
      if (section) map.set(section.id, section.name);
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [assignments]);

  const subjectsFor = (classId: string) => {
    const map = new Map<string, string>();
    for (const a of assignments ?? []) {
      const section: any = (a as any).classSection;
      const subject: any = (a as any).subject;
      if (section?.id === classId && subject) map.set(subject.id, subject.name);
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  };

  const [classId, setClassId] = useState(params.classSectionId ?? '');
  const [subjectId, setSubjectId] = useState('');
  const [assessmentId, setAssessmentId] = useState('');
  const [scores, setScores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!classId && classes.length) setClassId(classes[0].value);
  }, [classes, classId]);

  const subjects = useMemo(() => subjectsFor(classId), [assignments, classId]);
  useEffect(() => {
    if (subjects.length && !subjects.some((s) => s.value === subjectId)) setSubjectId(subjects[0].value);
  }, [subjects, subjectId]);
  useEffect(() => {
    if (assessments?.length && !assessmentId) setAssessmentId(assessments[0].id);
  }, [assessments, assessmentId]);

  const { data: students, isPending } = useClassStudents(classId);
  const inputs = useMemo(() => new Map<string, TextInput | null>(), []);

  const filled = Object.values(scores).filter((v) => v.trim() !== '').length;
  const total = (students as any[])?.length ?? 0;

  const setScore = (studentId: string, raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, '');
    setScores((prev) => ({ ...prev, [studentId]: cleaned }));
  };

  const invalid = (value: string) => {
    if (!value.trim()) return false;
    const n = Number(value);
    return Number.isNaN(n) || n < 0 || n > 100;
  };

  const anyInvalid = Object.values(scores).some(invalid);

  const save = () => {
    const records = Object.entries(scores)
      .filter(([, v]) => v.trim() !== '')
      .map(([studentId, v]) => ({ studentId, score: Number(v) }));

    if (!records.length) {
      toast.error('Nothing to save yet');
      return;
    }

    batch.mutate(
      { classSectionId: classId, subjectId, termId: term?.id, assessmentTypeId: assessmentId, marks: records } as never,
      {
        onSuccess: () => {
          toast.success(`Saved ${records.length} mark${records.length === 1 ? '' : 's'}`);
          setScores({});
        },
        onError: (e: any) =>
          toast.error(e?.response?.data?.message ?? 'Could not save those marks'),
      },
    );
  };

  if (!classes.length)
    return (
      <>
        <Stack.Screen options={{ title: 'Marks' }} />
        <View style={{ flex: 1, backgroundColor: t.bg.page }}>
          <Empty title="No classes to mark" body="Once the office assigns you a subject and a class, it will show up here." />
        </View>
      </>
    );

  return (
    <>
      <Stack.Screen options={{ title: params.className ?? 'Enter marks' }} />
      <View style={{ flex: 1, backgroundColor: t.bg.page }}>
        <View style={{ paddingHorizontal: gutter, paddingTop: space.md, gap: space.md }}>
          <Segmented value={classId} onChange={setClassId} options={classes} />
          {subjects.length ? <Segmented value={subjectId} onChange={setSubjectId} options={subjects} /> : null}
          {assessments?.length ? (
            <Segmented
              value={assessmentId}
              onChange={setAssessmentId}
              options={assessments.map((a) => ({ value: a.id, label: a.name }))}
            />
          ) : null}

          <Meter
            value={filled}
            max={total || 1}
            label={`${filled} of ${total} entered`}
            tone={filled === total && total > 0 ? 'positive' : 'brand'}
            showValue={false}
          />

          {term?.isClosed ? (
            <Text variant="footnote" tone="critical">
              This term is closed. Marks cannot be saved until an admin reopens it.
            </Text>
          ) : null}
        </View>

        <FlatList
          data={(students as any[]) ?? []}
          keyExtractor={(s) => s.id}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingTop: space.lg, paddingBottom: space.huge }}
          ListEmptyComponent={isPending ? <LoadingRows count={10} lead /> : null}
          renderItem={({ item, index }) => {
            const name = `${item.firstName ?? item.user?.firstName ?? ''} ${
              item.lastName ?? item.user?.lastName ?? ''
            }`.trim();
            const value = scores[item.id] ?? '';
            const bad = invalid(value);
            const list = (students as any[]) ?? [];

            return (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  paddingHorizontal: gutter,
                  paddingVertical: space.sm,
                  minHeight: touch.comfortable + 8,
                }}
              >
                <Avatar name={name} size="sm" />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" numberOfLines={1}>{name}</Text>
                  {item.studentIdNumber ? (
                    <Text variant="footnote" tone="tertiary">{item.studentIdNumber}</Text>
                  ) : null}
                </View>

                <TextInput
                  ref={(el) => { inputs.set(item.id, el); }}
                  value={value}
                  onChangeText={(v) => setScore(item.id, v)}
                  keyboardType="numeric"
                  returnKeyType={index === list.length - 1 ? 'done' : 'next'}
                  onSubmitEditing={() => {
                    const nextStudent = list[index + 1];
                    if (nextStudent) inputs.get(nextStudent.id)?.focus();
                  }}
                  blurOnSubmit={index === list.length - 1}
                  placeholder="-"
                  placeholderTextColor={t.fg.placeholder}
                  selectTextOnFocus
                  accessibilityLabel={`Mark for ${name}`}
                  style={[
                    typeScale.title3,
                    {
                      width: 76,
                      height: touch.min,
                      textAlign: 'center',
                      color: bad ? t.status.critical.text : t.fg.primary,
                      borderWidth: value ? 2 : 1,
                      borderColor: bad ? t.status.critical.solid : value ? t.brand.solid : t.line.border,
                      borderRadius: radius.md,
                      ...curve,
                    },
                  ]}
                />
              </View>
            );
          }}
        />

        <View
          style={{
            paddingHorizontal: gutter,
            paddingTop: space.md,
            paddingBottom: space.lg,
            borderTopWidth: 1,
            borderTopColor: t.line.hairline,
            gap: space.sm,
          }}
        >
          {anyInvalid ? (
            <Text variant="footnote" tone="critical">
              A mark is outside 0 to 100. Fix it before saving.
            </Text>
          ) : null}
          <Button
            label={`Save ${filled} mark${filled === 1 ? '' : 's'}`}
            kind="primary"
            block
            loading={batch.isPending}
            disabled={!filled || anyInvalid || Boolean(term?.isClosed)}
            onPress={save}
          />
        </View>
      </View>
    </>
  );
}
