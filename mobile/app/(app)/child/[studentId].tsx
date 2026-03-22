import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Calendar,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  BookOpen,
  FileText,
  ChevronRight,
} from 'lucide-react-native';
import { useAttendanceSummary, useStudentFees, useStudentDiscipline } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

export default function ChildDetailScreen() {
  const router = useRouter();
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name: string }>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: attendance, refetch: refetchAttendance } = useAttendanceSummary(studentId);
  const { data: fees, refetch: refetchFees } = useStudentFees(studentId);
  const { data: discipline, refetch: refetchDiscipline } = useStudentDiscipline(studentId);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAttendance(), refetchFees(), refetchDiscipline()]);
    setRefreshing(false);
  }, [refetchAttendance, refetchFees, refetchDiscipline]);

  const totalFeesDue = fees?.reduce((sum, f) => sum + (f.amountDue - f.amountPaid), 0) ?? 0;
  const attendanceRate = attendance?.attendanceRate ?? 0;

  const menuItems = [
    {
      icon: <Calendar size={22} color={colors.primary} />,
      title: 'Attendance',
      subtitle: `${attendanceRate.toFixed(0)}% attendance rate`,
      color: colors.accentLight,
      onPress: () => router.push({ pathname: '/(app)/child/attendance', params: { studentId, name } }),
    },
    {
      icon: <TrendingUp size={22} color={colors.success} />,
      title: 'Marks & Grades',
      subtitle: 'View term results and report cards',
      color: colors.successLight,
      onPress: () => router.push({ pathname: '/(app)/child/marks', params: { studentId, name } }),
    },
    {
      icon: <DollarSign size={22} color={colors.warning} />,
      title: 'Fee Records',
      subtitle: totalFeesDue > 0 ? `Balance: ${totalFeesDue.toLocaleString()} RWF` : 'All fees paid',
      color: colors.warningLight,
      onPress: () => router.push({ pathname: '/(app)/child/fees', params: { studentId, name } }),
    },
    {
      icon: <AlertTriangle size={22} color={colors.danger} />,
      title: 'Discipline',
      subtitle: `${discipline?.incidents?.length ?? 0} incident(s) on record`,
      color: colors.dangerLight,
      onPress: () => router.push({ pathname: '/(app)/child/discipline', params: { studentId, name } }),
    },
    {
      icon: <BookOpen size={22} color={colors.primaryLight} />,
      title: 'Homework',
      subtitle: 'View assignments and submissions',
      color: colors.accentLight,
      onPress: () => router.push({ pathname: '/(app)/child/homework', params: { studentId, name } }),
    },
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader title={name ?? 'Child'} onBack={() => router.back()} />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <SummaryCard
            label="Attendance"
            value={`${attendanceRate.toFixed(0)}%`}
            color={attendanceRate >= 80 ? colors.success : attendanceRate >= 60 ? colors.warning : colors.danger}
          />
          <SummaryCard
            label="Absences"
            value={String(attendance?.absentDays ?? 0)}
            color={colors.danger}
          />
          <SummaryCard
            label="Fee Balance"
            value={totalFeesDue > 0 ? `${(totalFeesDue / 1000).toFixed(0)}K` : '0'}
            color={totalFeesDue > 0 ? colors.warning : colors.success}
          />
        </View>

        {/* Menu items */}
        {menuItems.map((item, i) => (
          <Pressable key={i} style={styles.menuItem} onPress={item.onPress}>
            <View style={[styles.menuIcon, { backgroundColor: item.color }]}>
              {item.icon}
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </View>
            <ChevronRight size={20} color={colors.mutedLight} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },
  summaryRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  summaryCard: {
    flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
    alignItems: 'center',
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  summaryValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  summaryLabel: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.xs },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2,
  },
  menuIcon: {
    width: 44, height: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center',
  },
  menuContent: { flex: 1, marginLeft: spacing.md },
  menuTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.foreground },
  menuSubtitle: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
});
