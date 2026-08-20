import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, Pressable, RefreshControl,
} from 'react-native';
import {
  Bell, Calendar, TrendingUp, AlertTriangle, BookOpen, MessageSquare,
  CheckCircle,
} from 'lucide-react-native';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorScreen } from '@/components/ErrorScreen';
import { getErrorType, getErrorMessage } from '@/hooks/useQueryError';
import { colors, fontSize, spacing, radius, fontFamily } from '@/constants/theme';
import type { Notification } from '@/types';

export default function NotificationsScreen() {
  const { data: notifications, isLoading, error, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handlePress = (notification: Notification) => {
    if (!notification.isRead) {
      markRead.mutate(notification.id);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'ATTENDANCE': return <Calendar size={20} color={colors.primaryLight} />;
      case 'MARKS': return <TrendingUp size={20} color={colors.success} />;
      case 'DISCIPLINE': return <AlertTriangle size={20} color={colors.danger} />;
      case 'HOMEWORK': return <BookOpen size={20} color={colors.primary} />;
      case 'MESSAGE': return <MessageSquare size={20} color={colors.primaryLight} />;
      default: return <Bell size={20} color={colors.muted} />;
    }
  };

  const getIconBg = (type: string) => {
    switch (type) {
      case 'ATTENDANCE': return colors.accentLight;
      case 'MARKS': return colors.successWash;
      case 'DISCIPLINE': return colors.dangerWash;
      case 'HOMEWORK': return colors.accentLight;
      default: return colors.surfaceMuted;
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Notifications" subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined} />
      {unreadCount > 0 && (
        <Pressable
          style={styles.markAllBtn}
          onPress={() => markAllRead.mutate()}
          disabled={markAllRead.isPending}
        >
          <CheckCircle size={16} color={colors.primary} />
          <Text style={styles.markAllText}>
            {markAllRead.isPending ? 'Marking...' : 'Mark All as Read'}
          </Text>
        </Pressable>
      )}
      {isLoading ? (
        <LoadingScreen />
      ) : error ? (
        <ErrorScreen type={getErrorType(error)} message={getErrorMessage(error)} onRetry={() => refetch()} />
      ) : notifications && notifications.length > 0 ? (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.notifRow, !item.isRead && styles.notifUnread]}
              onPress={() => handlePress(item)}
            >
              <View style={[styles.notifIcon, { backgroundColor: getIconBg(item.type) }]}>
                {getIcon(item.type)}
              </View>
              <View style={styles.notifContent}>
                <View style={styles.notifTopRow}>
                  <Text style={[styles.notifTitle, !item.isRead && styles.notifTitleBold]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.notifTime}>{formatTime(item.createdAt)}</Text>
                </View>
                <Text style={styles.notifMessage} numberOfLines={2}>
                  {item.message}
                </Text>
              </View>
              {!item.isRead && <View style={styles.unreadDot} />}
            </Pressable>
          )}
        />
      ) : (
        <View style={styles.empty}>
          <CheckCircle size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>All Caught Up</Text>
          <Text style={styles.emptyText}>No notifications at the moment.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  markAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingVertical: spacing.sm, backgroundColor: colors.accentLight,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  markAllText: { fontSize: fontSize.sm, color: colors.primary, fontFamily: fontFamily.semibold },
  notifRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted,
    backgroundColor: colors.white,
  },
  notifUnread: { backgroundColor: colors.accentLight },
  notifIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  notifContent: { flex: 1 },
  notifTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notifTitle: { fontSize: fontSize.sm, color: colors.foreground, flex: 1, fontFamily: fontFamily.regular },
  notifTitleBold: { fontFamily: fontFamily.bold },
  notifTime: { fontSize: fontSize.xs, color: colors.muted, fontFamily: fontFamily.regular },
  notifMessage: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2, lineHeight: 18, fontFamily: fontFamily.regular },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] },
  emptyTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.semibold, color: colors.foreground, marginTop: spacing.lg },
  emptyText: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.sm, fontFamily: fontFamily.regular },
});
