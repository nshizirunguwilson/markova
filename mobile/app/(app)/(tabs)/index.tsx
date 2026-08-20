import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  Calendar, BookOpen, TrendingUp, AlertTriangle, ClipboardList,
  Users, Settings, BarChart3, GraduationCap, CreditCard, MessageSquare, Clock,
  FileText,
} from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth-store';
import {
  useParentChildren, useAdminDashboard, useNotifications,
  useTeacherDashboardStats, useLibraryAnalytics,
} from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorScreen } from '@/components/ErrorScreen';
import { getErrorType, getErrorMessage } from '@/hooks/useQueryError';
import { colors, fontSize, spacing, radius, fontFamily } from '@/constants/theme';

export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role;

  if (role === 'PARENT') return <ParentDashboard />;
  if (role === 'TEACHER') return <TeacherDashboard />;
  if (role === 'ADMIN') return <AdminDashboard />;
  return <GenericDashboard />;
}

// ─── Parent Dashboard ─────────────────────────────────

function ParentDashboard() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const { data: children, isLoading, error, refetch } = useParentChildren();
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
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeTitle}>My Children</Text>
          <Text style={styles.welcomeText}>
            Tap a child to view their attendance, marks, and more.
          </Text>
        </View>

        {isLoading ? (
          <LoadingScreen />
        ) : error ? (
          <ErrorScreen type={getErrorType(error)} message={getErrorMessage(error)} onRetry={() => refetch()} />
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
              </View>
              <View style={[styles.childActions, { marginTop: spacing.sm }]}>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/timetable',
                      params: {
                        classSectionId: child.classSectionId,
                        studentName: `${child.user?.firstName} ${child.user?.lastName}`,
                      },
                    })
                  }
                >
                  <QuickAction icon={<Clock size={16} color={colors.primaryLight} />} label="Timetable" />
                </Pressable>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/exam-schedule',
                      params: { classSectionId: child.classSectionId },
                    })
                  }
                >
                  <QuickAction icon={<FileText size={16} color={colors.danger} />} label="Exams" />
                </Pressable>
              </View>
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Users size={32} color={colors.muted} />
            <Text style={styles.emptyText}>No children linked to your account yet.</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <Pressable
          style={styles.chatWithTeachersBtn}
          onPress={() => router.push('/(app)/parent-teacher-chat')}
        >
          <View style={styles.chatWithTeachersIcon}>
            <MessageSquare size={22} color={colors.white} />
          </View>
          <View style={styles.chatWithTeachersInfo}>
            <Text style={styles.chatWithTeachersTitle}>Chat with Teachers</Text>
            <Text style={styles.chatWithTeachersText}>Send a direct message to your child's teachers</Text>
          </View>
        </Pressable>
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
  const { data: stats, isLoading, error, refetch } = useTeacherDashboardStats(user?.teacherId);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const quickActions = [
    { icon: <ClipboardList size={24} color={colors.white} />, label: 'Take Attendance', bg: colors.primary, onPress: () => router.push('/(app)/(tabs)/attendance') },
    { icon: <TrendingUp size={24} color={colors.white} />, label: 'Enter Marks', bg: colors.success, onPress: () => router.push('/(app)/marks-entry') },
    { icon: <BookOpen size={24} color={colors.white} />, label: 'Homework', bg: colors.warning, onPress: () => router.push('/(app)/homework-manage') },
    { icon: <AlertTriangle size={24} color={colors.white} />, label: 'Discipline', bg: colors.danger, onPress: () => router.push('/(app)/discipline-log') },
    { icon: <Clock size={24} color={colors.white} />, label: 'My Timetable', bg: colors.primaryLight, onPress: () => router.push('/(app)/timetable') },
    { icon: <FileText size={24} color={colors.white} />, label: 'Exam Schedule', bg: '#7D3C98', onPress: () => router.push('/(app)/exam-schedule') },
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
        {error ? (
          <ErrorScreen type={getErrorType(error)} message={getErrorMessage(error)} onRetry={() => refetch()} />
        ) : (
          <View style={styles.statsGrid}>
            <StatCard
              title="Classes Today"
              value={isLoading ? '...' : (stats?.classesToday ?? '--')}
              color={colors.primaryLight}
              icon={<Calendar size={18} color={colors.primaryLight} />}
            />
            <StatCard
              title="Attendance"
              value={isLoading ? '...' : (stats?.attendanceRate ?? '--')}
              color={colors.success}
              icon={<ClipboardList size={18} color={colors.success} />}
            />
            <StatCard
              title="Pending Grades"
              value={isLoading ? '...' : (stats?.pendingGrades ?? '--')}
              color={colors.warning}
              icon={<TrendingUp size={18} color={colors.warning} />}
            />
            <StatCard
              title="Messages"
              value={isLoading ? '...' : (stats?.unreadMessages ?? '--')}
              color={colors.danger}
              icon={<MessageSquare size={18} color={colors.danger} />}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Admin Dashboard (with real analytics) ───────────

function AdminDashboard() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const { data: dashboard, isLoading, error, refetch } = useAdminDashboard();
  const { data: notifications } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const quickActions = [
    { icon: <Settings size={24} color={colors.white} />, label: 'School Setup', bg: colors.primary, onPress: () => router.push('/(app)/onboarding') },
    { icon: <Users size={24} color={colors.white} />, label: 'Users', bg: colors.primaryLight, onPress: () => router.push('/(app)/(tabs)/users') },
    { icon: <CreditCard size={24} color={colors.white} />, label: 'NFC Cards', bg: colors.success, onPress: () => router.push('/(app)/nfc-register') },
    { icon: <BarChart3 size={24} color={colors.white} />, label: 'Analytics', bg: colors.warning, onPress: () => {} },
    { icon: <Settings size={24} color={colors.white} />, label: 'Settings', bg: '#7D3C98', onPress: () => router.push('/(app)/(tabs)/settings') },
  ];

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
          <Text style={styles.welcomeTitle}>School Overview</Text>
          <Text style={styles.welcomeText}>Manage your school from anywhere.</Text>
        </View>

        {isLoading ? (
          <LoadingScreen />
        ) : error ? (
          <ErrorScreen type={getErrorType(error)} message={getErrorMessage(error)} onRetry={() => refetch()} />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Key Metrics</Text>
            <View style={styles.statsGrid}>
              <StatCard
                title="Students"
                value={dashboard?.totalStudents ?? '--'}
                color={colors.primary}
                icon={<GraduationCap size={18} color={colors.primary} />}
              />
              <StatCard
                title="Teachers"
                value={dashboard?.totalTeachers ?? '--'}
                color={colors.success}
                icon={<Users size={18} color={colors.success} />}
              />
              <StatCard
                title="Parents"
                value={dashboard?.totalParents ?? '--'}
                color={colors.warning}
                icon={<Users size={18} color={colors.warning} />}
              />
              <StatCard
                title="Classes"
                value={dashboard?.totalClasses ?? '--'}
                color={colors.primaryLight}
                icon={<BookOpen size={18} color={colors.primaryLight} />}
              />
            </View>

            {(dashboard?.attendanceRate !== undefined || dashboard?.averagePerformance !== undefined) && (
              <>
                <Text style={styles.sectionTitle}>Performance</Text>
                <View style={styles.statsGrid}>
                  {dashboard?.attendanceRate !== undefined && (
                    <StatCard
                      title="Attendance Rate"
                      value={`${Math.round(dashboard.attendanceRate)}%`}
                      color={colors.success}
                    />
                  )}
                  {dashboard?.averagePerformance !== undefined && (
                    <StatCard
                      title="Avg Performance"
                      value={`${Math.round(dashboard.averagePerformance)}%`}
                      color={colors.primary}
                    />
                  )}
                </View>
              </>
            )}
          </>
        )}

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionGrid}>
          {quickActions.map((action, i) => (
            <Pressable key={i} style={[styles.actionCard, { backgroundColor: action.bg }]} onPress={action.onPress}>
              {action.icon}
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Generic Dashboard (Librarian) ──────────────────

function GenericDashboard() {
  const user = useAuthStore((s) => s.user);
  const isLibrarian = user?.role === 'LIBRARIAN';
  const { data: analytics, isLoading, error, refetch } = useLibraryAnalytics(isLibrarian);
  const { data: notifications } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const unreadCount = notifications?.filter((n: any) => !n.isRead).length ?? 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

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
            {isLibrarian ? 'Manage the library catalog and loans.' : 'Your school management hub.'}
          </Text>
        </View>

        {isLoading ? (
          <LoadingScreen />
        ) : error ? (
          <ErrorScreen type={getErrorType(error)} message={getErrorMessage(error)} onRetry={() => refetch()} />
        ) : isLibrarian && analytics ? (
          <>
            <Text style={styles.sectionTitle}>Library Overview</Text>
            <View style={styles.statsGrid}>
              <StatCard
                title="Total Books"
                value={analytics.totalBooks}
                color={colors.primary}
                icon={<BookOpen size={18} color={colors.primary} />}
              />
              <StatCard
                title="Available"
                value={analytics.availableCopies}
                color={colors.success}
                icon={<BookOpen size={18} color={colors.success} />}
              />
              <StatCard
                title="Active Loans"
                value={analytics.activeLoans}
                color={colors.warning}
                icon={<Users size={18} color={colors.warning} />}
              />
              <StatCard
                title="Overdue"
                value={analytics.overdueLoans}
                color={colors.danger}
                icon={<AlertTriangle size={18} color={colors.danger} />}
              />
            </View>

            {analytics.overdueRate > 0 && (
              <View style={styles.overdueBar}>
                <AlertTriangle size={16} color={colors.danger} />
                <Text style={styles.overdueBarText}>
                  {analytics.overdueRate}% overdue rate
                  {analytics.lostBooks > 0 ? ` · ${analytics.lostBooks} lost` : ''}
                </Text>
              </View>
            )}

            {analytics.popularBooks && analytics.popularBooks.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Most Borrowed</Text>
                {analytics.popularBooks.slice(0, 5).map((book, i) => (
                  <View key={i} style={styles.popularBookRow}>
                    <View style={styles.popularBookRank}>
                      <Text style={styles.popularBookRankText}>{i + 1}</Text>
                    </View>
                    <View style={styles.popularBookInfo}>
                      <Text style={styles.popularBookTitle} numberOfLines={1}>{book.title}</Text>
                      <Text style={styles.popularBookAuthor} numberOfLines={1}>{book.author}</Text>
                    </View>
                    <Text style={styles.popularBookCount}>{book.loanCount} loans</Text>
                  </View>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Quick Stats</Text>
            <View style={styles.statsGrid}>
              <StatCard title="Notifications" value={unreadCount} color={colors.primaryLight} />
              <StatCard title="Messages" value="--" color={colors.success} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Shared Components ────────────────────────────────

function StatCard({ title, value, color, icon }: { title: string; value: string | number; color: string; icon?: React.ReactNode }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      {icon && <View style={styles.statIcon}>{icon}</View>}
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
    borderRadius: radius['2xl'],
    padding: spacing['2xl'],
    marginBottom: spacing.xl,
  },
  welcomeTitle: { fontSize: fontSize.xl, fontFamily: fontFamily.bold, color: colors.white, marginBottom: spacing.sm },
  welcomeText: { fontSize: fontSize.sm, color: colors.accent, lineHeight: 20, fontFamily: fontFamily.regular },
  sectionTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.semibold, color: colors.foreground, marginBottom: spacing.md, marginTop: spacing.sm },

  // Child cards (Parent)
  childCard: {
    backgroundColor: colors.white, borderRadius: radius['2xl'], padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  childAvatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  childAvatarText: { fontSize: fontSize.lg, fontFamily: fontFamily.bold, color: colors.white },
  childInfo: { marginBottom: spacing.md },
  childName: { fontSize: fontSize.lg, fontFamily: fontFamily.bold, color: colors.foreground },
  childClass: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2, fontFamily: fontFamily.regular },
  childId: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2, fontFamily: fontFamily.regular },
  childActions: { flexDirection: 'row', gap: spacing.md },
  quickAction: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accentLight, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  quickActionText: { fontSize: fontSize.xs, color: colors.primary, fontFamily: fontFamily.medium },
  emptyCard: { backgroundColor: colors.white, borderRadius: radius['2xl'], padding: spacing['3xl'], alignItems: 'center' },
  emptyText: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.md, textAlign: 'center', fontFamily: fontFamily.regular },
  chatWithTeachersBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius['2xl'], padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  chatWithTeachersIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  chatWithTeachersInfo: { flex: 1 },
  chatWithTeachersTitle: { fontSize: fontSize.base, fontFamily: fontFamily.semibold, color: colors.foreground },
  chatWithTeachersText: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2, fontFamily: fontFamily.regular },

  // Action grid (Teacher/Admin)
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  actionCard: {
    width: '47%', borderRadius: radius['2xl'], padding: spacing.lg, alignItems: 'center', justifyContent: 'center',
    minHeight: 100,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  actionLabel: { fontSize: fontSize.sm, fontFamily: fontFamily.semibold, color: colors.white, marginTop: spacing.sm, textAlign: 'center' },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statCard: {
    width: '47%', backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, borderLeftWidth: 4,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  statIcon: { marginBottom: spacing.xs },
  statValue: { fontSize: fontSize['2xl'], fontFamily: fontFamily.bold, color: colors.foreground },
  statTitle: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.xs, fontFamily: fontFamily.regular },

  // Librarian dashboard
  overdueBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.dangerWash, borderRadius: radius.xl,
    padding: spacing.md, marginTop: spacing.md,
  },
  overdueBarText: { fontSize: fontSize.sm, color: colors.danger, fontFamily: fontFamily.medium },
  popularBookRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  popularBookRank: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  popularBookRankText: { fontSize: fontSize.sm, fontFamily: fontFamily.bold, color: colors.primary },
  popularBookInfo: { flex: 1 },
  popularBookTitle: { fontSize: fontSize.sm, fontFamily: fontFamily.semibold, color: colors.foreground },
  popularBookAuthor: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1, fontFamily: fontFamily.regular },
  popularBookCount: { fontSize: fontSize.xs, color: colors.muted, fontFamily: fontFamily.medium },
});
