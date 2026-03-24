import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BookOpen, Calendar, CheckCircle, Clock, AlertCircle } from 'lucide-react-native';
import { useStudentHomework } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorScreen } from '@/components/ErrorScreen';
import { getErrorType, getErrorMessage } from '@/hooks/useQueryError';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

export default function ChildHomeworkScreen() {
  const router = useRouter();
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const { data: homework, isLoading, error, refetch } = useStudentHomework(studentId);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const now = new Date();

  const getStatus = (hw: any) => {
    const sub = hw.submissions?.[0];
    if (sub?.marks != null) return { label: `Graded: ${sub.marks}/${hw.maxMarks ?? '?'}`, color: colors.success, icon: <CheckCircle size={16} color={colors.success} /> };
    if (sub) return { label: 'Submitted', color: colors.primaryLight, icon: <CheckCircle size={16} color={colors.primaryLight} /> };
    if (new Date(hw.dueDate) < now) return { label: 'Overdue', color: colors.danger, icon: <AlertCircle size={16} color={colors.danger} /> };
    return { label: 'Pending', color: colors.warning, icon: <Clock size={16} color={colors.warning} /> };
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Homework" subtitle={name} onBack={() => router.back()} />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {isLoading ? (
          <LoadingScreen />
        ) : error ? (
          <ErrorScreen type={getErrorType(error)} message={getErrorMessage(error)} onRetry={() => refetch()} />
        ) : homework && homework.length > 0 ? (
          homework.map((hw) => {
            const status = getStatus(hw);
            return (
              <View key={hw.id} style={styles.hwCard}>
                <View style={styles.hwHeader}>
                  <View style={styles.subjectBadge}>
                    <BookOpen size={14} color={colors.primary} />
                    <Text style={styles.subjectText}>{hw.subject?.name ?? 'Subject'}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: status.color + '20' }]}>
                    {status.icon}
                    <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                  </View>
                </View>
                <Text style={styles.hwTitle}>{hw.title}</Text>
                {hw.description && (
                  <Text style={styles.hwDesc} numberOfLines={2}>{hw.description}</Text>
                )}
                <View style={styles.hwFooter}>
                  <Calendar size={14} color={colors.muted} />
                  <Text style={styles.hwDue}>
                    Due: {new Date(hw.dueDate).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </Text>
                  {hw.maxMarks && (
                    <Text style={styles.hwMarks}>Max: {hw.maxMarks}</Text>
                  )}
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.noData}>No homework assignments found.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },
  hwCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2,
  },
  hwHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  subjectBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.accentLight, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  subjectText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  hwTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.foreground, marginBottom: spacing.xs },
  hwDesc: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 18, marginBottom: spacing.sm },
  hwFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hwDue: { fontSize: fontSize.xs, color: colors.muted, flex: 1 },
  hwMarks: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.foreground },
  noData: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', padding: spacing.xl },
});
