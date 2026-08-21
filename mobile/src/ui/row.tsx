import { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/design/provider';
import { gutter, space, touch } from '@/design/tokens';
import { Text } from './text';

/**
 * A line in a list.
 *
 * This is the most repeated element in the app by a wide margin. A person, a
 * book, a loan, a subject, a mark, a conversation, an incident. Getting the
 * rhythm of this one component right is most of what makes the app feel
 * consistent, so it takes a fixed shape and does not negotiate:
 *
 *   [ lead ]  title            [ value ]  [ > ]
 *             subtitle
 *
 * Rows are full bleed and separated by a hairline rather than by being
 * individually boxed and shadowed. A list of ten cards is ten competing
 * objects; a list of ten rows is one object with ten lines, which is what a
 * register actually is.
 */

export interface RowProps {
  title: string;
  subtitle?: string;
  /** Avatar, icon, or anything else that identifies the row at a glance. */
  lead?: ReactNode;
  /** A figure, a badge, or a short status on the right. */
  value?: ReactNode;
  onPress?: () => void;
  /** Draws the chevron. On by default whenever the row is pressable. */
  chevron?: boolean;
  /** Removes the hairline. Use on the last row of a group. */
  last?: boolean;
  /** Full bleed rows still need their content inset to the gutter. */
  inset?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}

export function Row({
  title,
  subtitle,
  lead,
  value,
  onPress,
  chevron,
  last,
  inset = true,
  destructive,
  disabled,
}: RowProps) {
  const t = useTheme();
  const pressable = Boolean(onPress) && !disabled;
  const showChevron = chevron ?? pressable;

  const content = (pressed: boolean) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: touch.comfortable,
        paddingVertical: space.md,
        paddingHorizontal: inset ? gutter : 0,
        backgroundColor: pressed ? t.bg.fillPressed : 'transparent',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {lead}

      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="bodyMedium" tone={destructive ? 'critical' : 'primary'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="subhead" tone="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {typeof value === 'string' || typeof value === 'number' ? (
        <Text variant="callout" tone="secondary" numeric>
          {value}
        </Text>
      ) : (
        value
      )}

      {showChevron ? <ChevronRight size={18} color={t.fg.placeholder} strokeWidth={2} /> : null}
    </View>
  );

  const line = last ? null : (
    <View
      style={{
        height: 1,
        backgroundColor: t.line.hairline,
        marginLeft: inset ? gutter : 0,
      }}
    />
  );

  if (!pressable) {
    return (
      <View>
        {content(false)}
        {line}
      </View>
    );
  }

  return (
    <View>
      <Pressable onPress={onPress} disabled={disabled}>
        {({ pressed }) => content(pressed)}
      </Pressable>
      {line}
    </View>
  );
}

/**
 * Wraps a run of rows so the group reads as one surface. No shadow, no radius
 * on the rows themselves, just a hairline above and below the run.
 */
export function RowGroup({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.bg.page,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: t.line.hairline,
      }}
    >
      {children}
    </View>
  );
}
