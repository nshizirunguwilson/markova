import { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  BarChart3, TrendingUp, TrendingDown, Users, AlertTriangle,
} from 'lucide-react-native';
import { useTeacherClassAnalytics } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

export default function ClassAnalyticsScreen() {
  const router = useRouter();
  const { classSectionId, className } = useLocalSearchParams<{ classSectionId: string; className: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const { data: analytics, isLoading, refetch } = useTeacherClassAnalytics(classSectionId);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Class Analytics" subtitle={className ?? 'Class'} onBack={() => router.back()} />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {isLoading ? (
          <LoadingScreen />
        ) : analytics ? (
          <>
            {/* Overview stats */}
            <View style={styles.statsGrid}>
              <StatBox
                label="Total Students"
                value={analytics.totalStudents ?? '--'}
                color={colors.primary}
                icon={<Users size={18} color={colors.primary} />}
              />
              <StatBox
                label="Class Average"
                value={analytics.classAverage ? `${Math.round(analytics.classAverage)}%` : '--'}
                color={analytics.classAverage >= 60 ? colors.success : colors.warning}
                icon={<BarChart3 size={18} color={analytics.classAverage >= 60 ? colors.success : colors.warning} />}
              />
            </View>

            {/* Subject performance */}
            {analytics.subjectPerformance?.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Subject Performance</Text>
                {analytics.subjectPerformance.map((sp: any, i: number) => {
                  const avg = sp.average ?? sp.averageScore ?? 0;
                  const barWidth = Math.min(Math.max(avg, 0), 100);
                  return (
                    <View key={i} style={styles.subjectRow}>
                      <Text style={styles.subjectName} numberOfLines={1}>{sp.subject ?? sp.subjectName ?? 'Subject'}</Text>
                      <View style={styles.barBg}>
                        <View style={[styles.barFill, {
                          width: `${barWidth}%`,
                          backgroundColor: avg >= 70 ? colors.success : avg >= 50 ? colors.warning : colors.danger,
                        }]} />
                      </View>
                      <Text style={[styles.subjectAvg, {
                        color: avg >= 70 ? colors.success : avg >= 50 ? colors.warning : colors.danger,
                      }]}>
                        {Math.round(avg)}%
                      </Text>
                    </View>
                  );
                })}
              </>
            )}

            {/* Underperforming students */}
            {analytics.underperformingStudents?.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Needs Attention</Text>
                <View style={styles.alertBox}>
                  <AlertTriangle size={18} color={colors.warning} />
                  <Text style={styles.alertText}>
                    {analytics.underperformingStudents.length} student{analytics.underperformingStudents.length > 1 ? 's' : ''} below passing threshold
                  </Text>
                </View>
                {analytics.underperformingStudents.map((s: any, i: number) => (
                  <View key={i} style={styles.studentRow}>
                    <View style={styles.studentAvatar}>
                      <Text style={styles.studentAvatarText}>
                        {(s.firstName ?? s.name ?? 'S')[0]}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.studentName}>
                        {s.firstName ? `${s.firstName} ${s.lastName ?? ''}` : s.name ?? 'Student'}
                      </Text>
                      <Text style={styles.studentSub}>
                        Average: {Math.round(s.average ?? s.averageScore ?? 0)}%
                      </Text>
                    </View>
                    <TrendingDown size={16} color={colors.danger} />
                  </View>
                ))}
              </>
            )}

            {/* Top performers */}
            {analytics.topStudents?.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Top Performers</Text>
                {analytics.topStudents.slice(0, 5).map((s: any, i: number) => (
                  <View key={i} style={styles.studentRow}>
                    <View style={[styles.studentAvatar, { backgroundColor: colors.successWash }]}>
                      <Text style={[styles.studentAvatarText, { color: colors.success }]}>#{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.studentName}>
                        {s.firstName ? `${s.firstName} ${s.lastName ?? ''}` : s.name ?? 'Student'}
                      </Text>
                      <Text style={styles.studentSub}>
                        Average: {Math.round(s.average ?? s.averageScore ?? 0)}%
                      </Text>
                    </View>
                    <TrendingUp size={16} color={colors.success} />
                  </View>
                ))}
              </>
            )}
          </>
        ) : (
          <Text style={styles.noData}>No analytics available for this class.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function StatBox({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: React.ReactNode }) {
  return (
    <View style={[styles.statBox, { borderLeftColor: color }]}>
      {icon}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },
  statsGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  statBox: {
    flex: 1, backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, borderLeftWidth: 4,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    gap: spacing.xs,
  },
  statValue: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.foreground },
  statLabel: { fontSize: fontSize.xs, color: colors.muted },
  sectionTitle: {
    fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.foreground,
    marginBottom: spacing.md, marginTop: spacing.lg,
  },
  subjectRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.sm,
  },
  subjectName: { width: 80, fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.foreground },
  barBg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted },
  barFill: { height: 8, borderRadius: 4 },
  subjectAvg: { width: 40, fontSize: fontSize.sm, fontWeight: fontWeight.bold, textAlign: 'right' },
  alertBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.warningWash, borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.md,
  },
  alertText: { fontSize: fontSize.sm, color: colors.warning, fontWeight: fontWeight.medium, flex: 1 },
  studentRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.sm,
  },
  studentAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.dangerWash,
    alignItems: 'center', justifyContent: 'center',
  },
  studentAvatarText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.danger },
  studentName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.foreground },
  studentSub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1 },
  noData: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', padding: spacing.xl },
});
