import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Award, TrendingUp } from 'lucide-react-native';
import { useStudentMarks, useStudentTermResult, useCurrentTerm } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

export default function ChildMarksScreen() {
  const router = useRouter();
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name: string }>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: currentTerm } = useCurrentTerm();
  const termId = currentTerm?.id;

  const { data: marks, isLoading, refetch: refetchMarks } = useStudentMarks(studentId, termId);
  const { data: termResult, refetch: refetchResult } = useStudentTermResult(studentId, termId);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchMarks(), refetchResult()]);
    setRefreshing(false);
  }, [refetchMarks, refetchResult]);

  // Group marks by subject
  const subjectMarks = marks?.reduce<Record<string, { subject: string; marks: { type: string; score: number; maxScore: number }[] }>>((acc, m) => {
    const subjectName = m.subject?.name ?? 'Unknown';
    if (!acc[subjectName]) acc[subjectName] = { subject: subjectName, marks: [] };
    acc[subjectName].marks.push({
      type: m.assessmentType?.name ?? 'Assessment',
      score: m.score,
      maxScore: m.maxScore,
    });
    return acc;
  }, {});

  return (
    <View style={styles.container}>
      <ScreenHeader title="Marks & Grades" subtitle={name} onBack={() => router.back()} />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Term info */}
        <View style={styles.termBadge}>
          <Text style={styles.termText}>{currentTerm?.name ?? 'Current Term'}</Text>
        </View>

        {/* Result summary */}
        {termResult && (
          <View style={styles.resultCard}>
            <View style={styles.resultRow}>
              <View style={styles.resultItem}>
                <TrendingUp size={20} color={colors.primary} />
                <Text style={styles.resultValue}>{termResult.averagePercentage?.toFixed(1)}%</Text>
                <Text style={styles.resultLabel}>Average</Text>
              </View>
              <View style={styles.resultDivider} />
              <View style={styles.resultItem}>
                <Award size={20} color={colors.warning} />
                <Text style={styles.resultValue}>{termResult.rank ?? '--'}</Text>
                <Text style={styles.resultLabel}>Rank</Text>
              </View>
              <View style={styles.resultDivider} />
              <View style={styles.resultItem}>
                <Text style={styles.resultValue}>{termResult.totalMarks}</Text>
                <Text style={styles.resultLabel}>Total Marks</Text>
              </View>
            </View>
            {termResult.teacherComment && (
              <View style={styles.commentBox}>
                <Text style={styles.commentLabel}>Teacher's Comment</Text>
                <Text style={styles.commentText}>{termResult.teacherComment}</Text>
              </View>
            )}
          </View>
        )}

        {/* Subject marks */}
        <Text style={styles.sectionTitle}>Subject Breakdown</Text>
        {isLoading ? (
          <LoadingScreen />
        ) : subjectMarks && Object.keys(subjectMarks).length > 0 ? (
          Object.values(subjectMarks).map((s) => {
            const avg = s.marks.reduce((a, m) => a + (m.score / m.maxScore) * 100, 0) / s.marks.length;
            return (
              <View key={s.subject} style={styles.subjectCard}>
                <View style={styles.subjectHeader}>
                  <Text style={styles.subjectName}>{s.subject}</Text>
                  <Text style={[styles.subjectAvg, {
                    color: avg >= 70 ? colors.success : avg >= 50 ? colors.warning : colors.danger,
                  }]}>
                    {avg.toFixed(0)}%
                  </Text>
                </View>
                {s.marks.map((m, i) => (
                  <View key={i} style={styles.markRow}>
                    <Text style={styles.markType}>{m.type}</Text>
                    <Text style={styles.markScore}>
                      {m.score}/{m.maxScore}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })
        ) : (
          <Text style={styles.noData}>No marks recorded for this term yet.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },
  termBadge: {
    alignSelf: 'flex-start', backgroundColor: colors.accent, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginBottom: spacing.lg,
  },
  termText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  resultCard: {
    backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.xl,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center' },
  resultItem: { flex: 1, alignItems: 'center', gap: spacing.xs },
  resultDivider: { width: 1, height: 40, backgroundColor: colors.border },
  resultValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.foreground },
  resultLabel: { fontSize: fontSize.xs, color: colors.muted },
  commentBox: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  commentLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.muted, marginBottom: spacing.xs },
  commentText: { fontSize: fontSize.sm, color: colors.foreground, lineHeight: 20 },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.foreground, marginBottom: spacing.md },
  subjectCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2,
  },
  subjectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  subjectName: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.foreground },
  subjectAvg: { fontSize: fontSize.base, fontWeight: fontWeight.bold },
  markRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  markType: { fontSize: fontSize.sm, color: colors.muted },
  markScore: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.foreground },
  noData: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', padding: spacing.xl },
});
