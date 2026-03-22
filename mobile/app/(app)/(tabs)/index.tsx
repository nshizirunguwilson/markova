import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  Calendar,
  BookOpen,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  ClipboardList,
  Users,
  Settings,
} from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth-store';
import { useParentChildren, useNotifications } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role;

  if (role === 'PARENT') return <ParentDashboard />;
  if (role === 'TEACHER') return <TeacherDashboard />;
  return <GenericDashboard />;
}

// ─── Parent Dashboard ─────────────────────────────────

function ParentDashboard() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const { data: children, isLoading, refetch } = useParentChildren();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Dashboard" subtitle={`Welcome, ${user?.firstName}`} />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Welcome */}
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeTitle}>My Children</Text>
          <Text style={styles.welcomeText}>
            Tap a child to view their attendance, marks, fees, and more.
          </Text>
        </View>

        {isLoading ? (
          <LoadingScreen />
        ) : children && children.length > 0 ? (
          children.map((child) => (
            <Pressable
              key={child.id}
              style={styles.childCard}
              onPress={() =>
                router.push({
                  pathname: '/(app)/child/[studentId]',
                  params: {
                    studentId: child.id,
                    name: `${child.user?.firstName} ${child.user?.lastName}`,
                  },
                })
              }
            >
              <View style={styles.childAvatar}>
                <Text style={styles.childAvatarText}>
                  {child.user?.firstName?.[0]}
                  {child.user?.lastName?.[0]}
                </Text>
              </View>
              <View style={styles.childInfo}>
                <Text style={styles.childName}>
                  {child.user?.firstName} {child.user?.lastName}
                </Text>
                <Text style={styles.childClass}>
                  {child.classSection?.classLevel?.name} - {child.classSection?.name}
                </Text>
                <Text style={styles.childId}>ID: {child.studentIdNumber}</Text>
              </View>
              <View style={styles.childActions}>
                <QuickAction icon={<Calendar size={16} color={colors.primary} />} label="Attendance" />
                <QuickAction icon={<TrendingUp size={16} color={colors.success} />} label="Marks" />
                <QuickAction icon={<DollarSign size={16} color={colors.warning} />} label="Fees" />
              </View>
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Users size={32} color={colors.mutedLight} />
            <Text style={styles.emptyText}>No children linked to your account yet.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function QuickAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.quickAction}>
      {icon}
      <Text style={styles.quickActionText}>{label}</Text>
    </View>
  );
}

// ─── Teacher Dashboard ────────────────────────────────

function TeacherDashboard() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const quickActions = [
    { icon: <ClipboardList size={24} color={colors.white} />, label: 'Take Attendance', bg: colors.primary, onPress: () => router.push('/(app)/(tabs)/attendance') },
    { icon: <TrendingUp size={24} color={colors.white} />, label: 'Enter Marks', bg: colors.success, onPress: () => router.push('/(app)/marks-entry') },
    { icon: <BookOpen size={24} color={colors.white} />, label: 'Homework', bg: colors.warning, onPress: () => router.push('/(app)/homework-manage') },
    { icon: <AlertTriangle size={24} color={colors.white} />, label: 'Discipline', bg: colors.danger, onPress: () => router.push('/(app)/discipline-log') },
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader title="Dashboard" subtitle={`Welcome, ${user?.firstName}`} />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeTitle}>Good {getTimeGreeting()}</Text>
          <Text style={styles.welcomeText}>Manage your classes and track student progress.</Text>
        </View>

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionGrid}>
          {quickActions.map((action, i) => (
            <Pressable key={i} style={[styles.actionCard, { backgroundColor: action.bg }]} onPress={action.onPress}>
              {action.icon}
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Today's Overview</Text>
        <View style={styles.statsGrid}>
          <StatCard title="Classes Today" value="--" color={colors.primaryLight} />
          <StatCard title="Attendance" value="--" color={colors.success} />
          <StatCard title="Pending Grades" value="--" color={colors.warning} />
          <StatCard title="Messages" value="--" color={colors.danger} />
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Generic Dashboard (Admin, Librarian) ──────────────

function GenericDashboard() {
  const user = useAuthStore((s) => s.user);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Dashboard" subtitle={`${getTimeGreeting()}, ${user?.firstName}`} />
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

// ─── Shared Components ────────────────────────────────

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );
}

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

// ─── Styles ───────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },
  welcomeCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing['2xl'],
    marginBottom: spacing.xl,
  },
  welcomeTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.white, marginBottom: spacing.sm },
  welcomeText: { fontSize: fontSize.sm, color: colors.accent, lineHeight: 20 },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.foreground, marginBottom: spacing.md, marginTop: spacing.sm },

  // Child cards (Parent)
  childCard: {
    backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  childAvatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  childAvatarText: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.white },
  childInfo: { marginBottom: spacing.md },
  childName: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.foreground },
  childClass: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  childId: { fontSize: fontSize.xs, color: colors.mutedLight, marginTop: 2 },
  childActions: { flexDirection: 'row', gap: spacing.md },
  quickAction: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accentLight, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  quickActionText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.medium },
  emptyCard: { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing['3xl'], alignItems: 'center' },
  emptyText: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.md, textAlign: 'center' },

  // Action grid (Teacher)
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  actionCard: {
    width: '47%', borderRadius: radius.xl, padding: spacing.lg, alignItems: 'center', justifyContent: 'center',
    minHeight: 100,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  actionLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.white, marginTop: spacing.sm, textAlign: 'center' },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statCard: {
    width: '47%', backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, borderLeftWidth: 4,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  statValue: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.foreground },
  statTitle: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.xs },
});
