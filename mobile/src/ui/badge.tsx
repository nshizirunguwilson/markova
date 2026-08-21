import { View } from 'react-native';
import { useTheme } from '@/design/provider';
import { radius, space, curve } from '@/design/tokens';
import { Text } from './text';

/**
 * A short status, coloured by what it means.
 *
 * The app has a lot of enum-shaped state: attendance is present, absent or
 * late; a loan is active, overdue, lost or returned; a result is published or
 * not; an appeal is pending, approved or rejected. All of it lands here so
 * that one meaning always gets one colour across the whole app.
 *
 * Tinted rather than solid. A solid pill is loud enough to compete with the
 * row title it sits beside, and the title is the thing being scanned.
 */

export type BadgeTone = 'neutral' | 'positive' | 'caution' | 'critical' | 'info' | 'brand';

export function Badge({
  label,
  tone = 'neutral',
  numeric,
}: {
  label: string;
  tone?: BadgeTone;
  numeric?: boolean;
}) {
  const t = useTheme();

  const skin =
    tone === 'neutral'
      ? { bg: t.bg.fill, fg: t.fg.secondary }
      : tone === 'brand'
        ? { bg: t.brand.tint, fg: t.brand.text }
        : { bg: t.status[tone].tint, fg: t.status[tone].text };

  return (
    <View
      style={{
        paddingHorizontal: space.sm + 2,
        paddingVertical: 3,
        borderRadius: radius.sm,
        backgroundColor: skin.bg,
        ...curve,
      }}
    >
      <Text variant="footnote" numeric={numeric} style={{ color: skin.fg }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The shared vocabulary. Anywhere a status is shown, it is looked up here, so
 * that OVERDUE is the same colour in the librarian's list as it is on the
 * admin dashboard.
 */
export const statusTone: Record<string, BadgeTone> = {
  // attendance
  PRESENT: 'positive',
  LATE: 'caution',
  ABSENT: 'critical',
  // loans
  ACTIVE: 'info',
  RETURNED: 'positive',
  OVERDUE: 'critical',
  LOST: 'critical',
  DAMAGED: 'caution',
  // appeals and tickets
  PENDING: 'caution',
  APPROVED: 'positive',
  REJECTED: 'critical',
  OPEN: 'caution',
  RESOLVED: 'positive',
  // students
  INACTIVE: 'neutral',
  GRADUATED: 'info',
  TRANSFERRED: 'neutral',
  // discipline
  VERBAL_WARNING: 'caution',
  WRITTEN_WARNING: 'caution',
  DETENTION: 'critical',
  SUSPENSION: 'critical',
  EXPULSION: 'critical',
};

/** Turns SCREAMING_SNAKE into something a person reads. */
export const humanise = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
