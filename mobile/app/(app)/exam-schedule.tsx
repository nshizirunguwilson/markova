import { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Calendar, Clock, MapPin, BookOpen, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth-store';
import { useExamSchedule } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorScreen } from '@/components/ErrorScreen';
import { getErrorType, getErrorMessage } from '@/hooks/useQueryError';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

// ─── Types ──────────────────────────────────────────────

interface Exam {
  id: string;
  examDate: string;
  startTime: string;
  endTime: string;
  room: string | null;
  syllabus: string | null;
  subject: { id: string; name: string };
  classSection: { id: string; name: string };
}

// ─── Helpers ────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function getDaysRemaining(examDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(examDate);
  exam.setHours(0, 0, 0, 0);
  return Math.ceil((exam.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgencyColor(daysRemaining: number): string {
  if (daysRemaining < 0) return colors.muted;
  if (daysRemaining <= 3) return colors.danger;
  if (daysRemaining <= 7) return colors.warning;
  return colors.primary;
}

function getUrgencyBg(daysRemaining: number): string {
  if (daysRemaining < 0) return colors.surfaceMuted;
  if (daysRemaining <= 3) return colors.dangerWash;
  if (daysRemaining <= 7) return colors.warningWash;
  return colors.accentLight;
}

function getCountdownLabel(days: number): string {
  if (days < 0) return 'Completed';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

// ─── Component ──────────────────────────────────────────

export default function ExamScheduleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ classSectionId?: string; termId?: string }>();
  const user = useAuthStore((s) => s.user);

  const classSectionId = params.classSectionId ?? user?.classSectionId;
  const termId = params.termId;

  const { data, isLoading, error, refetch } = useExamSchedule(classSectionId, termId);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const exams: Exam[] = data ?? [];

  // Split into upcoming and past, sorted by date
  const { upcoming, past } = useMemo(() => {
    const sorted = [...exams].sort(
      (a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime()
    );
    const up: Exam[] = [];
    const pa: Exam[] = [];
    for (const exam of sorted) {
      if (getDaysRemaining(exam.examDate) < 0) pa.push(exam);
      else up.push(exam);
    }
    return { upcoming: up, past: pa.reverse() };
  }, [exams]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const renderExamCard = (exam: Exam, isPast: boolean) => {
    const days = getDaysRemaining(exam.examDate);
    const urgencyColor = getUrgencyColor(days);
    const urgencyBg = getUrgencyBg(days);
    const isExpanded = expandedId === exam.id;

    return (
      <View
        key={exam.id}
        style={[
          styles.examCard,
          { borderLeftColor: urgencyColor },
          isPast && styles.examCardPast,
        ]}
      >
        <View style={styles.examHeader}>
          {/* Countdown badge */}
          <View style={[styles.countdownBadge, { backgroundColor: urgencyBg }]}>
            {days >= 0 && days <= 3 && !isPast && (
              <AlertTriangle size={12} color={urgencyColor} style={{ marginRight: 4 }} />
            )}
            <Text style={[styles.countdownText, { color: urgencyColor }]}>
              {getCountdownLabel(days)}
            </Text>
          </View>

          {/* Subject */}
          <Text style={[styles.examSubject, isPast && styles.textPast]} numberOfLines={1}>
            {exam.subject.name}
          </Text>

          {/* Date and time */}
          <View style={styles.examMeta}>
            <View style={styles.metaRow}>
              <Calendar size={14} color={isPast ? colors.muted : colors.muted} />
              <Text style={[styles.metaText, isPast && styles.textPast]}>
                {formatDate(exam.examDate)}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Clock size={14} color={isPast ? colors.muted : colors.muted} />
              <Text style={[styles.metaText, isPast && styles.textPast]}>
                {formatTime(exam.startTime)} - {formatTime(exam.endTime)}
              </Text>
            </View>
            {exam.room && (
              <View style={styles.metaRow}>
                <MapPin size={14} color={isPast ? colors.muted : colors.muted} />
                <Text style={[styles.metaText, isPast && styles.textPast]}>
                  {exam.room}
                </Text>
              </View>
            )}
          </View>

          {/* Syllabus toggle */}
          {exam.syllabus && (
            <Pressable
              style={styles.syllabusToggle}
              onPress={() => toggleExpand(exam.id)}
              hitSlop={8}
            >
              <BookOpen size={14} color={colors.primary} />
              <Text style={styles.syllabusToggleText}>
                {isExpanded ? 'Hide Syllabus' : 'View Syllabus'}
              </Text>
              {isExpanded ? (
                <ChevronUp size={16} color={colors.primary} />
              ) : (
                <ChevronDown size={16} color={colors.primary} />
              )}
            </Pressable>
          )}
        </View>

        {/* Expanded syllabus */}
        {isExpanded && exam.syllabus && (
          <View style={styles.syllabusContent}>
            <Text style={styles.syllabusText}>{exam.syllabus}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Exam Schedule" subtitle="Upcoming Exams" onBack={() => router.back()} />

      {isLoading ? (
        <LoadingScreen />
      ) : error ? (
        <ErrorScreen type={getErrorType(error)} message={getErrorMessage(error)} onRetry={() => refetch()} />
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        >
          {/* Summary stats */}
          {upcoming.length > 0 && (
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: colors.dangerWash }]}>
                <Text style={[styles.summaryValue, { color: colors.danger }]}>
                  {upcoming.filter((e) => getDaysRemaining(e.examDate) <= 3).length}
                </Text>
                <Text style={styles.summaryLabel}>Within 3 days</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.warningWash }]}>
                <Text style={[styles.summaryValue, { color: colors.warning }]}>
                  {upcoming.filter((e) => getDaysRemaining(e.examDate) <= 7).length}
                </Text>
                <Text style={styles.summaryLabel}>This week</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.accentLight }]}>
                <Text style={[styles.summaryValue, { color: colors.primary }]}>
                  {upcoming.length}
                </Text>
                <Text style={styles.summaryLabel}>Total left</Text>
              </View>
            </View>
          )}

          {/* Upcoming exams */}
          {upcoming.length === 0 && past.length === 0 ? (
            <View style={styles.empty}>
              <Calendar size={48} color={colors.muted} />
              <Text style={styles.emptyTitle}>No Exams Scheduled</Text>
              <Text style={styles.emptyText}>
                There are no exams scheduled for this term yet.
              </Text>
            </View>
          ) : (
            <>
              {upcoming.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Upcoming Exams</Text>
                  {upcoming.map((exam) => renderExamCard(exam, false))}
                </>
              )}

              {upcoming.length === 0 && (
                <View style={styles.allDoneBanner}>
                  <Text style={styles.allDoneText}>All exams completed for this term!</Text>
                </View>
              )}

              {/* Past exams */}
              {past.length > 0 && (
                <>
                  <Pressable
                    style={styles.pastToggle}
                    onPress={() => setShowPast((v) => !v)}
                  >
                    <Text style={styles.pastToggleText}>
                      Past Exams ({past.length})
                    </Text>
                    {showPast ? (
                      <ChevronUp size={18} color={colors.muted} />
                    ) : (
                      <ChevronDown size={18} color={colors.muted} />
                    )}
                  </Pressable>
                  {showPast && past.map((exam) => renderExamCard(exam, true))}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  summaryCard: {
    flex: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  summaryLabel: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: fontWeight.medium,
    marginTop: 2,
  },

  // Section
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginBottom: spacing.md,
  },

  // Exam card
  examCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    overflow: 'hidden',
  },
  examCardPast: {
    opacity: 0.6,
  },
  examHeader: {
    padding: spacing.lg,
    gap: spacing.sm,
  },

  // Countdown badge
  countdownBadge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  countdownText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
  },

  // Subject
  examSubject: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
  },
  textPast: {
    color: colors.muted,
  },

  // Meta
  examMeta: {
    gap: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.muted,
  },

  // Syllabus
  syllabusToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  syllabusToggleText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.medium,
    flex: 1,
  },
  syllabusContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
    paddingTop: spacing.md,
  },
  syllabusText: {
    fontSize: fontSize.sm,
    color: colors.muted,
    lineHeight: 22,
  },

  // Past toggle
  pastToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pastToggleText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.muted,
  },

  // All done
  allDoneBanner: {
    backgroundColor: colors.successWash,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  allDoneText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.success,
  },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingVertical: spacing['4xl'],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginTop: spacing.lg,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
