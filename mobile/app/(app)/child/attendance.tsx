import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAttendanceSummary } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ErrorScreen } from '@/components/ErrorScreen';
import { getErrorType, getErrorMessage } from '@/hooks/useQueryError';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';
import type { AttendanceRecord } from '@/types';

export default function ChildAttendanceScreen() {
  const router = useRouter();
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name: string }>();
  const [viewDate, setViewDate] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const dateFrom = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const dateTo = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;

  const { data: summary, error: summaryError, refetch: refetchSummary } = useAttendanceSummary(studentId, dateFrom, dateTo);
  const { data: records, refetch: refetchRecords } = useQuery<AttendanceRecord[]>({
    queryKey: ['attendance-records', studentId, dateFrom, dateTo],
    queryFn: () =>
      api.get('/attendance', { params: { studentId, dateFrom, dateTo, limit: 100 } }).then((r) => r.data?.data ?? r.data),
    enabled: !!studentId,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchSummary(), refetchRecords()]);
    setRefreshing(false);
  }, [refetchSummary, refetchRecords]);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const monthName = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Build calendar data
  const calendarDays = useMemo(() => {
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const days: { day: number; status?: string }[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) days.push({ day: 0 });
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const record = records?.find((r) => r.date?.startsWith(dateStr));
      days.push({ day: d, status: record?.status });
    }
    return days;
  }, [records, year, month, lastDay]);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Attendance" subtitle={name} onBack={() => router.back()} />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Summary bar */}
        <View style={styles.summaryRow}>
          <SumBadge label="Present" value={summary?.presentDays ?? 0} color={colors.success} />
          <SumBadge label="Absent" value={summary?.absentDays ?? 0} color={colors.danger} />
          <SumBadge label="Late" value={summary?.lateDays ?? 0} color={colors.warning} />
          <SumBadge
            label="Rate"
            value={`${(summary?.attendanceRate ?? 0).toFixed(0)}%`}
            color={colors.primary}
          />
        </View>

        {/* Month navigator */}
        <View style={styles.monthNav}>
          <Pressable onPress={prevMonth} hitSlop={8}>
            <ChevronLeft size={24} color={colors.foreground} />
          </Pressable>
          <Text style={styles.monthText}>{monthName}</Text>
          <Pressable onPress={nextMonth} hitSlop={8}>
            <ChevronRight size={24} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Calendar grid */}
        <View style={styles.calendarCard}>
          <View style={styles.weekRow}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <Text key={d} style={styles.weekDay}>{d}</Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {calendarDays.map((item, i) => (
              <View key={i} style={styles.dayCell}>
                {item.day > 0 ? (
                  <View
                    style={[
                      styles.dayCircle,
                      item.status === 'PRESENT' && styles.dayPresent,
                      item.status === 'ABSENT' && styles.dayAbsent,
                      item.status === 'LATE' && styles.dayLate,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        item.status && styles.dayTextMarked,
                      ]}
                    >
                      {item.day}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <LegendItem color={colors.success} label="Present" />
          <LegendItem color={colors.danger} label="Absent" />
          <LegendItem color={colors.warning} label="Late" />
        </View>

        {/* Recent records */}
        <Text style={styles.sectionTitle}>Recent Records</Text>
        {records && records.length > 0 ? (
          records.slice(0, 10).map((rec) => (
            <View key={rec.id} style={styles.recordRow}>
              {rec.status === 'PRESENT' && <CheckCircle size={18} color={colors.success} />}
              {rec.status === 'ABSENT' && <XCircle size={18} color={colors.danger} />}
              {rec.status === 'LATE' && <Clock size={18} color={colors.warning} />}
              <Text style={styles.recordDate}>
                {new Date(rec.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <Text style={[styles.recordStatus, {
                color: rec.status === 'PRESENT' ? colors.success : rec.status === 'ABSENT' ? colors.danger : colors.warning,
              }]}>
                {rec.status}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.noData}>No attendance records for this month.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function SumBadge({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <View style={styles.sumBadge}>
      <Text style={[styles.sumValue, { color }]}>{value}</Text>
      <Text style={styles.sumLabel}>{label}</Text>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  sumBadge: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  sumValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  sumLabel: { fontSize: 10, color: colors.muted, marginTop: 2 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  monthText: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.foreground },
  calendarCard: { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg },
  weekRow: { flexDirection: 'row', marginBottom: spacing.sm },
  weekDay: { flex: 1, textAlign: 'center', fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.muted },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayPresent: { backgroundColor: colors.successLight },
  dayAbsent: { backgroundColor: colors.dangerLight },
  dayLate: { backgroundColor: colors.warningLight },
  dayText: { fontSize: fontSize.sm, color: colors.foreground },
  dayTextMarked: { fontWeight: fontWeight.semibold },
  legend: { flexDirection: 'row', gap: spacing.xl, justifyContent: 'center', marginBottom: spacing.xl },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: fontSize.xs, color: colors.muted },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.foreground, marginBottom: spacing.md },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  recordDate: { flex: 1, fontSize: fontSize.sm, color: colors.foreground },
  recordStatus: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  noData: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', padding: spacing.xl },
});
