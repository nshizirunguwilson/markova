import { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Clock, MapPin, User, BookOpen, Calendar } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth-store';
import { useTimetable, useTeacherTimetable } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorScreen } from '@/components/ErrorScreen';
import { getErrorType, getErrorMessage } from '@/hooks/useQueryError';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

// ─── Types ──────────────────────────────────────────────

interface TimetableEntry {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  subject: { id: string; name: string };
  teacher: { id: string; user: { firstName: string; lastName: string } };
}

// ─── Constants ──────────────────────────────────────────

const DAYS = [
  { key: 1, short: 'Mon', full: 'Monday' },
  { key: 2, short: 'Tue', full: 'Tuesday' },
  { key: 3, short: 'Wed', full: 'Wednesday' },
  { key: 4, short: 'Thu', full: 'Thursday' },
  { key: 5, short: 'Fri', full: 'Friday' },
  { key: 6, short: 'Sat', full: 'Saturday' },
];

const SUBJECT_COLORS = [
  '#1B4F72', '#27AE60', '#8E44AD', '#D35400', '#2C3E50',
  '#16A085', '#C0392B', '#2980B9', '#F39C12', '#7D3C98',
  '#1ABC9C', '#E74C3C',
];

// ─── Helpers ────────────────────────────────────────────

function getCurrentDayOfWeek(): number {
  const jsDay = new Date().getDay(); // 0=Sunday
  return jsDay === 0 ? 7 : jsDay;
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function getSubjectColor(subjectId: string, allSubjectIds: string[]): string {
  const index = allSubjectIds.indexOf(subjectId);
  return SUBJECT_COLORS[index % SUBJECT_COLORS.length];
}

function getNowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// ─── Component ──────────────────────────────────────────

export default function TimetableScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ classSectionId?: string; studentName?: string }>();
  const user = useAuthStore((s) => s.user);

  const currentDay = getCurrentDayOfWeek();
  const [selectedDay, setSelectedDay] = useState(currentDay <= 6 ? currentDay : 1);
  const [refreshing, setRefreshing] = useState(false);

  // Determine which API to call based on role
  const isTeacher = user?.role === 'TEACHER';
  const classSectionId = params.classSectionId ?? user?.classSectionId;

  const {
    data: sectionData,
    isLoading: sectionLoading,
    error: sectionError,
    refetch: refetchSection,
  } = useTimetable(isTeacher ? undefined : classSectionId);

  const {
    data: teacherData,
    isLoading: teacherLoading,
    error: teacherError,
    refetch: refetchTeacher,
  } = useTeacherTimetable(isTeacher ? user?.teacherId : undefined);

  const isLoading = isTeacher ? teacherLoading : sectionLoading;
  const queryError = isTeacher ? teacherError : sectionError;
  const rawEntries: TimetableEntry[] = (isTeacher ? teacherData : sectionData) ?? [];

  // Collect unique subject IDs for consistent color assignment
  const subjectIds = useMemo(() => {
    const ids = [...new Set(rawEntries.map((e) => e.subject.id))];
    ids.sort();
    return ids;
  }, [rawEntries]);

  // Filter and sort entries for selected day
  const dayEntries = useMemo(() => {
    return rawEntries
      .filter((e) => e.dayOfWeek === selectedDay)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }, [rawEntries, selectedDay]);

  // Determine NOW and NEXT indices
  const { nowIndex, nextIndex } = useMemo(() => {
    if (selectedDay !== currentDay) return { nowIndex: -1, nextIndex: -1 };
    const nowMin = getNowMinutes();
    let now = -1;
    let next = -1;
    for (let i = 0; i < dayEntries.length; i++) {
      const start = timeToMinutes(dayEntries[i].startTime);
      const end = timeToMinutes(dayEntries[i].endTime);
      if (nowMin >= start && nowMin < end) {
        now = i;
      } else if (nowMin < start && next === -1) {
        next = i;
      }
    }
    return { nowIndex: now, nextIndex: next };
  }, [dayEntries, selectedDay, currentDay]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (isTeacher) await refetchTeacher();
    else await refetchSection();
    setRefreshing(false);
  }, [isTeacher, refetchTeacher, refetchSection]);

  const subtitle = params.studentName
    ? `${params.studentName}'s Schedule`
    : isTeacher
      ? 'My Teaching Schedule'
      : 'My Class Schedule';

  return (
    <View style={styles.container}>
      <ScreenHeader title="Timetable" subtitle={subtitle} onBack={() => router.back()} />

      {/* Day tabs */}
      <View style={styles.dayTabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayTabs}
        >
          {DAYS.map((day) => {
            const isSelected = selectedDay === day.key;
            const isToday = currentDay === day.key;
            return (
              <Pressable
                key={day.key}
                style={[
                  styles.dayTab,
                  isSelected && styles.dayTabSelected,
                  isToday && !isSelected && styles.dayTabToday,
                ]}
                onPress={() => setSelectedDay(day.key)}
              >
                <Text style={[
                  styles.dayTabText,
                  isSelected && styles.dayTabTextSelected,
                ]}>
                  {day.short}
                </Text>
                {isToday && (
                  <View style={[styles.todayDot, isSelected && styles.todayDotSelected]} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Content */}
      {isLoading ? (
        <LoadingScreen />
      ) : queryError ? (
        <ErrorScreen type={getErrorType(queryError)} message={getErrorMessage(queryError)} onRetry={() => isTeacher ? refetchTeacher() : refetchSection()} />
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        >
          {/* Day heading */}
          <View style={styles.dayHeading}>
            <Calendar size={16} color={colors.muted} />
            <Text style={styles.dayHeadingText}>
              {DAYS.find((d) => d.key === selectedDay)?.full}
              {selectedDay === currentDay ? ' (Today)' : ''}
            </Text>
            <Text style={styles.periodCount}>
              {dayEntries.length} {dayEntries.length === 1 ? 'period' : 'periods'}
            </Text>
          </View>

          {dayEntries.length === 0 ? (
            <View style={styles.empty}>
              <BookOpen size={48} color={colors.mutedLight} />
              <Text style={styles.emptyTitle}>No Classes</Text>
              <Text style={styles.emptyText}>
                No classes scheduled for {DAYS.find((d) => d.key === selectedDay)?.full}.
              </Text>
            </View>
          ) : (
            dayEntries.map((entry, index) => {
              const isNow = index === nowIndex;
              const isNext = index === nextIndex;
              const subjectColor = getSubjectColor(entry.subject.id, subjectIds);

              return (
                <View
                  key={entry.id}
                  style={[
                    styles.periodCard,
                    { borderLeftColor: subjectColor },
                    isNow && styles.periodCardNow,
                    isNext && styles.periodCardNext,
                  ]}
                >
                  {/* Badge */}
                  {(isNow || isNext) && (
                    <View style={[styles.badge, isNow ? styles.badgeNow : styles.badgeNext]}>
                      <Text style={styles.badgeText}>{isNow ? 'NOW' : 'NEXT'}</Text>
                    </View>
                  )}

                  <View style={styles.periodRow}>
                    {/* Time column */}
                    <View style={styles.timeColumn}>
                      <Text style={[styles.timeStart, isNow && styles.timeNow]}>
                        {formatTime(entry.startTime)}
                      </Text>
                      <View style={styles.timeDivider} />
                      <Text style={styles.timeEnd}>
                        {formatTime(entry.endTime)}
                      </Text>
                    </View>

                    {/* Separator */}
                    <View style={styles.periodSeparator} />

                    {/* Details column */}
                    <View style={styles.detailsColumn}>
                      <Text style={styles.subjectName} numberOfLines={1}>
                        {entry.subject.name}
                      </Text>

                      <View style={styles.detailRow}>
                        <User size={13} color={colors.muted} />
                        <Text style={styles.detailText} numberOfLines={1}>
                          {entry.teacher.user.firstName} {entry.teacher.user.lastName}
                        </Text>
                      </View>

                      {entry.room && (
                        <View style={styles.detailRow}>
                          <MapPin size={13} color={colors.muted} />
                          <Text style={styles.detailText}>{entry.room}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
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

  // Day tabs
  dayTabsWrapper: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  dayTabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  dayTab: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    minWidth: 52,
  },
  dayTabSelected: {
    backgroundColor: colors.primary,
  },
  dayTabToday: {
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  dayTabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
  },
  dayTabTextSelected: {
    color: colors.white,
  },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 3,
  },
  todayDotSelected: {
    backgroundColor: colors.white,
  },

  // Day heading
  dayHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dayHeadingText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    flex: 1,
  },
  periodCount: {
    fontSize: fontSize.xs,
    color: colors.muted,
    fontWeight: fontWeight.medium,
  },

  // Period cards
  periodCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
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
  periodCardNow: {
    borderLeftColor: colors.success,
    backgroundColor: '#F0FFF4',
  },
  periodCardNext: {
    borderLeftColor: colors.warning,
    backgroundColor: '#FFFBF0',
  },
  periodRow: {
    flexDirection: 'row',
    padding: spacing.lg,
    paddingTop: spacing.md,
  },

  // Badge
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderBottomLeftRadius: radius.sm,
  },
  badgeNow: {
    backgroundColor: colors.success,
  },
  badgeNext: {
    backgroundColor: colors.warning,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.white,
    letterSpacing: 0.5,
  },

  // Time column
  timeColumn: {
    alignItems: 'center',
    width: 68,
    paddingTop: 2,
  },
  timeStart: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
  },
  timeNow: {
    color: colors.success,
  },
  timeDivider: {
    width: 1,
    height: 12,
    backgroundColor: colors.border,
    marginVertical: 3,
  },
  timeEnd: {
    fontSize: fontSize.xs,
    color: colors.muted,
  },

  // Separator
  periodSeparator: {
    width: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.md,
  },

  // Details
  detailsColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  subjectName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginBottom: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detailText: {
    fontSize: fontSize.sm,
    color: colors.muted,
    flex: 1,
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
