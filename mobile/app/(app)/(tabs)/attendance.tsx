import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, Alert, FlatList,
  Platform, Vibration,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Smartphone, List, CheckCircle, XCircle, Clock, Send, ChevronDown,
  Users, Wifi, WifiOff, CreditCard, RefreshCw, CloudOff,
} from 'lucide-react-native';
import { toast } from 'sonner-native';
import { useAuthStore } from '@/stores/auth-store';
import {
  useTeacherAssignments, useClassStudents, useClassAttendance, useBulkAttendance,
  useCurrentTerm, useClassStudentsNfc, useNfcScan,
} from '@/hooks/useApi';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorScreen } from '@/components/ErrorScreen';
import { getErrorType, getErrorMessage } from '@/hooks/useQueryError';
import { Button } from '@/components/ui';
import { colors, fontSize, spacing, radius, fontFamily } from '@/constants/theme';
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

  const [step, setStep] = useState<'select-class' | 'take-attendance'>('select-class');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedClassName, setSelectedClassName] = useState('');
  const [mode, setMode] = useState<'manual' | 'nfc'>('manual');
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});

  // NFC state
  const [nfcScanning, setNfcScanning] = useState(false);
  const [scannedStudents, setScannedStudents] = useState<Set<string>>(new Set());
  const [nfcSupported, setNfcSupported] = useState<boolean | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const { data: currentTerm } = useCurrentTerm();
  const { data: assignments, isLoading: loadingAssignments, error: assignmentsError, refetch: refetchAssignments } = useTeacherAssignments(user?.teacherId);
  const { data: students, isLoading: loadingStudents } = useClassStudents(selectedClassId ?? undefined);
  const { data: existingAttendance } = useClassAttendance(selectedClassId ?? undefined, today);
  const { data: nfcStudents } = useClassStudentsNfc(selectedClassId ?? undefined);
  const bulkAttendance = useBulkAttendance();
  const nfcScanMutation = useNfcScan();
  const { queueSize, isProcessing, processNow, enqueue, isNetworkError: checkNetworkError } = useOfflineQueue();

  // Check NFC support
  useEffect(() => {
    if (Platform.OS === 'web') {
      setNfcSupported(false);
    } else {
      // On native, NFC would be checked via expo-nfc
      // For now, mark as supported on native platforms
      setNfcSupported(true);
    }
  }, []);

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

  // Student list for manual mode
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

  // NFC student list with scan status
  const nfcStudentList = useMemo(() => {
    if (!nfcStudents) return [];
    return nfcStudents.map((s) => ({
      ...s,
      scanned: scannedStudents.has(s.id),
      hasCard: !!s.nfcCardId,
    }));
  }, [nfcStudents, scannedStudents]);

  const selectClass = (classId: string, className: string) => {
    setSelectedClassId(classId);
    setSelectedClassName(className);
    setAttendanceMap({});
    setScannedStudents(new Set());
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

  // NFC scan handler — processes a scanned card ID
  const handleNfcCardScanned = async (cardId: string) => {
    if (!selectedClassId) return;

    // Match against local cache first
    const matched = nfcStudents?.find((s) => s.nfcCardId === cardId);
    if (!matched) {
      toast.error('Unrecognized card');
      return;
    }

    if (scannedStudents.has(matched.id)) {
      toast.info(`${matched.firstName} ${matched.lastName} already scanned`);
      return;
    }

    try {
      const result = await nfcScanMutation.mutateAsync({
        nfcCardId: cardId,
        classSectionId: selectedClassId,
      });

      setScannedStudents((prev) => new Set([...prev, matched.id]));
      if (Platform.OS !== 'web') Vibration.vibrate(100);

      const status = result.record?.status === 'LATE' ? '(Late)' : '';
      toast.success(`${matched.firstName} ${matched.lastName} ${status}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Scan failed');
    }
  };

  const handleSubmitManual = () => {
    const records = studentsList.map((s) => ({
      studentId: s.studentId,
      status: attendanceMap[s.studentId] ?? s.status,
    }));

    const absent = records.filter((r) => r.status === 'ABSENT').length;
    const late = records.filter((r) => r.status === 'LATE').length;

    Alert.alert(
      'Submit Attendance',
      `${records.length} students:\n\u2022 Present: ${records.length - absent - late}\n\u2022 Absent: ${absent}\n\u2022 Late: ${late}\n\nSubmit?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: () => {
            const payload = {
              classSectionId: selectedClassId!,
              date: today,
              type: 'DAILY' as const,
              records,
            };
            bulkAttendance.mutate(payload, {
              onSuccess: () => {
                toast.success('Attendance submitted successfully');
                setStep('select-class');
                setSelectedClassId(null);
                setAttendanceMap({});
              },
              onError: (err: any) => {
                if (checkNetworkError(err)) {
                  enqueue(payload);
                  toast.info('Saved offline — will sync when connected');
                  setStep('select-class');
                  setSelectedClassId(null);
                  setAttendanceMap({});
                } else {
                  toast.error(err?.response?.data?.message ?? 'Failed to submit attendance');
                }
              },
            });
          },
        },
      ]
    );
  };

  const handleFinishNfc = () => {
    const total = nfcStudentList.length;
    const scanned = scannedStudents.size;
    const unscanned = total - scanned;

    if (unscanned > 0) {
      Alert.alert(
        'Finish NFC Attendance',
        `${scanned} scanned, ${unscanned} not scanned.\n\nUnscanned students will be marked as ABSENT. Continue?`,
        [
          { text: 'Keep Scanning', style: 'cancel' },
          {
            text: 'Finish',
            onPress: () => {
              // Mark unscanned students as absent via bulk endpoint
              const records = nfcStudentList
                .filter((s) => !s.scanned)
                .map((s) => ({ studentId: s.id, status: 'ABSENT' as AttendanceStatus }));

              if (records.length > 0) {
                const payload = { classSectionId: selectedClassId!, date: today, type: 'DAILY' as const, records };
                bulkAttendance.mutate(payload, {
                  onSuccess: () => {
                    toast.success('Attendance completed');
                    setStep('select-class');
                    setSelectedClassId(null);
                    setScannedStudents(new Set());
                  },
                  onError: (err: any) => {
                    if (checkNetworkError(err)) {
                      enqueue(payload);
                      toast.info('Saved offline — will sync when connected');
                      setStep('select-class');
                      setSelectedClassId(null);
                      setScannedStudents(new Set());
                    } else {
                      toast.error(err?.response?.data?.message ?? 'Failed to submit');
                    }
                  },
                });
              } else {
                toast.success('Attendance completed');
                setStep('select-class');
                setSelectedClassId(null);
                setScannedStudents(new Set());
              }
            },
          },
        ]
      );
    } else {
      toast.success('All students scanned!');
      setStep('select-class');
      setSelectedClassId(null);
      setScannedStudents(new Set());
    }
  };

  const presentCount = studentsList.filter((s) => (attendanceMap[s.studentId] ?? s.status) === 'PRESENT').length;
  const absentCount = studentsList.filter((s) => (attendanceMap[s.studentId] ?? s.status) === 'ABSENT').length;
  const lateCount = studentsList.filter((s) => (attendanceMap[s.studentId] ?? s.status) === 'LATE').length;

  // ─── Select Class Step ───
  if (step === 'select-class') {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Take Attendance" subtitle={today} />

        {/* Offline queue banner */}
        {queueSize > 0 && (
          <View style={styles.offlineBanner}>
            <CloudOff size={18} color={colors.warning} />
            <Text style={styles.offlineBannerText}>
              {queueSize} attendance record{queueSize > 1 ? 's' : ''} pending sync
            </Text>
            <Pressable
              style={styles.syncButton}
              onPress={async () => {
                const processed = await processNow();
                if (processed > 0) {
                  toast.success(`Synced ${processed} record${processed > 1 ? 's' : ''}`);
                } else {
                  toast.error('Sync failed — will retry later');
                }
              }}
              disabled={isProcessing}
            >
              <RefreshCw size={14} color={colors.white} />
              <Text style={styles.syncButtonText}>{isProcessing ? 'Syncing...' : 'Sync Now'}</Text>
            </Pressable>
          </View>
        )}

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

          {mode === 'nfc' && !nfcSupported && (
            <View style={styles.nfcNotice}>
              <WifiOff size={24} color={colors.warning} />
              <Text style={styles.nfcText}>
                NFC is not available on this device. Please use a phone with NFC support, or switch to manual mode.
              </Text>
            </View>
          )}

          {mode === 'nfc' && nfcSupported && (
            <View style={styles.nfcNotice}>
              <CreditCard size={24} color={colors.primaryLight} />
              <Text style={styles.nfcText}>
                Select a class to start NFC scanning. Students will tap their cards on your phone to mark attendance.
              </Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Select Class</Text>
          {loadingAssignments ? (
            <LoadingScreen />
          ) : assignmentsError ? (
            <ErrorScreen type={getErrorType(assignmentsError)} message={getErrorMessage(assignmentsError)} onRetry={() => refetchAssignments()} />
          ) : classes.length > 0 ? (
            classes.map((cls) => (
              <Pressable
                key={cls.id}
                style={styles.classCard}
                onPress={() => selectClass(cls.id, cls.name)}
                disabled={mode === 'nfc' && !nfcSupported}
              >
                <Users size={22} color={colors.primary} />
                <View style={styles.classInfo}>
                  <Text style={styles.className}>{cls.name}</Text>
                  <Text style={styles.classSubtitle}>
                    {mode === 'nfc' ? 'Tap to start NFC scanning' : 'Tap to take attendance'}
                  </Text>
                </View>
                <ChevronDown size={20} color={colors.muted} style={{ transform: [{ rotate: '-90deg' }] }} />
              </Pressable>
            ))
          ) : (
            <Text style={styles.noData}>No classes assigned to you.</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // ─── NFC Mode ───
  if (mode === 'nfc') {
    const scannedCount = scannedStudents.size;
    const totalCount = nfcStudentList.length;
    const unregisteredCount = nfcStudentList.filter((s) => !s.hasCard).length;

    return (
      <View style={styles.container}>
        <ScreenHeader
          title={selectedClassName}
          subtitle="NFC Attendance"
          onBack={() => { setStep('select-class'); setSelectedClassId(null); setScannedStudents(new Set()); }}
        />
        <View style={styles.content}>
          {/* NFC scan header */}
          <View style={styles.nfcHeader}>
            <View style={styles.nfcIconContainer}>
              <Smartphone size={40} color={colors.primary} />
            </View>
            <Text style={styles.nfcHeaderTitle}>
              {nfcScanning ? 'Waiting for card...' : 'Ready to Scan'}
            </Text>
            <Text style={styles.nfcHeaderSub}>
              {scannedCount}/{totalCount} students scanned
            </Text>
            {unregisteredCount > 0 && (
              <Text style={styles.nfcWarning}>
                {unregisteredCount} student{unregisteredCount > 1 ? 's' : ''} without NFC cards registered
              </Text>
            )}
          </View>

          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBg}>
              <View
                style={[styles.progressFill, { width: totalCount > 0 ? `${(scannedCount / totalCount) * 100}%` : '0%' }]}
              />
            </View>
          </View>

          {/* Student scan list */}
          <FlatList
            data={nfcStudentList}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={[styles.nfcStudentRow, item.scanned && styles.nfcStudentScanned]}>
                <View style={[styles.nfcStudentIcon, {
                  backgroundColor: item.scanned ? colors.successWash : item.hasCard ? colors.surfaceMuted : colors.warningWash,
                }]}>
                  {item.scanned ? (
                    <CheckCircle size={20} color={colors.success} />
                  ) : item.hasCard ? (
                    <CreditCard size={20} color={colors.muted} />
                  ) : (
                    <XCircle size={20} color={colors.warning} />
                  )}
                </View>
                <View style={styles.nfcStudentInfo}>
                  <Text style={styles.nfcStudentName}>{item.firstName} {item.lastName}</Text>
                  <Text style={styles.nfcStudentSub}>
                    {item.scanned ? 'Scanned' : item.hasCard ? 'Waiting...' : 'No NFC card'}
                  </Text>
                </View>
                {item.scanned && (
                  <View style={[styles.statusChip, { backgroundColor: colors.success }]}>
                    <Text style={styles.statusChipText}>PRESENT</Text>
                  </View>
                )}
              </View>
            )}
            contentContainerStyle={{ paddingBottom: 100 }}
          />

          {/* Action bar */}
          <View style={styles.submitBar}>
            <Button
              title={`Finish (${scannedCount}/${totalCount})`}
              onPress={handleFinishNfc}
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

  // ─── Manual Mode ───
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
                    backgroundColor: status === 'PRESENT' ? colors.successWash : status === 'ABSENT' ? colors.dangerWash : colors.warningWash,
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
            onPress={handleSubmitManual}
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
    paddingVertical: spacing.md, borderRadius: radius.xl,
    borderWidth: 2, borderColor: colors.primary,
  },
  modeActive: { backgroundColor: colors.primary },
  modeText: { fontSize: fontSize.sm, fontFamily: fontFamily.semibold, color: colors.primary },
  modeTextActive: { color: colors.white },
  nfcNotice: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.accentLight, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.xl,
  },
  nfcText: { flex: 1, fontSize: fontSize.sm, color: colors.foreground, lineHeight: 20, fontFamily: fontFamily.regular },
  sectionTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.semibold, color: colors.foreground, marginBottom: spacing.md },
  classCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2,
  },
  classInfo: { flex: 1 },
  className: { fontSize: fontSize.base, fontFamily: fontFamily.semibold, color: colors.foreground },
  classSubtitle: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2, fontFamily: fontFamily.regular },
  noData: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', padding: spacing.xl, fontFamily: fontFamily.regular },

  // Counter bar
  counterBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  countBadge: { alignItems: 'center' },
  countValue: { fontSize: fontSize.lg, fontFamily: fontFamily.bold },
  countLabel: { fontSize: 10, color: colors.muted, fontFamily: fontFamily.regular },
  markAllBtn: {
    marginLeft: 'auto', backgroundColor: colors.successWash,
    borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  markAllText: { fontSize: fontSize.xs, fontFamily: fontFamily.semibold, color: colors.success },

  // Student rows
  studentRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted,
  },
  studentAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: fontSize.base, fontFamily: fontFamily.medium, color: colors.foreground },
  studentId: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1, fontFamily: fontFamily.regular },
  statusChip: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusChipText: { fontSize: fontSize.xs, fontFamily: fontFamily.bold, color: colors.white },

  // Submit bar
  submitBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white, padding: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
    shadowColor: colors.black, shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 5,
  },

  // NFC mode
  nfcHeader: {
    alignItems: 'center', padding: spacing.xl, backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  nfcIconContainer: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  nfcHeaderTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.bold, color: colors.foreground },
  nfcHeaderSub: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs, fontFamily: fontFamily.regular },
  nfcWarning: { fontSize: fontSize.xs, color: colors.warning, marginTop: spacing.sm, fontFamily: fontFamily.regular },
  progressContainer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.white },
  progressBg: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.success },
  nfcStudentRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted,
    backgroundColor: colors.white,
  },
  nfcStudentScanned: { backgroundColor: colors.successWash + '20' },
  nfcStudentIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  nfcStudentInfo: { flex: 1 },
  nfcStudentName: { fontSize: fontSize.base, fontFamily: fontFamily.medium, color: colors.foreground },
  nfcStudentSub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1, fontFamily: fontFamily.regular },

  // Offline queue banner
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.warningWash, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.warning + '40',
  },
  offlineBannerText: {
    flex: 1, fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.foreground,
  },
  syncButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.warning, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  syncButtonText: { fontSize: fontSize.xs, fontFamily: fontFamily.semibold, color: colors.white },
});
