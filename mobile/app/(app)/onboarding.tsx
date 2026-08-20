import { useState, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  School, Calendar, Layers, BookOpen, ClipboardList, CheckCircle, Plus, Trash2,
  ChevronRight, ChevronLeft,
} from 'lucide-react-native';
import { toast } from 'sonner-native';
import api from '@/lib/api';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { colors, fontSize, spacing, radius, fontFamily } from '@/constants/theme';

// ─── Types ──────────────────────────────────────────────

interface SchoolInfo {
  school_name: string;
  school_motto: string;
  school_address: string;
}

interface AcademicYearForm {
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

interface TermForm {
  name: string;
  startDate: string;
  endDate: string;
}

interface ClassLevelForm {
  name: string;
}

interface SectionForm {
  name: string;
}

interface SubjectForm {
  name: string;
  code: string;
  maxMarks: string;
}

interface AssessmentTypeForm {
  name: string;
  weight: string;
}

const STEPS = [
  { label: 'School Info', icon: School },
  { label: 'Academic Setup', icon: Calendar },
  { label: 'Class Structure', icon: Layers },
  { label: 'Subjects', icon: BookOpen },
  { label: 'Assessments', icon: ClipboardList },
  { label: 'Done', icon: CheckCircle },
];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ─── Main Component ─────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Step 1: School Info
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo>({
    school_name: '',
    school_motto: '',
    school_address: '',
  });

  // Step 2: Academic Year & Terms
  const [academicYear, setAcademicYear] = useState<AcademicYearForm>({
    name: '',
    startDate: '',
    endDate: '',
    isCurrent: true,
  });
  const [terms, setTerms] = useState<TermForm[]>([
    { name: 'Term 1', startDate: '', endDate: '' },
  ]);

  // Step 3: Class Levels & Sections
  const [classLevels, setClassLevels] = useState<ClassLevelForm[]>([
    { name: 'Form 1' },
  ]);
  const [sections, setSections] = useState<SectionForm[]>([
    { name: 'A' },
  ]);

  // Step 4: Subjects
  const [subjects, setSubjects] = useState<SubjectForm[]>([
    { name: '', code: '', maxMarks: '100' },
  ]);

  // Step 5: Assessment Types
  const [assessmentTypes, setAssessmentTypes] = useState<AssessmentTypeForm[]>([
    { name: '', weight: '' },
  ]);

  // Saved IDs from API responses
  const [savedAcademicYearId, setSavedAcademicYearId] = useState<string | null>(null);

  // ─── Validation ─────────────────────────────────────────

  function validateStep(): boolean {
    const errs: Record<string, string> = {};

    if (step === 0) {
      if (!schoolInfo.school_name.trim()) errs.school_name = 'School name is required';
      if (!schoolInfo.school_address.trim()) errs.school_address = 'Address is required';
    }

    if (step === 1) {
      if (!academicYear.name.trim()) errs.ay_name = 'Academic year name is required';
      if (!academicYear.startDate.trim()) errs.ay_start = 'Start date is required';
      else if (!DATE_REGEX.test(academicYear.startDate)) errs.ay_start = 'Use YYYY-MM-DD format';
      if (!academicYear.endDate.trim()) errs.ay_end = 'End date is required';
      else if (!DATE_REGEX.test(academicYear.endDate)) errs.ay_end = 'Use YYYY-MM-DD format';

      terms.forEach((t, i) => {
        if (!t.name.trim()) errs[`term_${i}_name`] = 'Term name is required';
        if (!t.startDate.trim()) errs[`term_${i}_start`] = 'Start date is required';
        else if (!DATE_REGEX.test(t.startDate)) errs[`term_${i}_start`] = 'Use YYYY-MM-DD format';
        if (!t.endDate.trim()) errs[`term_${i}_end`] = 'End date is required';
        else if (!DATE_REGEX.test(t.endDate)) errs[`term_${i}_end`] = 'Use YYYY-MM-DD format';
      });
    }

    if (step === 2) {
      classLevels.forEach((cl, i) => {
        if (!cl.name.trim()) errs[`cl_${i}_name`] = 'Class level name is required';
      });
      sections.forEach((s, i) => {
        if (!s.name.trim()) errs[`sec_${i}_name`] = 'Section name is required';
      });
    }

    if (step === 3) {
      subjects.forEach((s, i) => {
        if (!s.name.trim()) errs[`sub_${i}_name`] = 'Subject name is required';
        if (!s.code.trim()) errs[`sub_${i}_code`] = 'Subject code is required';
        if (!s.maxMarks.trim()) errs[`sub_${i}_max`] = 'Max marks is required';
        else if (isNaN(Number(s.maxMarks)) || Number(s.maxMarks) <= 0) errs[`sub_${i}_max`] = 'Must be a positive number';
      });
    }

    if (step === 4) {
      assessmentTypes.forEach((at, i) => {
        if (!at.name.trim()) errs[`at_${i}_name`] = 'Name is required';
        if (!at.weight.trim()) errs[`at_${i}_weight`] = 'Weight is required';
        else if (isNaN(Number(at.weight)) || Number(at.weight) <= 0 || Number(at.weight) > 100)
          errs[`at_${i}_weight`] = 'Weight must be 1-100';
      });
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ─── API Submission ─────────────────────────────────────

  async function submitStep() {
    if (!validateStep()) return;
    setLoading(true);

    try {
      if (step === 0) {
        // Save school config
        const configs = Object.entries(schoolInfo).map(([key, value]) => ({ key, value }));
        await api.post('/school-config/bulk', { configs });
        toast.success('School info saved');
      }

      if (step === 1) {
        // Create academic year
        const yearRes = await api.post('/academic/years', {
          name: academicYear.name,
          startDate: academicYear.startDate,
          endDate: academicYear.endDate,
          isCurrent: academicYear.isCurrent,
        });
        const yearId = yearRes.data?.id ?? yearRes.data?.data?.id;
        setSavedAcademicYearId(yearId);

        // Create terms
        for (const term of terms) {
          await api.post('/academic/terms', {
            academicYearId: yearId,
            name: term.name,
            startDate: term.startDate,
            endDate: term.endDate,
          });
        }
        toast.success('Academic year and terms created');
      }

      if (step === 2) {
        // Create class levels
        for (const cl of classLevels) {
          await api.post('/academic/class-levels', { name: cl.name });
        }
        // Create sections
        for (const sec of sections) {
          await api.post('/academic/sections', { name: sec.name });
        }
        toast.success('Class structure saved');
      }

      if (step === 3) {
        for (const sub of subjects) {
          await api.post('/academic/subjects', {
            name: sub.name,
            code: sub.code,
            maxMarks: Number(sub.maxMarks),
          });
        }
        toast.success('Subjects created');
      }

      if (step === 4) {
        for (const at of assessmentTypes) {
          await api.post('/academic/assessment-types', {
            name: at.name,
            weight: Number(at.weight),
          });
        }
        toast.success('Assessment types created');
      }

      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setStep((s) => s + 1);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Something went wrong';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    setErrors({});
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setStep((s) => s - 1);
  }

  // ─── Render Helpers ─────────────────────────────────────

  function updateTerm(index: number, field: keyof TermForm, value: string) {
    setTerms((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  function updateClassLevel(index: number, value: string) {
    setClassLevels((prev) => prev.map((cl, i) => (i === index ? { name: value } : cl)));
  }

  function updateSection(index: number, value: string) {
    setSections((prev) => prev.map((s, i) => (i === index ? { name: value } : s)));
  }

  function updateSubject(index: number, field: keyof SubjectForm, value: string) {
    setSubjects((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function updateAssessmentType(index: number, field: keyof AssessmentTypeForm, value: string) {
    setAssessmentTypes((prev) => prev.map((at, i) => (i === index ? { ...at, [field]: value } : at)));
  }

  // ─── Step Renderers ─────────────────────────────────────

  function renderStepContent() {
    switch (step) {
      case 0:
        return renderSchoolInfo();
      case 1:
        return renderAcademicSetup();
      case 2:
        return renderClassStructure();
      case 3:
        return renderSubjects();
      case 4:
        return renderAssessmentTypes();
      case 5:
        return renderDone();
      default:
        return null;
    }
  }

  function renderSchoolInfo() {
    return (
      <>
        <View style={styles.stepHeader}>
          <School size={28} color={colors.primary} />
          <Text style={styles.stepTitle}>School Information</Text>
          <Text style={styles.stepDescription}>
            Enter your school's basic details to get started.
          </Text>
        </View>

        <View style={styles.card}>
          <Input
            label="School Name *"
            placeholder="e.g. Greenfield Academy"
            value={schoolInfo.school_name}
            onChangeText={(v) => setSchoolInfo((s) => ({ ...s, school_name: v }))}
            error={errors.school_name}
          />
          <Input
            label="School Motto"
            placeholder="e.g. Excellence in Education"
            value={schoolInfo.school_motto}
            onChangeText={(v) => setSchoolInfo((s) => ({ ...s, school_motto: v }))}
          />
          <Input
            label="Address *"
            placeholder="e.g. 123 Main Street, City"
            value={schoolInfo.school_address}
            onChangeText={(v) => setSchoolInfo((s) => ({ ...s, school_address: v }))}
            error={errors.school_address}
            multiline
            numberOfLines={2}
            style={{ height: 64, textAlignVertical: 'top' }}
          />
        </View>
      </>
    );
  }

  function renderAcademicSetup() {
    return (
      <>
        <View style={styles.stepHeader}>
          <Calendar size={28} color={colors.primary} />
          <Text style={styles.stepTitle}>Academic Setup</Text>
          <Text style={styles.stepDescription}>
            Create your academic year and define terms.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Academic Year</Text>
          <Input
            label="Year Name *"
            placeholder="e.g. 2026"
            value={academicYear.name}
            onChangeText={(v) => setAcademicYear((s) => ({ ...s, name: v }))}
            error={errors.ay_name}
          />
          <Input
            label="Start Date * (YYYY-MM-DD)"
            placeholder="e.g. 2026-01-15"
            value={academicYear.startDate}
            onChangeText={(v) => setAcademicYear((s) => ({ ...s, startDate: v }))}
            error={errors.ay_start}
          />
          <Input
            label="End Date * (YYYY-MM-DD)"
            placeholder="e.g. 2026-12-15"
            value={academicYear.endDate}
            onChangeText={(v) => setAcademicYear((s) => ({ ...s, endDate: v }))}
            error={errors.ay_end}
          />
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.cardTitle}>Terms</Text>
          <Pressable
            style={styles.addButton}
            onPress={() => setTerms((prev) => [...prev, { name: '', startDate: '', endDate: '' }])}
          >
            <Plus size={16} color={colors.white} />
            <Text style={styles.addButtonText}>Add Term</Text>
          </Pressable>
        </View>

        {terms.map((term, i) => (
          <View key={i} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardSubtitle}>Term {i + 1}</Text>
              {terms.length > 1 && (
                <Pressable onPress={() => setTerms((prev) => prev.filter((_, idx) => idx !== i))}>
                  <Trash2 size={18} color={colors.danger} />
                </Pressable>
              )}
            </View>
            <Input
              label="Term Name *"
              placeholder="e.g. Term 1"
              value={term.name}
              onChangeText={(v) => updateTerm(i, 'name', v)}
              error={errors[`term_${i}_name`]}
            />
            <Input
              label="Start Date * (YYYY-MM-DD)"
              placeholder="e.g. 2026-01-15"
              value={term.startDate}
              onChangeText={(v) => updateTerm(i, 'startDate', v)}
              error={errors[`term_${i}_start`]}
            />
            <Input
              label="End Date * (YYYY-MM-DD)"
              placeholder="e.g. 2026-04-15"
              value={term.endDate}
              onChangeText={(v) => updateTerm(i, 'endDate', v)}
              error={errors[`term_${i}_end`]}
            />
          </View>
        ))}
      </>
    );
  }

  function renderClassStructure() {
    return (
      <>
        <View style={styles.stepHeader}>
          <Layers size={28} color={colors.primary} />
          <Text style={styles.stepTitle}>Class Structure</Text>
          <Text style={styles.stepDescription}>
            Define your class levels (e.g. Form 1, Grade 7) and sections (e.g. A, B, C).
          </Text>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.cardTitle}>Class Levels</Text>
          <Pressable
            style={styles.addButton}
            onPress={() => setClassLevels((prev) => [...prev, { name: '' }])}
          >
            <Plus size={16} color={colors.white} />
            <Text style={styles.addButtonText}>Add Level</Text>
          </Pressable>
        </View>

        {classLevels.map((cl, i) => (
          <View key={i} style={styles.inlineRow}>
            <View style={styles.inlineInput}>
              <Input
                placeholder="e.g. Form 1"
                value={cl.name}
                onChangeText={(v) => updateClassLevel(i, v)}
                error={errors[`cl_${i}_name`]}
              />
            </View>
            {classLevels.length > 1 && (
              <Pressable
                style={styles.inlineDelete}
                onPress={() => setClassLevels((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash2 size={18} color={colors.danger} />
              </Pressable>
            )}
          </View>
        ))}

        <View style={[styles.listHeader, { marginTop: spacing.xl }]}>
          <Text style={styles.cardTitle}>Sections</Text>
          <Pressable
            style={styles.addButton}
            onPress={() => setSections((prev) => [...prev, { name: '' }])}
          >
            <Plus size={16} color={colors.white} />
            <Text style={styles.addButtonText}>Add Section</Text>
          </Pressable>
        </View>

        {sections.map((sec, i) => (
          <View key={i} style={styles.inlineRow}>
            <View style={styles.inlineInput}>
              <Input
                placeholder="e.g. A"
                value={sec.name}
                onChangeText={(v) => updateSection(i, v)}
                error={errors[`sec_${i}_name`]}
              />
            </View>
            {sections.length > 1 && (
              <Pressable
                style={styles.inlineDelete}
                onPress={() => setSections((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash2 size={18} color={colors.danger} />
              </Pressable>
            )}
          </View>
        ))}
      </>
    );
  }

  function renderSubjects() {
    return (
      <>
        <View style={styles.stepHeader}>
          <BookOpen size={28} color={colors.primary} />
          <Text style={styles.stepTitle}>Subjects</Text>
          <Text style={styles.stepDescription}>
            Add the subjects taught at your school.
          </Text>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.cardTitle}>Subject List</Text>
          <Pressable
            style={styles.addButton}
            onPress={() => setSubjects((prev) => [...prev, { name: '', code: '', maxMarks: '100' }])}
          >
            <Plus size={16} color={colors.white} />
            <Text style={styles.addButtonText}>Add Subject</Text>
          </Pressable>
        </View>

        {subjects.map((sub, i) => (
          <View key={i} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardSubtitle}>Subject {i + 1}</Text>
              {subjects.length > 1 && (
                <Pressable onPress={() => setSubjects((prev) => prev.filter((_, idx) => idx !== i))}>
                  <Trash2 size={18} color={colors.danger} />
                </Pressable>
              )}
            </View>
            <Input
              label="Name *"
              placeholder="e.g. Mathematics"
              value={sub.name}
              onChangeText={(v) => updateSubject(i, 'name', v)}
              error={errors[`sub_${i}_name`]}
            />
            <Input
              label="Code *"
              placeholder="e.g. MATH"
              value={sub.code}
              onChangeText={(v) => updateSubject(i, 'code', v)}
              error={errors[`sub_${i}_code`]}
            />
            <Input
              label="Max Marks *"
              placeholder="e.g. 100"
              value={sub.maxMarks}
              onChangeText={(v) => updateSubject(i, 'maxMarks', v)}
              keyboardType="numeric"
              error={errors[`sub_${i}_max`]}
            />
          </View>
        ))}
      </>
    );
  }

  function renderAssessmentTypes() {
    return (
      <>
        <View style={styles.stepHeader}>
          <ClipboardList size={28} color={colors.primary} />
          <Text style={styles.stepTitle}>Assessment Types</Text>
          <Text style={styles.stepDescription}>
            Define how students are assessed (e.g. Exam 60%, Coursework 40%).
          </Text>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.cardTitle}>Assessment Types</Text>
          <Pressable
            style={styles.addButton}
            onPress={() => setAssessmentTypes((prev) => [...prev, { name: '', weight: '' }])}
          >
            <Plus size={16} color={colors.white} />
            <Text style={styles.addButtonText}>Add Type</Text>
          </Pressable>
        </View>

        {assessmentTypes.map((at, i) => (
          <View key={i} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardSubtitle}>Type {i + 1}</Text>
              {assessmentTypes.length > 1 && (
                <Pressable onPress={() => setAssessmentTypes((prev) => prev.filter((_, idx) => idx !== i))}>
                  <Trash2 size={18} color={colors.danger} />
                </Pressable>
              )}
            </View>
            <Input
              label="Name *"
              placeholder="e.g. Final Exam"
              value={at.name}
              onChangeText={(v) => updateAssessmentType(i, 'name', v)}
              error={errors[`at_${i}_name`]}
            />
            <Input
              label="Weight (%) *"
              placeholder="e.g. 60"
              value={at.weight}
              onChangeText={(v) => updateAssessmentType(i, 'weight', v)}
              keyboardType="numeric"
              error={errors[`at_${i}_weight`]}
            />
          </View>
        ))}
      </>
    );
  }

  function renderDone() {
    return (
      <View style={styles.doneContainer}>
        <View style={styles.doneIconWrap}>
          <CheckCircle size={64} color={colors.success} />
        </View>
        <Text style={styles.doneTitle}>Setup Complete!</Text>
        <Text style={styles.doneText}>
          Your school has been configured successfully. You can now start managing students, teachers, and more from the dashboard.
        </Text>
        <Button
          title="Go to Dashboard"
          onPress={() => router.replace('/(app)/(tabs)')}
          size="lg"
          fullWidth
        />
      </View>
    );
  }

  // ─── Progress Indicator ─────────────────────────────────

  function renderProgress() {
    return (
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>Step {step + 1} of {STEPS.length}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
        </View>
        <View style={styles.progressDots}>
          {STEPS.map((s, i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i <= step && styles.progressDotActive,
                i === step && styles.progressDotCurrent,
              ]}
            />
          ))}
        </View>
      </View>
    );
  }

  // ─── Main Render ────────────────────────────────────────

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="School Setup"
        subtitle={step < STEPS.length ? STEPS[step].label : undefined}
        onBack={step > 0 && step < 5 ? goBack : undefined}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {renderProgress()}
          {renderStepContent()}
        </ScrollView>

        {step < 5 && (
          <View style={styles.footer}>
            {step > 0 && (
              <Button
                title="Back"
                variant="outline"
                onPress={goBack}
                icon={<ChevronLeft size={18} color={colors.primary} />}
              />
            )}
            <View style={styles.footerSpacer} />
            <Button
              title={step === 4 ? 'Finish Setup' : 'Next'}
              onPress={submitStep}
              loading={loading}
              icon={!loading ? <ChevronRight size={18} color={colors.white} /> : undefined}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },

  // Progress
  progressContainer: { marginBottom: spacing.xl },
  progressText: {
    fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.muted,
    textAlign: 'center', marginBottom: spacing.sm,
  },
  progressBar: {
    height: 6, backgroundColor: colors.surfaceMuted, borderRadius: 3, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: colors.primary, borderRadius: 3,
  },
  progressDots: {
    flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md,
  },
  progressDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted,
  },
  progressDotActive: { backgroundColor: colors.primaryLight },
  progressDotCurrent: { backgroundColor: colors.primary, width: 20, borderRadius: 4 },

  // Step header
  stepHeader: { alignItems: 'center', marginBottom: spacing.xl },
  stepTitle: {
    fontSize: fontSize.xl, fontFamily: fontFamily.bold, color: colors.foreground,
    marginTop: spacing.md,
  },
  stepDescription: {
    fontSize: fontSize.sm, color: colors.muted, textAlign: 'center',
    marginTop: spacing.sm, lineHeight: 20, paddingHorizontal: spacing.lg, fontFamily: fontFamily.regular },

  // Cards
  card: {
    backgroundColor: colors.white, borderRadius: radius['2xl'], padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  cardTitle: {
    fontSize: fontSize.lg, fontFamily: fontFamily.semibold, color: colors.foreground,
  },
  cardSubtitle: {
    fontSize: fontSize.base, fontFamily: fontFamily.semibold, color: colors.foreground,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.md,
  },

  // List header with add button
  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.md,
  },
  addButton: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.primaryLight, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  addButtonText: {
    fontSize: fontSize.sm, fontFamily: fontFamily.semibold, color: colors.white,
  },

  // Inline row (for class levels / sections)
  inlineRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  inlineInput: { flex: 1 },
  inlineDelete: {
    marginTop: spacing.sm, padding: spacing.sm,
  },

  // Footer navigation
  footer: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.surfaceMuted,
  },
  footerSpacer: { flex: 1 },

  // Done screen
  doneContainer: { alignItems: 'center', paddingTop: spacing['4xl'] },
  doneIconWrap: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: colors.successWash,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl,
  },
  doneTitle: {
    fontSize: fontSize['2xl'], fontFamily: fontFamily.bold, color: colors.foreground,
    marginBottom: spacing.md,
  },
  doneText: {
    fontSize: fontSize.base, color: colors.muted, textAlign: 'center',
    lineHeight: 22, marginBottom: spacing['3xl'], paddingHorizontal: spacing.lg, fontFamily: fontFamily.regular },
});
