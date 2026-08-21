import { useRouter } from 'expo-router';
import { View } from 'react-native';
import {
  User,
  Settings,
  LifeBuoy,
  CalendarDays,
  CalendarClock,
  FileText,
  CreditCard,
  ArrowUpCircle,
  BarChart3,
  Building2,
  Bell,
  BookOpen,
  ClipboardList,
  AlertTriangle,
  Rocket,
  LogOut,
  type LucideIcon,
} from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Avatar, Text, Badge } from '@/ui';

/**
 * Everything that did not earn a tab.
 *
 * Ordered by how often it is reached for, not by category. An admin opens
 * reports at the end of a term and school settings twice a year, so reports
 * sits above settings even though a tidier mind would file both under
 * administration.
 *
 * Signing out is last, on its own, and not red. It is not destructive, it is
 * just leaving.
 */

type Item = { label: string; hint?: string; icon: LucideIcon; href: string; roles?: string[] };

const WORK: Item[] = [
  { label: 'Timetable', hint: 'The week', icon: CalendarDays, href: '/(app)/timetable' },
  { label: 'Exam schedule', icon: CalendarClock, href: '/(app)/exam-schedule' },
  {
    label: 'Marks entry',
    hint: 'Enter marks for a class',
    icon: ClipboardList,
    href: '/(app)/marks-entry',
    roles: ['TEACHER', 'ADMIN'],
  },
  { label: 'Homework', icon: BookOpen, href: '/(app)/homework-manage', roles: ['TEACHER', 'ADMIN'] },
  { label: 'Discipline', icon: AlertTriangle, href: '/(app)/discipline-log', roles: ['TEACHER', 'ADMIN'] },
  { label: 'Class analytics', icon: BarChart3, href: '/(app)/class-analytics', roles: ['TEACHER'] },
];

const ADMIN: Item[] = [
  { label: 'Report cards', hint: 'Calculate, comment, publish', icon: FileText, href: '/(app)/reports', roles: ['ADMIN'] },
  { label: 'ID cards', hint: 'Issue and revoke', icon: CreditCard, href: '/(app)/id-cards', roles: ['ADMIN'] },
  { label: 'Promotion', hint: 'End of year decisions', icon: ArrowUpCircle, href: '/(app)/promotion', roles: ['ADMIN'] },
  { label: 'Analytics', icon: BarChart3, href: '/(app)/analytics', roles: ['ADMIN'] },
  { label: 'School settings', hint: 'Name, colour, logo, stamp', icon: Building2, href: '/(app)/school', roles: ['ADMIN'] },
  { label: 'Setup wizard', icon: Rocket, href: '/(app)/onboarding', roles: ['ADMIN'] },
];

const YOU: Item[] = [
  { label: 'Alerts', icon: Bell, href: '/(app)/(tabs)/alerts' },
  { label: 'Your profile', icon: User, href: '/(app)/profile' },
  { label: 'Settings', icon: Settings, href: '/(app)/settings' },
  { label: 'Help and support', icon: LifeBuoy, href: '/(app)/help' },
];

export default function More() {
  const t = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const role = user?.role ?? 'PARENT';
  const allowed = (items: Item[]) => items.filter((i) => !i.roles || i.roles.includes(role));

  const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'You';
  const work = allowed(WORK);
  const admin = allowed(ADMIN);

  const group = (items: Item[]) => (
    <RowGroup>
      {items.map((item, i) => (
        <Row
          key={item.href + item.label}
          title={item.label}
          subtitle={item.hint}
          lead={<item.icon size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
          onPress={() => router.push(item.href as never)}
          last={i === items.length - 1}
        />
      ))}
    </RowGroup>
  );

  return (
    <Screen bleed contentContainerStyle={{ paddingHorizontal: 0, gap: space.xxl }}>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.sm }}>
        <Row
          title={name}
          subtitle={user?.email ?? user?.phone ?? undefined}
          lead={<Avatar name={name} photoUrl={user?.photoUrl} size="lg" />}
          value={<Badge label={role.charAt(0) + role.slice(1).toLowerCase()} tone="brand" />}
          onPress={() => router.push('/(app)/profile')}
          last
          inset={false}
        />
      </View>

      {work.length ? <Section title="Your work">{group(work)}</Section> : null}
      {admin.length ? <Section title="Running the school">{group(admin)}</Section> : null}
      <Section title="You">{group(YOU)}</Section>

      <View style={{ paddingHorizontal: space.xl, paddingTop: space.md, gap: space.lg }}>
        <RowGroup>
          <Row
            title="Sign out"
            lead={<LogOut size={20} color={t.fg.tertiary} strokeWidth={1.9} />}
            chevron={false}
            onPress={() => {
              void logout().then(() => router.replace('/(auth)/login'));
            }}
            last
          />
        </RowGroup>

        <Text variant="footnote" tone="placeholder" align="center">
          Markova
        </Text>
      </View>
    </Screen>
  );
}
