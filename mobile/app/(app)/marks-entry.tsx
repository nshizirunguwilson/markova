import { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, TextInput, Alert, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Save, ChevronDown } from 'lucide-react-native';
import { toast } from 'sonner-native';
import { useAuthStore } from '@/stores/auth-store';
import {
  useTeacherAssignments, useClassStudents, useAssessmentTypes,
  useCurrentTerm, useBatchMarks,
} from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Button } from '@/components/ui';
import { colors, fontSize, spacing, radius, fontFamily } from '@/constants/theme';

type Step = 'select' | 'enter';

export default function MarksEntryScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState<Step>('select');
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<string>('');
  const [showAssessments, setShowAssessments] = useState(false);
  const [marksMap, setMarksMap] = useState<Record<string, string>>({});

  const { data: currentTerm } = useCurrentTerm();
  const { data: assignments, isLoading: loadingAssignments } = useTeacherAssignments(user?.teacherId);
  const { data: assessmentTypes } = useAssessmentTypes();
  const { data: students, isLoading: loadingStudents } = useClassStudents(
    selectedAssignment?.classSectionId
  );
  const batchMarks = useBatchMarks();

  const handleSelectAssignment = (assignment: any) => {
    setSelectedAssignment(assignment);
    setStep('enter');
    setMarksMap({});
  };

  const handleSubmit = () => {
    if (!currentTerm) {
      toast.error('No current term found. Please contact admin to set up the academic year.');
      return;
    }
    if (!selectedAssessment) {
      toast.error('Please select an assessment type');
      return;
    }

    const marks = Object.entries(marksMap)
      .filter(([, score]) => score.trim() !== '')
      .map(([studentId, score]) => ({
        studentId,
        score: Math.round(Number(score) * 100) / 100, // Round to 2 decimal places
        maxScore: 100,
      }));

    if (marks.length === 0) {
      toast.error('Please enter at least one mark');
      return;
    }

    const invalid = marks.find((m) => isNaN(m.score) || m.score < 0 || m.score > 100);
    if (invalid) {
      toast.error('All marks must be between 0 and 100');
      return;
    }

    const totalStudents = students?.length ?? 0;
    const enteredCount = marks.length;
    const missingCount = totalStudents - enteredCount;

    const confirmMsg = missingCount > 0
      ? `Submit ${enteredCount} marks? (${missingCount} students have no marks entered)`
      : `Submit ${enteredCount} marks for all students?`;

    Alert.alert('Submit Marks', confirmMsg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Submit',
        onPress: () => {
          batchMarks.mutate(
            {
              subjectId: selectedAssignment.subjectId,
              classSectionId: selectedAssignment.classSectionId,
              termId: currentTerm!.id,
              assessmentTypeId: selectedAssessment,
              marks,
            },
            {
              onSuccess: () => {
                toast.success('Marks submitted successfully');
                router.back();
              },
              onError: (err: any) => {
                toast.error(err?.response?.data?.message ?? 'Failed to submit marks');
              },
            }
          );
        },
      },
    ]);
  };

  const selectedAssessmentName = assessmentTypes?.find((a) => a.id === selectedAssessment)?.name;

  // ─── Select assignment ───
  if (step === 'select') {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Enter Marks" onBack={() => router.back()} />
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.sectionTitle}>Select Class & Subject</Text>
          {loadingAssignments ? (
            <LoadingScreen />
          ) : assignments && assignments.length > 0 ? (
            assignments.map((a) => (
              <Pressable key={a.id} style={styles.card} onPress={() => handleSelectAssignment(a)}>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{a.subject?.name ?? 'Subject'}</Text>
                  <Text style={styles.cardSubtitle}>
                    {a.classSection?.classLevel?.name} {a.classSection?.name}
                  </Text>
                </View>
                <ChevronDown size={20} color={colors.muted} style={{ transform: [{ rotate: '-90deg' }] }} />
              </Pressable>
            ))
          ) : (
            <Text style={styles.noData}>No assignments found.</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // ─── Enter marks ───
  return (
    <View style={styles.container}>
      <ScreenHeader
        title={selectedAssignment?.subject?.name ?? 'Marks'}
        subtitle={`${selectedAssignment?.classSection?.classLevel?.name ?? ''} ${selectedAssignment?.classSection?.name ?? ''}`}
        onBack={() => { setStep('select'); setSelectedAssignment(null); }}
      />
      <View style={styles.content}>
        {/* Assessment type picker */}
        <Pressable style={styles.pickerButton} onPress={() => setShowAssessments(!showAssessments)}>
          <Text style={selectedAssessment ? styles.pickerValue : styles.pickerPlaceholder}>
            {selectedAssessmentName ?? 'Select Assessment Type'}
          </Text>
          <ChevronDown size={18} color={colors.muted} />
        </Pressable>
        {showAssessments && (
          <View style={styles.dropdown}>
            {assessmentTypes?.map((at) => (
              <Pressable
                key={at.id}
                style={styles.dropdownItem}
                onPress={() => { setSelectedAssessment(at.id); setShowAssessments(false); }}
              >
                <Text style={styles.dropdownText}>{at.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Student list with mark inputs */}
        {loadingStudents ? (
          <LoadingScreen />
        ) : (
          <FlatList
            data={students ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.markRow}>
                <View style={styles.markStudent}>
                  <Text style={styles.markName}>
                    {item.user?.firstName} {item.user?.lastName}
                  </Text>
                  <Text style={styles.markId}>{item.studentIdNumber}</Text>
                </View>
                <TextInput
                  style={styles.markInput}
                  placeholder="--"
                  placeholderTextColor={colors.muted}
                  value={marksMap[item.id] ?? ''}
                  onChangeText={(text) => setMarksMap((prev) => ({ ...prev, [item.id]: text.replace(/[^0-9]/g, '') }))}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <Text style={styles.maxMark}>/100</Text>
              </View>
            )}
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )}

        {/* Submit */}
        <View style={styles.submitBar}>
          <Button
            title="Save Marks"
            onPress={handleSubmit}
            loading={batchMarks.isPending}
            fullWidth
            size="lg"
            icon={<Save size={18} color={colors.white} />}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },
  sectionTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.semibold, color: colors.foreground, marginBottom: spacing.md },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2,
  },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: fontSize.base, fontFamily: fontFamily.semibold, color: colors.foreground },
  cardSubtitle: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2, fontFamily: fontFamily.regular },
  noData: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', padding: spacing.xl, fontFamily: fontFamily.regular },

  pickerButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg,
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  pickerValue: { fontSize: fontSize.base, color: colors.foreground, fontFamily: fontFamily.regular },
  pickerPlaceholder: { fontSize: fontSize.base, color: colors.muted, fontFamily: fontFamily.regular },
  dropdown: {
    backgroundColor: colors.white, borderRadius: radius.xl, marginHorizontal: spacing.lg,
    borderWidth: 1, borderColor: colors.border, marginTop: spacing.xs,
  },
  dropdownItem: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted },
  dropdownText: { fontSize: fontSize.sm, color: colors.foreground, fontFamily: fontFamily.regular },

  markRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted,
  },
  markStudent: { flex: 1 },
  markName: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.foreground },
  markId: { fontSize: fontSize.xs, color: colors.muted, fontFamily: fontFamily.regular },
  markInput: {
    width: 60, height: 40, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    textAlign: 'center', fontSize: fontSize.base, fontFamily: fontFamily.bold, color: colors.foreground,
    backgroundColor: colors.white,
  },
  maxMark: { fontSize: fontSize.sm, color: colors.muted, marginLeft: spacing.xs, fontFamily: fontFamily.regular },

  submitBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white, padding: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
});
