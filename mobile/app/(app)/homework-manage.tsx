import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, TextInput, RefreshControl, Modal, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Plus, BookOpen, Calendar, Users, ChevronDown, X, CheckCircle, Clock,
} from 'lucide-react-native';
import { toast } from 'sonner-native';
import { useAuthStore } from '@/stores/auth-store';
import {
  useTeacherAssignments, useHomeworkList, useCurrentTerm, useCreateHomework, useGradeSubmission,
} from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Button, Input } from '@/components/ui';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';
import type { Homework } from '@/types';

export default function HomeworkManageScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const { data: currentTerm } = useCurrentTerm();
  const { data: assignments } = useTeacherAssignments(user?.teacherId);
  const { data: homework, isLoading, refetch } = useHomeworkList({ termId: currentTerm?.id });
  const createHomework = useCreateHomework();

  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<Homework | null>(null);

  // Create form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [maxMarks, setMaxMarks] = useState('');
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleCreate = () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    if (!dueDate.trim()) { toast.error('Due date is required (YYYY-MM-DD)'); return; }
    if (!selectedAssignment) { toast.error('Select a class and subject'); return; }
    if (!currentTerm) { toast.error('No current term found'); return; }

    createHomework.mutate(
      {
        subjectId: selectedAssignment.subjectId,
        classSectionId: selectedAssignment.classSectionId,
        termId: currentTerm.id,
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate,
        maxMarks: maxMarks ? Number(maxMarks) : undefined,
      },
      {
        onSuccess: () => {
          toast.success('Homework created');
          setShowCreate(false);
          resetForm();
          refetch();
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.message ?? 'Failed to create homework');
        },
      }
    );
  };

  const resetForm = () => {
    setTitle(''); setDescription(''); setDueDate(''); setMaxMarks(''); setSelectedAssignment(null);
  };

  const now = new Date();

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Homework"
        onBack={() => router.back()}
        rightAction={
          <Pressable onPress={() => setShowCreate(true)} style={styles.addBtn}>
            <Plus size={22} color={colors.white} />
          </Pressable>
        }
      />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {isLoading ? (
          <LoadingScreen />
        ) : homework && homework.length > 0 ? (
          homework.map((hw) => {
            const isOverdue = new Date(hw.dueDate) < now;
            const submissionCount = hw.submissions?.length ?? 0;
            return (
              <Pressable key={hw.id} style={styles.hwCard} onPress={() => setSelectedDetail(hw)}>
                <View style={styles.hwHeader}>
                  <View style={styles.subjectBadge}>
                    <BookOpen size={14} color={colors.primary} />
                    <Text style={styles.subjectText}>{hw.subject?.name}</Text>
                  </View>
                  {isOverdue ? (
                    <Clock size={16} color={colors.danger} />
                  ) : (
                    <CheckCircle size={16} color={colors.success} />
                  )}
                </View>
                <Text style={styles.hwTitle}>{hw.title}</Text>
                <View style={styles.hwMeta}>
                  <Calendar size={14} color={colors.muted} />
                  <Text style={styles.hwDate}>
                    Due: {new Date(hw.dueDate).toLocaleDateString()}
                  </Text>
                  <Users size={14} color={colors.muted} />
                  <Text style={styles.hwDate}>{submissionCount} submissions</Text>
                </View>
              </Pressable>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <BookOpen size={32} color={colors.mutedLight} />
            <Text style={styles.noData}>No homework created yet.</Text>
          </View>
        )}
      </ScrollView>

      {/* Create Modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Homework</Text>
              <Pressable onPress={() => { setShowCreate(false); resetForm(); }}>
                <X size={24} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Assignment picker */}
              <Text style={styles.label}>Class & Subject</Text>
              <View style={styles.chipRow}>
                {assignments?.map((a) => (
                  <Pressable
                    key={a.id}
                    style={[styles.chip, selectedAssignment?.id === a.id && styles.chipActive]}
                    onPress={() => setSelectedAssignment(a)}
                  >
                    <Text style={[styles.chipText, selectedAssignment?.id === a.id && styles.chipTextActive]}>
                      {a.subject?.name} - {a.classSection?.name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Input label="Title" value={title} onChangeText={setTitle} placeholder="Homework title" />
              <Input
                label="Description (optional)"
                value={description}
                onChangeText={setDescription}
                placeholder="Instructions..."
                multiline
                numberOfLines={3}
                style={{ height: 80, textAlignVertical: 'top' }}
              />
              <Input
                label="Due Date (YYYY-MM-DD)"
                value={dueDate}
                onChangeText={setDueDate}
                placeholder="2026-04-01"
                keyboardType="numbers-and-punctuation"
              />
              <Input
                label="Max Marks (optional)"
                value={maxMarks}
                onChangeText={(t) => setMaxMarks(t.replace(/[^0-9]/g, ''))}
                placeholder="100"
                keyboardType="number-pad"
              />
              <Button
                title="Create Homework"
                onPress={handleCreate}
                loading={createHomework.isPending}
                fullWidth
                size="lg"
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={!!selectedDetail} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedDetail?.title}</Text>
              <Pressable onPress={() => setSelectedDetail(null)}>
                <X size={24} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedDetail?.description && (
                <Text style={styles.detailDesc}>{selectedDetail.description}</Text>
              )}
              <Text style={styles.detailMeta}>
                Subject: {selectedDetail?.subject?.name}{'\n'}
                Due: {selectedDetail?.dueDate ? new Date(selectedDetail.dueDate).toLocaleDateString() : '--'}{'\n'}
                Max Marks: {selectedDetail?.maxMarks ?? 'N/A'}
              </Text>

              <Text style={styles.sectionTitle}>
                Submissions ({selectedDetail?.submissions?.length ?? 0})
              </Text>
              {selectedDetail?.submissions?.map((sub) => (
                <SubmissionRow key={sub.id} submission={sub} maxMarks={selectedDetail.maxMarks} onGraded={() => { setSelectedDetail(null); refetch(); }} />
              ))}
              {(!selectedDetail?.submissions || selectedDetail.submissions.length === 0) && (
                <Text style={styles.noData}>No submissions yet.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SubmissionRow({ submission, maxMarks, onGraded }: { submission: any; maxMarks?: number; onGraded: () => void }) {
  const [marks, setMarks] = useState(submission.marks?.toString() ?? '');
  const grade = useGradeSubmission();

  const handleGrade = () => {
    if (!marks.trim()) return;
    grade.mutate(
      { submissionId: submission.id, marks: Number(marks) },
      { onSuccess: () => { toast.success('Graded'); onGraded(); } }
    );
  };

  return (
    <View style={styles.subRow}>
      <View style={styles.subInfo}>
        <Text style={styles.subName}>
          {submission.student?.user?.firstName} {submission.student?.user?.lastName}
        </Text>
        <Text style={styles.subDate}>
          {new Date(submission.submittedAt).toLocaleDateString()}
        </Text>
      </View>
      <TextInput
        style={styles.gradeInput}
        value={marks}
        onChangeText={(t) => setMarks(t.replace(/[^0-9]/g, ''))}
        placeholder="--"
        keyboardType="number-pad"
        maxLength={3}
      />
      <Pressable onPress={handleGrade} style={styles.gradeBtn}>
        <CheckCircle size={20} color={colors.success} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  hwCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2,
  },
  hwHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  subjectBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.accentLight, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  subjectText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  hwTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.foreground, marginBottom: spacing.sm },
  hwMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hwDate: { fontSize: fontSize.xs, color: colors.muted },
  emptyCard: { alignItems: 'center', padding: spacing['3xl'] },
  noData: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', marginTop: spacing.md },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing['2xl'], maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.foreground },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.foreground, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.xs, color: colors.foreground },
  chipTextActive: { color: colors.white },

  // Detail
  detailDesc: { fontSize: fontSize.sm, color: colors.foreground, lineHeight: 20, marginBottom: spacing.md },
  detailMeta: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 22, marginBottom: spacing.xl },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.foreground, marginBottom: spacing.md },

  // Submission
  subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  subInfo: { flex: 1 },
  subName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.foreground },
  subDate: { fontSize: fontSize.xs, color: colors.muted },
  gradeInput: {
    width: 50, height: 36, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    textAlign: 'center', fontSize: fontSize.sm, fontWeight: fontWeight.bold,
  },
  gradeBtn: { marginLeft: spacing.sm, padding: spacing.xs },
});
