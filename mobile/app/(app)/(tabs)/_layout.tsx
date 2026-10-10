import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  House,
  Users,
  GraduationCap,
  ClipboardCheck,
  MessageSquare,
  Bell,
  BookOpen,
  ArrowLeftRight,
  Backpack,
  HeartPulse,
  Wallet,
  Ellipsis,
  type LucideIcon,
} from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { useNotifications } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { type as typeScale, touch } from '@/design/tokens';

/**
 * Four tabs and More, per role.
 *
 * Five is where a tab bar stops being scannable and starts being a menu, and
 * four of the roles here need more than five destinations. So each role gets
 * the four places it actually goes during a week, and everything used monthly
 * lives behind More.
 *
 * The test for a tab: used at least weekly by that role, and a place rather
 * than an action. Marks entry is the single most used screen a teacher has and
 * it is still not a tab, because it is something you do to a class you picked,
 * not somewhere you go.
 */

type Slot = {
  name: string;
  title: string;
  icon: LucideIcon;
  badge?: 'messages' | 'notifications';
};

// Every tab file that exists. Each role shows a subset and the rest are given
// href: null, which keeps the route reachable by push while hiding the button.
const ALL: string[] = [
  'index',
  'people',
  'academics',
  'classes',
  'attendance',
  'children',
  'alerts',
  'books',
  'circulate',
  'clinic',
  'money',
  'messages',
  'more',
];

const home: Slot = { name: 'index', title: 'Home', icon: House };
const messages: Slot = { name: 'messages', title: 'Messages', icon: MessageSquare, badge: 'messages' };
const more: Slot = { name: 'more', title: 'More', icon: Ellipsis };

const ROLE_TABS: Record<string, Slot[]> = {
  ADMIN: [
    home,
    { name: 'people', title: 'People', icon: Users },
    { name: 'academics', title: 'Academics', icon: GraduationCap },
    messages,
    more,
  ],
  TEACHER: [
    home,
    { name: 'classes', title: 'Classes', icon: Backpack },
    { name: 'attendance', title: 'Register', icon: ClipboardCheck },
    messages,
    more,
  ],
  PARENT: [
    home,
    { name: 'children', title: 'Children', icon: GraduationCap },
    messages,
    { name: 'alerts', title: 'Alerts', icon: Bell, badge: 'notifications' },
    more,
  ],
  LIBRARIAN: [
    home,
    { name: 'books', title: 'Books', icon: BookOpen },
    { name: 'circulate', title: 'Desk', icon: ArrowLeftRight },
    messages,
    more,
  ],
  // Boarding staff live in the dormitory, not at a desk. Money and the sick
  // bay are their week; nothing academic appears at all, because a matron has
  // no business reading marks.
  PATRON: [
    home,
    { name: 'money', title: 'Money', icon: Wallet },
    { name: 'clinic', title: 'Clinic', icon: HeartPulse },
    messages,
    more,
  ],
  MATRON: [
    home,
    { name: 'money', title: 'Money', icon: Wallet },
    { name: 'clinic', title: 'Clinic', icon: HeartPulse },
    messages,
    more,
  ],
  // A nurse holds no money. Putting the counter in front of her would be a
  // tab she never presses.
  NURSE: [
    home,
    { name: 'clinic', title: 'Clinic', icon: HeartPulse },
    messages,
    { name: 'alerts', title: 'Alerts', icon: Bell, badge: 'notifications' },
    more,
  ],
};

export default function TabsLayout() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const role = useAuthStore((s) => s.user?.role) ?? 'PARENT';
  const chatUnread = useChatStore((s) => s.unreadCount);
  const connect = useChatStore((s) => s.connect);

  const { data: notifications } = useNotifications();
  const alertUnread = notifications?.filter((n) => !n.isRead).length ?? 0;

  useEffect(() => {
    connect();
  }, [connect]);

  const tabs = ROLE_TABS[role] ?? ROLE_TABS.PARENT;
  const visible = new Set(tabs.map((s) => s.name));

  const badgeFor = (kind?: Slot['badge']) => {
    const count = kind === 'messages' ? chatUnread : kind === 'notifications' ? alertUnread : 0;
    if (!count) return undefined;
    return count > 99 ? '99+' : String(count);
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Tab screens have no header to sit under. iOS insets their scroll
        // views past the status bar on its own; Android draws edge to edge
        // from SDK 57 and does not, so every tab's headline ran under the
        // clock until the scene was pushed down here.
        sceneStyle: {
          backgroundColor: t.bg.page,
          paddingTop: Platform.OS === 'android' ? insets.top : 0,
        },
        tabBarActiveTintColor: t.brand.text,
        tabBarInactiveTintColor: t.fg.tertiary,
        tabBarStyle: {
          backgroundColor: t.bg.page,
          // A hairline, not a shadow. The tab bar sits on the page rather
          // than floating above it.
          borderTopWidth: 1,
          borderTopColor: t.line.hairline,
          elevation: 0,
          height: touch.comfortable + 30,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontFamily: typeScale.caption.fontFamily,
          fontSize: 11,
          letterSpacing: 0.1,
          textTransform: 'none',
        },
        tabBarItemStyle: { paddingVertical: 2 },
      }}
    >
      {/*
        The role's own tabs first, in the order that role reads them, then
        every other tab file hidden behind href: null. Declaration order is
        what the bar draws, so listing ALL as it comes would put a parent's
        alerts before their messages regardless of what ROLE_TABS says.
      */}
      {[...tabs.map((s) => s.name), ...ALL.filter((n) => !visible.has(n))].map((name) => {
        const slot = tabs.find((s) => s.name === name);
        const badge = slot ? badgeFor(slot.badge) : undefined;

        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title: slot?.title ?? name,
              href: visible.has(name) ? undefined : null,
              tabBarBadge: badge,
              tabBarBadgeStyle: {
                backgroundColor: t.status.critical.solid,
                color: '#FFFFFF',
                fontFamily: typeScale.caption.fontFamily,
                fontSize: 10,
                lineHeight: 14,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
              },
              tabBarIcon: slot
                ? ({ color, focused }) => {
                    const Icon = slot.icon;
                    // Weight carries the active state as well as colour, so
                    // the bar still reads for anyone who cannot see the tint.
                    return <Icon size={23} color={color} strokeWidth={focused ? 2.3 : 1.8} />;
                  }
                : undefined,
            }}
          />
        );
      })}
    </Tabs>
  );
}
