import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, Alert, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Smartphone, List, CheckCircle, XCircle, Clock, Send, ChevronDown,
  Users,
} from 'lucide-react-native';
import { toast } from 'sonner-native';
import { useAuthStore } from '@/stores/auth-store';
import {
  useTeacherAssignments, useClassStudents, useClassAttendance, useBulkAttendance, useCurrentTerm,
} from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Button } from '@/components/ui';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';
import type { Student } from '@/types';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE';

interface StudentAttendance {
  studentId: string;
  student: Student;
  status: AttendanceStatus;
}

export default function AttendanceScreen() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  // Step state
  const [step, setStep] = useState<'select-class' | 'take-attendance' | 'review'>('select-class');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedClassName, setSelectedClassName] = useState('');
  const [mode, setMode] = useState<'manual' | 'nfc'>('manual');
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});

  const today = new Date().toISOString().split('T')[0];
  const { data: currentTerm } = useCurrentTerm();
  const { data: assignments, isLoading: loadingAssignments } = useTeacherAssignments(user?.teacherId);
  const { data: students, isLoading: loadingStudents } = useClassStudents(selectedClassId ?? undefined);
  const { data: existingAttendance } = useClassAttendance(selectedClassId ?? undefined, today);
  const bulkAttendance = useBulkAttendance();

  // Unique classes from assignments
  const classes = useMemo(() => {
    if (!assignments) return [];
    const map = new Map<string, { id: string; name: string }>();
    assignments.forEach((a) => {
      if (a.classSection && !map.has(a.classSectionId)) {
        map.set(a.classSectionId, {
          id: a.classSectionId,
          name: `${a.classSection.classLevel?.name ?? ''} ${a.classSection.name}`.trim(),
        });
      }
    });
    return Array.from(map.values());
  }, [assignments]);

  // Initialize attendance map when students load
  const studentsList = useMemo(() => {
    if (!students) return [];
    return students.map((s) => {
      const existing = existingAttendance?.find((r) => r.studentId === s.id);
      return {
        studentId: s.id,
        student: s,
        status: (attendanceMap[s.id] ?? existing?.status ?? 'PRESENT') as AttendanceStatus,
      };
    });
  }, [students, existingAttendance, attendanceMap]);

  const selectClass = (classId: string, className: string) => {
    setSelectedClassId(classId);
    setSelectedClassName(className);
    setAttendanceMap({});
    setStep('take-attendance');
  };

  const toggleStatus = (studentId: string) => {
    setAttendanceMap((prev) => {
      const current = prev[studentId] ?? studentsList.find((s) => s.studentId === studentId)?.status ?? 'PRESENT';
      const next: AttendanceStatus =
        current === 'PRESENT' ? 'ABSENT' : current === 'ABSENT' ? 'LATE' : 'PRESENT';
      return { ...prev, [studentId]: next };
    });
  };

  const markAllPresent = () => {
    const map: Record<string, AttendanceStatus> = {};
    studentsList.forEach((s) => { map[s.studentId] = 'PRESENT'; });
    setAttendanceMap(map);
  };

  const handleSubmit = () => {
    const records = studentsList.map((s) => ({
      studentId: s.studentId,
      status: attendanceMap[s.studentId] ?? s.status,
    }));

    const absent = records.filter((r) => r.status === 'ABSENT').length;
    const late = records.filter((r) => r.status === 'LATE').length;

    Alert.alert(
      'Submit Attendance',
      `${records.length} students:\n• Present: ${records.length - absent - late}\n• Absent: ${absent}\n• Late: ${late}\n\nSubmit?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: () => {
            bulkAttendance.mutate(
              {
                classSectionId: selectedClassId!,
                date: today,
                type: 'DAILY',
                records,
              },
              {
                onSuccess: () => {
                  toast.success('Attendance submitted successfully');
                  setStep('select-class');
                  setSelectedClassId(null);
                  setAttendanceMap({});
                },
                onError: (err: any) => {
                  toast.error(err?.response?.data?.message ?? 'Failed to submit attendance');
                },
              }
            );
          },
        },
      ]
    );
  };

  const presentCount = studentsList.filter((s) => (attendanceMap[s.studentId] ?? s.status) === 'PRESENT').length;
  const absentCount = studentsList.filter((s) => (attendanceMap[s.studentId] ?? s.status) === 'ABSENT').length;
  const lateCount = studentsList.filter((s) => (attendanceMap[s.studentId] ?? s.status) === 'LATE').length;

  // ─── Select Class Step ───
  if (step === 'select-class') {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Take Attendance" subtitle={today} />
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Mode selector */}
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeButton, mode === 'manual' && styles.modeActive]}
              onPress={() => setMode('manual')}
            >
              <List size={20} color={mode === 'manual' ? colors.white : colors.primary} />
              <Text style={[styles.modeText, mode === 'manual' && styles.modeTextActive]}>Manual List</Text>
            </Pressable>
            <Pressable
              style={[styles.modeButton, mode === 'nfc' && styles.modeActive]}
              onPress={() => setMode('nfc')}
            >
              <Smartphone size={20} color={mode === 'nfc' ? colors.white : colors.primary} />
              <Text style={[styles.modeText, mode === 'nfc' && styles.modeTextActive]}>NFC Scan</Text>
            </Pressable>
          </View>

          {mode === 'nfc' && (
            <View style={styles.nfcNotice}>
              <Smartphone size={24} color={colors.primaryLight} />
              <Text style={styles.nfcText}>
                NFC attendance requires the student NFC cards to be registered first. This feature will be available once the card registration is complete.
              </Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Select Class</Text>
          {loadingAssignments ? (
            <LoadingScreen />
          ) : classes.length > 0 ? (
            classes.map((cls) => (
              <Pressable
                key={cls.id}
                style={styles.classCard}
                onPress={() => selectClass(cls.id, cls.name)}
              >
                <Users size={22} color={colors.primary} />
                <View style={styles.classInfo}>
                  <Text style={styles.className}>{cls.name}</Text>
                  <Text style={styles.classSubtitle}>Tap to take attendance</Text>
                </View>
                <ChevronDown size={20} color={colors.mutedLight} style={{ transform: [{ rotate: '-90deg' }] }} />
              </Pressable>
            ))
          ) : (
            <Text style={styles.noData}>No classes assigned to you.</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // ─── Take Attendance Step ───
  return (
    <View style={styles.container}>
      <ScreenHeader
        title={selectedClassName}
        subtitle={`${studentsList.length} students`}
        onBack={() => { setStep('select-class'); setSelectedClassId(null); }}
      />
      <View style={styles.content}>
        {/* Counter bar */}
        <View style={styles.counterBar}>
          <CountBadge label="Present" count={presentCount} color={colors.success} />
          <CountBadge label="Absent" count={absentCount} color={colors.danger} />
          <CountBadge label="Late" count={lateCount} color={colors.warning} />
          <Pressable onPress={markAllPresent} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>All Present</Text>
          </Pressable>
        </View>

        {/* Student list */}
        {loadingStudents ? (
          <LoadingScreen />
        ) : (
          <FlatList
            data={studentsList}
            keyExtractor={(item) => item.studentId}
            renderItem={({ item }) => {
              const status = attendanceMap[item.studentId] ?? item.status;
              return (
                <Pressable style={styles.studentRow} onPress={() => toggleStatus(item.studentId)}>
                  <View style={[styles.studentAvatar, {
                    backgroundColor: status === 'PRESENT' ? colors.successLight : status === 'ABSENT' ? colors.dangerLight : colors.warningLight,
                  }]}>
                    {status === 'PRESENT' && <CheckCircle size={20} color={colors.success} />}
                    {status === 'ABSENT' && <XCircle size={20} color={colors.danger} />}
                    {status === 'LATE' && <Clock size={20} color={colors.warning} />}
                  </View>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>
                      {item.student.user?.firstName} {item.student.user?.lastName}
                    </Text>
                    <Text style={styles.studentId}>{item.student.studentIdNumber}</Text>
                  </View>
                  <View style={[styles.statusChip, {
                    backgroundColor: status === 'PRESENT' ? colors.success : status === 'ABSENT' ? colors.danger : colors.warning,
                  }]}>
                    <Text style={styles.statusChipText}>{status}</Text>
                  </View>
                </Pressable>
              );
            }}
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )}

        {/* Submit button */}
        <View style={styles.submitBar}>
          <Button
            title="Submit Attendance"
            onPress={handleSubmit}
            loading={bulkAttendance.isPending}
            fullWidth
            size="lg"
            icon={<Send size={18} color={colors.white} />}
          />
        </View>
      </View>
    </View>
  );
}

function CountBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={styles.countBadge}>
      <Text style={[styles.countValue, { color }]}>{count}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },
  modeRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  modeButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.primary,
  },
  modeActive: { backgroundColor: colors.primary },
  modeText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary },
  modeTextActive: { color: colors.white },
  nfcNotice: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.accentLight, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl,
  },
  nfcText: { flex: 1, fontSize: fontSize.sm, color: colors.foreground, lineHeight: 20 },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.foreground, marginBottom: spacing.md },
  classCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2,
  },
  classInfo: { flex: 1 },
  className: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.foreground },
  classSubtitle: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  noData: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', padding: spacing.xl },

  // Counter bar
  counterBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  countBadge: { alignItems: 'center' },
  countValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  countLabel: { fontSize: 10, color: colors.muted },
  markAllBtn: {
    marginLeft: 'auto', backgroundColor: colors.successLight,
    borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  markAllText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.success },

  // Student rows
  studentRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  studentAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.foreground },
  studentId: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1 },
  statusChip: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusChipText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.white },

  // Submit bar
  submitBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white, padding: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
    shadowColor: colors.black, shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 5,
  },
});
