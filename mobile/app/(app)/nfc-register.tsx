import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Alert, TextInput, Platform, Vibration,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  CreditCard, Search, CheckCircle, Smartphone, User, XCircle,
} from 'lucide-react-native';
import { toast } from 'sonner-native';
import { useAuthStore } from '@/stores/auth-store';
import { useTeacherAssignments, useClassStudentsNfc, useRegisterNfcCard } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Button } from '@/components/ui/Button';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

type Step = 'select-class' | 'student-list' | 'scan-card';

export default function NfcRegisterScreen() {
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState<Step>('select-class');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedClassName, setSelectedClassName] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; firstName: string; lastName: string } | null>(null);
  const [search, setSearch] = useState('');
  const [manualCardId, setManualCardId] = useState('');

  const { data: assignments, isLoading: loadingAssignments } = useTeacherAssignments(user?.teacherId);
  const { data: students, isLoading: loadingStudents, refetch } = useClassStudentsNfc(selectedClassId ?? undefined);
  const registerNfc = useRegisterNfcCard();

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

  const filteredStudents = useMemo(() => {
    if (!students) return [];
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter((s) =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
      s.studentIdNumber.toLowerCase().includes(q)
    );
  }, [students, search]);

  const registeredCount = students?.filter((s) => s.nfcCardId).length ?? 0;
  const totalCount = students?.length ?? 0;

  const handleRegister = async (cardId: string) => {
    if (!selectedStudent || !cardId.trim()) return;

    try {
      await registerNfc.mutateAsync({
        studentId: selectedStudent.id,
        nfcCardId: cardId.trim(),
      });
      if (Platform.OS !== 'web') Vibration.vibrate(200);
      toast.success(`Card registered for ${selectedStudent.firstName} ${selectedStudent.lastName}`);
      setStep('student-list');
      setSelectedStudent(null);
      setManualCardId('');
      refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to register card');
    }
  };

  const handleUnregister = (student: { id: string; firstName: string; lastName: string; nfcCardId: string | null }) => {
    if (!student.nfcCardId) return;
    Alert.alert(
      'Remove NFC Card',
      `Remove the NFC card from ${student.firstName} ${student.lastName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await registerNfc.mutateAsync({ studentId: student.id, nfcCardId: '' });
              toast.success('NFC card removed');
              refetch();
            } catch (err: any) {
              toast.error(err?.response?.data?.message ?? 'Failed to remove card');
            }
          },
        },
      ]
    );
  };

  // ─── Step 1: Select Class ───
  if (step === 'select-class') {
    return (
      <View style={styles.container}>
        <ScreenHeader title="NFC Card Registration" subtitle="Link student cards" />
        <View style={styles.content}>
          <View style={styles.infoBox}>
            <CreditCard size={24} color={colors.primaryLight} />
            <Text style={styles.infoText}>
              Register student NFC chip cards so they can tap to mark attendance. Select a class to begin.
            </Text>
          </View>

          {loadingAssignments ? (
            <LoadingScreen />
          ) : classes.length > 0 ? (
            <FlatList
              data={classes}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.classCard}
                  onPress={() => {
                    setSelectedClassId(item.id);
                    setSelectedClassName(item.name);
                    setStep('student-list');
                  }}
                >
                  <User size={22} color={colors.primary} />
                  <View style={styles.classInfo}>
                    <Text style={styles.className}>{item.name}</Text>
                    <Text style={styles.classSub}>Tap to manage NFC cards</Text>
                  </View>
                </Pressable>
              )}
              contentContainerStyle={{ padding: spacing.lg }}
            />
          ) : (
            <Text style={styles.noData}>No classes assigned.</Text>
          )}
        </View>
      </View>
    );
  }

  // ─── Step 3: Scan/Enter Card ───
  if (step === 'scan-card' && selectedStudent) {
    return (
      <View style={styles.container}>
        <ScreenHeader
          title="Register Card"
          subtitle={`${selectedStudent.firstName} ${selectedStudent.lastName}`}
          onBack={() => { setStep('student-list'); setSelectedStudent(null); setManualCardId(''); }}
        />
        <View style={styles.scanContent}>
          <View style={styles.scanIconContainer}>
            <Smartphone size={48} color={colors.primary} />
          </View>
          <Text style={styles.scanTitle}>Tap NFC Card on Phone</Text>
          <Text style={styles.scanSub}>
            Hold the student's chip card against the back of your phone to read the card ID.
          </Text>

          {Platform.OS === 'web' && (
            <View style={styles.webFallback}>
              <Text style={styles.webFallbackTitle}>NFC not available on web</Text>
              <Text style={styles.webFallbackSub}>Enter the card ID manually:</Text>
              <TextInput
                style={styles.cardInput}
                placeholder="Enter card UID..."
                placeholderTextColor={colors.muted}
                value={manualCardId}
                onChangeText={setManualCardId}
                autoCapitalize="characters"
              />
              <Button
                title="Register Card"
                onPress={() => handleRegister(manualCardId)}
                loading={registerNfc.isPending}
                disabled={!manualCardId.trim()}
                fullWidth
                icon={<CreditCard size={18} color={colors.white} />}
              />
            </View>
          )}

          {Platform.OS !== 'web' && (
            <View style={styles.nativeNfc}>
              <Text style={styles.nfcWaiting}>Waiting for NFC card...</Text>
              <Text style={styles.scanSub}>Or enter the card ID manually:</Text>
              <TextInput
                style={styles.cardInput}
                placeholder="Card UID"
                placeholderTextColor={colors.muted}
                value={manualCardId}
                onChangeText={setManualCardId}
                autoCapitalize="characters"
              />
              <Button
                title="Register Manually"
                onPress={() => handleRegister(manualCardId)}
                loading={registerNfc.isPending}
                disabled={!manualCardId.trim()}
                fullWidth
                variant="outline"
              />
            </View>
          )}
        </View>
      </View>
    );
  }

  // ─── Step 2: Student List ───
  return (
    <View style={styles.container}>
      <ScreenHeader
        title={selectedClassName}
        subtitle={`${registeredCount}/${totalCount} cards registered`}
        onBack={() => { setStep('select-class'); setSelectedClassId(null); setSearch(''); }}
      />
      <View style={styles.content}>
        {/* Progress */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: totalCount > 0 ? `${(registeredCount / totalCount) * 100}%` : '0%' }]} />
          </View>
          <Text style={styles.progressText}>{registeredCount}/{totalCount} registered</Text>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <Search size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search students..."
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {loadingStudents ? (
          <LoadingScreen />
        ) : (
          <FlatList
            data={filteredStudents}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                style={styles.studentRow}
                onPress={() => {
                  if (item.nfcCardId) {
                    handleUnregister(item);
                  } else {
                    setSelectedStudent({ id: item.id, firstName: item.firstName, lastName: item.lastName });
                    setStep('scan-card');
                  }
                }}
              >
                <View style={[styles.studentIcon, {
                  backgroundColor: item.nfcCardId ? colors.successWash : colors.surfaceMuted,
                }]}>
                  {item.nfcCardId ? (
                    <CheckCircle size={20} color={colors.success} />
                  ) : (
                    <CreditCard size={20} color={colors.muted} />
                  )}
                </View>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>{item.firstName} {item.lastName}</Text>
                  <Text style={styles.studentSub}>
                    {item.nfcCardId ? `Card: ${item.nfcCardId.slice(0, 8)}...` : 'No card registered'}
                  </Text>
                </View>
                <Text style={[styles.actionText, { color: item.nfcCardId ? colors.danger : colors.primary }]}>
                  {item.nfcCardId ? 'Remove' : 'Register'}
                </Text>
              </Pressable>
            )}
            contentContainerStyle={{ paddingBottom: spacing['5xl'] }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.accentLight, borderRadius: radius.xl, padding: spacing.lg,
    margin: spacing.lg,
  },
  infoText: { flex: 1, fontSize: fontSize.sm, color: colors.foreground, lineHeight: 20 },
  classCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2,
  },
  classInfo: { flex: 1 },
  className: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.foreground },
  classSub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  noData: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', padding: spacing.xl },

  // Progress
  progressContainer: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  progressBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.success },
  progressText: { fontSize: fontSize.xs, color: colors.muted, fontWeight: fontWeight.medium },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, marginHorizontal: spacing.lg, marginVertical: spacing.sm,
    borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, color: colors.foreground, height: 36 },

  // Student rows
  studentRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted, backgroundColor: colors.white,
  },
  studentIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.foreground },
  studentSub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1 },
  actionText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

  // Scan screen
  scanContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  scanIconContainer: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl,
  },
  scanTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.foreground, marginBottom: spacing.sm },
  scanSub: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl },
  webFallback: { width: '100%', marginTop: spacing.lg },
  webFallbackTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.warning, textAlign: 'center', marginBottom: spacing.xs },
  webFallbackSub: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', marginBottom: spacing.md },
  cardInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    fontSize: fontSize.base, color: colors.foreground, backgroundColor: colors.white,
    marginBottom: spacing.lg, width: '100%',
  },
  nativeNfc: { width: '100%', alignItems: 'center', marginTop: spacing.lg },
  nfcWaiting: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.primary, marginBottom: spacing.xl },
});
