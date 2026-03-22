import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { ScreenHeader } from '@/components/ScreenHeader';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // TODO: refresh dashboard data
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Dashboard"
        subtitle={`${greeting()}, ${user?.firstName ?? 'User'}`}
      />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeTitle}>Welcome to Markova</Text>
          <Text style={styles.welcomeText}>
            {user?.role === 'ADMIN' && 'Manage your school from anywhere.'}
            {user?.role === 'TEACHER' && 'Track attendance and manage your classes.'}
            {user?.role === 'PARENT' && "Stay connected with your child's progress."}
            {user?.role === 'LIBRARIAN' && 'Manage the library catalog and loans.'}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Quick Stats</Text>
        <View style={styles.statsGrid}>
          <StatCard title="Notifications" value="--" color={colors.primaryLight} />
          <StatCard title="Messages" value="--" color={colors.success} />
          <StatCard title="Pending" value="--" color={colors.warning} />
          <StatCard title="Alerts" value="--" color={colors.danger} />
        </View>
      </ScrollView>
    </View>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg },
  welcomeCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing['2xl'],
    marginBottom: spacing.xl,
  },
  welcomeTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.white,
    marginBottom: spacing.sm,
  },
  welcomeText: {
    fontSize: fontSize.sm,
    color: colors.accent,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  statCard: {
    width: '47%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderLeftWidth: 4,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  statValue: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.foreground,
  },
  statTitle: {
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: spacing.xs,
  },
});
