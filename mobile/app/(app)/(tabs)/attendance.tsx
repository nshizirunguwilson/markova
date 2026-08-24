import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { toast } from 'sonner-native';
import { Check, X, Clock, Users } from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import {
  useTeacherAssignments,
  useClassStudents,
  useClassAttendance,
  useBulkAttendance,
} from '@/hooks/useApi';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { useTheme } from '@/design';
import { curve, gutter, radius, space, touch } from '@/design/tokens';
import { Avatar, Button, Empty, LoadingRows, Segmented, Text, Meter } from '@/ui';

/**
 * The register.
 *
 * The tightest constraints in the app. Used standing up, at the start of a
 * lesson, with thirty names to get through before teaching can begin, often on
 * a phone with no signal in a classroom with thick walls.
 *
 * Three decisions follow from that.
 *
 * Everyone starts present. A register where a teacher taps thirty times to
 * record what is already true is a register that gets filled in later from
 * memory, which is worse than not having one. They mark the exceptions, which
 * on a normal day is two or three people.
 *
 * The three states are one tap each, side by side, always on screen. No
 * sheets, no long press, no swipe. A hidden gesture is one that gets
 * demonstrated once and then forgotten.
 *
 * Saving survives having no signal. The offline queue was already in the app
 * and this screen did not use it, so a register taken in a classroom with no
 * bars was simply lost.
 */

type Status = 'PRESENT' | 'ABSENT' | 'LATE';

const today = () => new Date().toISOString().slice(0, 10);

export default function Register() {
  const t = useTheme();
  const teacherId = useAuthStore((s) => s.user?.teacherId);
  const { data: assignments } = useTeacherAssignments(teacherId);
  const { enqueue, queueSize } = useOfflineQueue();
  const save = useBulkAttendance();

  const classes = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments ?? []) {
      const section: any = (a as any).classSection;
      if (section) map.set(section.id, section.name);
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [assignments]);

  const [classId, setClassId] = useState<string>('');
  useEffect(() => {
    if (!classId && classes.length) setClassId(classes[0].value);
  }, [classes, classId]);

  const { data: students, isPending } = useClassStudents(classId);
  const { data: existing } = useClassAttendance(classId, today());

  const [marks, setMarks] = useState<Record<string, Status>>({});

  // Present until somebody says otherwise. If a register was already taken
  // today, start from what is on record rather than overwriting it blind.
  useEffect(() => {
    if (!students?.length) return;
    const seed: Record<string, Status> = {};
    for (const s of students as any[]) {
      const already = (existing as any[] | undefined)?.find((r) => r.studentId === s.id);
      seed[s.id] = (already?.status as Status) ?? 'PRESENT';
    }
    setMarks(seed);
  }, [students, existing]);

  const counts = useMemo(() => {
    const values = Object.values(marks);
    return {
      present: values.filter((v) => v === 'PRESENT').length,
      late: values.filter((v) => v === 'LATE').length,
      absent: values.filter((v) => v === 'ABSENT').length,
      total: values.length,
    };
  }, [marks]);

  const set = (studentId: string, status: Status) => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    setMarks((prev) => ({ ...prev, [studentId]: status }));
  };

  const submit = async () => {
    const payload = {
      classSectionId: classId,
      date: today(),
      type: 'DAILY' as const,
      records: Object.entries(marks).map(([studentId, status]) => ({ studentId, status })),
    };

    try {
      await save.mutateAsync(payload);
      toast.success(`Register saved. ${counts.present} present.`);
    } catch (error: any) {
      // No signal in a classroom is the normal case here, not the exception.
      if (!error?.response) {
        await enqueue(payload as never);
        toast.success('Saved on this phone. It will send itself once you have signal.');
      } else {
        toast.error(error?.response?.data?.message ?? 'Could not save that register');
      }
    }
  };

  if (!classes.length)
    return (
      <View style={{ flex: 1, backgroundColor: t.bg.page }}>
        <Empty
          icon={<Users size={30} color={t.fg.placeholder} strokeWidth={1.6} />}
          title="No classes to register"
          body="Once the office assigns you a class, the register will appear here."
        />
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.page }}>
      <View style={{ paddingHorizontal: gutter, paddingTop: space.md, gap: space.lg }}>
        <Segmented value={classId} onChange={setClassId} options={classes} />

        <Meter
          value={counts.present + counts.late}
          max={counts.total || 1}
          label={`${counts.present} present, ${counts.late} late, ${counts.absent} away`}
          tone={
            counts.absent === 0 ? 'positive' : counts.absent > counts.total / 4 ? 'critical' : 'caution'
          }
          showValue={false}
        />

        {queueSize > 0 ? (
          <Text variant="footnote" tone="caution" numeric>
            {queueSize} register{queueSize === 1 ? '' : 's'} waiting to send
          </Text>
        ) : null}
      </View>

      <FlatList
        data={(students as any[]) ?? []}
        keyExtractor={(s) => s.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingTop: space.lg, paddingBottom: space.huge }}
        ListEmptyComponent={isPending ? <LoadingRows count={10} lead /> : null}
        renderItem={({ item }) => {
          // useClassStudents always hands back the nested shape, whatever the
          // endpoint answered with, so there is only one place to look.
          const name = `${item.user?.firstName ?? ''} ${
            item.user?.lastName ?? ''
          }`.trim();
          const current = marks[item.id] ?? 'PRESENT';

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
                <Text variant="bodyMedium" numberOfLines={1}>
                  {name}
                </Text>
                {item.studentIdNumber ? (
                  <Text variant="footnote" tone="tertiary">
                    {item.studentIdNumber}
                  </Text>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', gap: space.xs }}>
                <Toggle
                  active={current === 'PRESENT'}
                  tone="positive"
                  icon={Check}
                  label={`Mark ${name} present`}
                  onPress={() => set(item.id, 'PRESENT')}
                />
                <Toggle
                  active={current === 'LATE'}
                  tone="caution"
                  icon={Clock}
                  label={`Mark ${name} late`}
                  onPress={() => set(item.id, 'LATE')}
                />
                <Toggle
                  active={current === 'ABSENT'}
                  tone="critical"
                  icon={X}
                  label={`Mark ${name} absent`}
                  onPress={() => set(item.id, 'ABSENT')}
                />
              </View>
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
        }}
      >
        <Button
          label="Save the register"
          kind="primary"
          block
          loading={save.isPending}
          disabled={!counts.total}
          onPress={submit}
        />
      </View>
    </View>
  );
}

/**
 * One of the three states. Filled when chosen, outlined when not, and the icon
 * carries the meaning as well as the colour so it still reads for anyone who
 * cannot separate the hues.
 */
function Toggle({
  active,
  tone,
  icon: Icon,
  label,
  onPress,
}: {
  active: boolean;
  tone: 'positive' | 'caution' | 'critical';
  icon: typeof Check;
  label: string;
  onPress: () => void;
}) {
  const t = useTheme();
  const colour = t.status[tone];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={4}
      style={{
        width: touch.min,
        height: touch.min,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: active ? colour.solid : 'transparent',
        borderWidth: active ? 0 : 1,
        borderColor: t.line.border,
        ...curve,
      }}
    >
      <Icon size={19} color={active ? '#FFFFFF' : t.fg.placeholder} strokeWidth={2.4} />
    </Pressable>
  );
}
