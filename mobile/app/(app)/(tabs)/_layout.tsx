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
import { colors, fontSize, fontWeight } from '@/constants/theme';
import type { UserRole } from '@/constants/config';

type TabConfig = {
  name: string;
  title: string;
  icon: typeof Home;
};

const ROLE_TABS: Record<UserRole, TabConfig[]> = {
  ADMIN: [
    { name: 'index', title: 'Dashboard', icon: Home },
    { name: 'users', title: 'Users', icon: Users },
    { name: 'messages', title: 'Messages', icon: MessageSquare },
    { name: 'settings', title: 'Settings', icon: Settings },
  ],
  TEACHER: [
    { name: 'index', title: 'Dashboard', icon: Home },
    { name: 'attendance', title: 'Attendance', icon: ClipboardList },
    { name: 'messages', title: 'Messages', icon: MessageSquare },
    { name: 'profile', title: 'Profile', icon: User },
  ],
  PARENT: [
    { name: 'index', title: 'Dashboard', icon: Home },
    { name: 'messages', title: 'Messages', icon: MessageSquare },
    { name: 'notifications', title: 'Alerts', icon: Bell },
    { name: 'profile', title: 'Profile', icon: User },
  ],
  LIBRARIAN: [
    { name: 'index', title: 'Dashboard', icon: Home },
    { name: 'library', title: 'Library', icon: BookOpen },
    { name: 'messages', title: 'Messages', icon: MessageSquare },
    { name: 'profile', title: 'Profile', icon: User },
  ],
};

// All possible tab screen names
const ALL_TAB_NAMES = ['index', 'users', 'attendance', 'messages', 'notifications', 'library', 'settings', 'profile'];

export default function TabsLayout() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'PARENT';
  const tabs = ROLE_TABS[role] ?? ROLE_TABS.PARENT;
  const visibleNames = new Set(tabs.map((t) => t.name));

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

        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title: tab?.title ?? name,
              href: isVisible ? undefined : null,
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
