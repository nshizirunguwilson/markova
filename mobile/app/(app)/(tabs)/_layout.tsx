import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import {
  Home,
  MessageSquare,
  Bell,
  User,
  Users,
  BookOpen,
  ClipboardList,
  Settings,
} from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { useNotifications } from '@/hooks/useApi';
import { colors, fontSize, fontWeight } from '@/constants/theme';
import type { UserRole } from '@/constants/config';

type TabConfig = {
  name: string;
  title: string;
  icon: typeof Home;
  badge?: 'messages' | 'notifications';
};

const ROLE_TABS: Record<UserRole, TabConfig[]> = {
  ADMIN: [
    { name: 'index', title: 'Dashboard', icon: Home },
    { name: 'users', title: 'Users', icon: Users },
    { name: 'messages', title: 'Messages', icon: MessageSquare, badge: 'messages' },
    { name: 'settings', title: 'Settings', icon: Settings },
  ],
  TEACHER: [
    { name: 'index', title: 'Dashboard', icon: Home },
    { name: 'attendance', title: 'Attendance', icon: ClipboardList },
    { name: 'messages', title: 'Messages', icon: MessageSquare, badge: 'messages' },
    { name: 'profile', title: 'Profile', icon: User },
  ],
  PARENT: [
    { name: 'index', title: 'Dashboard', icon: Home },
    { name: 'messages', title: 'Messages', icon: MessageSquare, badge: 'messages' },
    { name: 'notifications', title: 'Alerts', icon: Bell, badge: 'notifications' },
    { name: 'profile', title: 'Profile', icon: User },
  ],
  LIBRARIAN: [
    { name: 'index', title: 'Dashboard', icon: Home },
    { name: 'library', title: 'Library', icon: BookOpen },
    { name: 'messages', title: 'Messages', icon: MessageSquare, badge: 'messages' },
    { name: 'profile', title: 'Profile', icon: User },
  ],
};

const ALL_TAB_NAMES = ['index', 'users', 'attendance', 'messages', 'notifications', 'library', 'settings', 'profile'];

export default function TabsLayout() {
  const user = useAuthStore((s) => s.user);
  const chatUnread = useChatStore((s) => s.unreadCount);
  const { data: notifications } = useNotifications();
  const notifUnread = notifications?.filter((n) => !n.isRead).length ?? 0;

  // Connect chat on app load
  const connect = useChatStore((s) => s.connect);
  useEffect(() => {
    connect();
  }, []);

  const role = user?.role ?? 'PARENT';
  const tabs = ROLE_TABS[role] ?? ROLE_TABS.PARENT;
  const visibleNames = new Set(tabs.map((t) => t.name));

  const getBadge = (badge?: 'messages' | 'notifications') => {
    if (badge === 'messages' && chatUnread > 0) return chatUnread > 99 ? '99+' : String(chatUnread);
    if (badge === 'notifications' && notifUnread > 0) return notifUnread > 99 ? '99+' : String(notifUnread);
    return undefined;
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: fontSize.xs,
          fontWeight: fontWeight.medium,
        },
      }}
    >
      {ALL_TAB_NAMES.map((name) => {
        const tab = tabs.find((t) => t.name === name);
        const isVisible = visibleNames.has(name);
        const badge = tab ? getBadge(tab.badge) : undefined;

        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title: tab?.title ?? name,
              href: isVisible ? undefined : null,
              tabBarBadge: badge,
              tabBarBadgeStyle: badge ? badgeStyle : undefined,
              tabBarIcon: tab
                ? ({ color, size }) => {
                    const Icon = tab.icon;
                    return <Icon size={size} color={color} />;
                  }
                : undefined,
            }}
          />
        );
      })}
    </Tabs>
  );
}

const badgeStyle = {
  backgroundColor: colors.danger,
  color: colors.white,
  fontSize: 10,
  fontWeight: '700' as const,
  minWidth: 18,
  height: 18,
  lineHeight: 14,
  borderRadius: 9,
};
