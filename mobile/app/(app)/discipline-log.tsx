import { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, Plus, X, ChevronDown } from 'lucide-react-native';
import { toast } from 'sonner-native';
import { useAuthStore } from '@/stores/auth-store';
import {
  useTeacherAssignments, useClassStudents, useCurrentTerm, useCreateIncident,
} from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Input } from '@/components/ui';
import { colors, fontSize, spacing, radius, fontFamily } from '@/constants/theme';

const ACTIONS = [
  'VERBAL_WARNING',
  'WRITTEN_WARNING',
  'DETENTION',
  'SUSPENSION',
  'EXPULSION',
] as const;

export default function DisciplineLogScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { data: currentTerm } = useCurrentTerm();
  const { data: assignments } = useTeacherAssignments(user?.teacherId);
  const createIncident = useCreateIncident();

  const [showCreate, setShowCreate] = useState(true); // Start with form open
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [description, setDescription] = useState('');
  const [points, setPoints] = useState('');
  const [action, setAction] = useState<string>('');
  const [location, setLocation] = useState('');

  const { data: students } = useClassStudents(selectedClassId || undefined);

  // Unique classes
  const classes = assignments
    ? [...new Map(assignments.map((a) => [a.classSectionId, a])).values()]
    : [];

  const handleSubmit = () => {
    if (!selectedClassId) { toast.error('Select a class first'); return; }
    if (!selectedStudentId) { toast.error('Select a student'); return; }
    if (!description.trim()) { toast.error('Description is required'); return; }
    if (description.trim().length < 10) { toast.error('Description must be at least 10 characters'); return; }
    if (!points.trim()) { toast.error('Points deducted is required'); return; }
    const numPoints = Number(points);
    if (isNaN(numPoints) || numPoints < 0 || numPoints > 100) { toast.error('Points must be between 0 and 100'); return; }
    if (!Number.isInteger(numPoints)) { toast.error('Points must be a whole number'); return; }
    if (!action) { toast.error('Select an action taken'); return; }
    if (!currentTerm) { toast.error('No current term found. Please contact admin.'); return; }

    createIncident.mutate(
      {
        studentId: selectedStudentId,
        termId: currentTerm.id,
        date: new Date().toISOString().split('T')[0],
        description: description.trim(),
        pointsDeducted: numPoints,
        actionTaken: action,
        location: location.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Incident recorded');
          router.back();
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.message ?? 'Failed to record incident');
        },
      }
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Log Discipline Incident" onBack={() => router.back()} />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.warningBanner}>
          <AlertTriangle size={20} color={colors.warning} />
          <Text style={styles.warningText}>
            This will be recorded on the student's discipline profile and visible to parents.
          </Text>
        </View>

        {/* Class selector */}
        <Text style={styles.label}>Select Class</Text>
        <View style={styles.chipRow}>
          {classes.map((a) => (
            <Pressable
              key={a.classSectionId}
              style={[styles.chip, selectedClassId === a.classSectionId && styles.chipActive]}
              onPress={() => { setSelectedClassId(a.classSectionId); setSelectedStudentId(''); }}
            >
              <Text style={[styles.chipText, selectedClassId === a.classSectionId && styles.chipTextActive]}>
                {a.classSection?.classLevel?.name} {a.classSection?.name}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Student selector */}
        {selectedClassId && (
          <>
            <Text style={styles.label}>Select Student</Text>
            <View style={styles.chipRow}>
              {students?.map((s) => (
                <Pressable
                  key={s.id}
                  style={[styles.chip, selectedStudentId === s.id && styles.chipActive]}
                  onPress={() => setSelectedStudentId(s.id)}
                >
                  <Text style={[styles.chipText, selectedStudentId === s.id && styles.chipTextActive]}>
                    {s.user?.firstName} {s.user?.lastName}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Action selector */}
        <Text style={styles.label}>Action Taken</Text>
        <View style={styles.chipRow}>
          {ACTIONS.map((a) => (
            <Pressable
              key={a}
              style={[styles.chip, action === a && styles.chipDanger]}
              onPress={() => setAction(a)}
            >
              <Text style={[styles.chipText, action === a && styles.chipTextActive]}>
                {a.replace(/_/g, ' ')}
              </Text>
            </Pressable>
          ))}
        </View>

        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the incident..."
          multiline
          numberOfLines={4}
          style={{ height: 100, textAlignVertical: 'top' }}
        />

        <Input
          label="Points Deducted"
          value={points}
          onChangeText={(t) => setPoints(t.replace(/[^0-9]/g, ''))}
          placeholder="5"
          keyboardType="number-pad"
        />

        <Input
          label="Location (optional)"
          value={location}
          onChangeText={setLocation}
          placeholder="Classroom, playground, etc."
        />

        <Button
          title="Record Incident"
          onPress={handleSubmit}
          loading={createIncident.isPending}
          fullWidth
          size="lg"
          variant="danger"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },
  warningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.warningWash, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.xl,
  },
  warningText: { flex: 1, fontSize: fontSize.sm, color: colors.foreground, lineHeight: 20, fontFamily: fontFamily.regular },
  label: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.foreground, marginBottom: spacing.sm, marginTop: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  chipText: { fontSize: fontSize.xs, color: colors.foreground, fontFamily: fontFamily.medium },
  chipTextActive: { color: colors.white },
});
