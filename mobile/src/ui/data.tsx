import { type ReactNode } from 'react';
import { Pressable, View, ScrollView } from 'react-native';
import { useTheme } from '@/design/provider';
import { curve, radius, space, touch } from '@/design/tokens';
import { Text } from './text';

/**
 * The pieces that show numbers, because this app is mostly numbers.
 */

// ─── Stat ───────────────────────────────────────────────────────────────────

/**
 * One figure and what it is.
 *
 * The figure leads at display size and the label sits under it, quiet. The
 * previous design did the reverse, with a small number inside a card that had
 * an icon, a coloured left border and a shadow, which meant four decorations
 * competing with the one thing worth reading.
 *
 * No card, no border, no icon. Just the number, given room.
 */
export function Stat({
  value,
  label,
  detail,
  tone = 'primary',
  onPress,
}: {
  value: string | number;
  label: string;
  detail?: string;
  tone?: 'primary' | 'positive' | 'caution' | 'critical' | 'brand';
  onPress?: () => void;
}) {
  const body = (
    <View style={{ gap: 2, minWidth: 96 }}>
      <Text variant="display" tone={tone} numeric selectable>
        {value}
      </Text>
      <Text variant="subhead" tone="secondary">
        {label}
      </Text>
      {detail ? (
        <Text variant="footnote" tone="tertiary">
          {detail}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  );
}

/** Stats side by side, separated by space rather than by boxes. */
export function StatRow({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xxl }}>{children}</View>
  );
}

// ─── Meter ──────────────────────────────────────────────────────────────────

/**
 * A proportion, drawn as a single bar.
 *
 * Used for attendance rate, marks entry completion, and conduct points. It is
 * a bar and not a ring because these are all read against a threshold, and a
 * bar makes "past halfway" legible at a glance in a way a ring does not.
 */
export function Meter({
  value,
  max = 100,
  tone = 'brand',
  label,
  showValue = true,
}: {
  value: number;
  max?: number;
  tone?: 'brand' | 'positive' | 'caution' | 'critical';
  label?: string;
  showValue?: boolean;
}) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(1, max === 0 ? 0 : value / max));
  const fill = tone === 'brand' ? t.brand.solid : t.status[tone].solid;

  return (
    <View style={{ gap: space.sm }}>
      {(label || showValue) && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
          {label ? (
            <Text variant="subhead" tone="secondary">
              {label}
            </Text>
          ) : (
            <View />
          )}
          {showValue ? (
            <Text variant="subhead" numeric>
              {Math.round(pct * 100)}%
            </Text>
          ) : null}
        </View>
      )}
      <View
        // Without `accessible` a View carrying a role is still not an
        // accessibility element, so the bar would be drawn and announced to
        // nobody.
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max, now: value }}
        style={{
          height: 6,
          borderRadius: radius.full,
          backgroundColor: t.bg.fill,
          overflow: 'hidden',
        }}
      >
        <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: fill }} />
      </View>
    </View>
  );
}

// ─── Segmented ──────────────────────────────────────────────────────────────

/**
 * Switching between views of the same thing: a term, a role filter, present
 * against absent. Scrolls horizontally once there are more options than fit,
 * because a term picker in a school with three terms and four years cannot be
 * a fixed row.
 *
 * Selection is the brand tint, which is the one place in the whole system
 * where a filled background means "this one", and it is why the contrast check
 * proves that pair separately.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const t = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: space.sm, paddingRight: space.lg }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => ({
              minHeight: touch.min,
              justifyContent: 'center',
              paddingHorizontal: space.lg,
              borderRadius: radius.full,
              backgroundColor: active ? t.brand.tint : pressed ? t.bg.fill : 'transparent',
              borderWidth: 1,
              borderColor: active ? t.brand.border : t.line.hairline,
              ...curve,
            })}
          >
            <Text variant="subhead" tone={active ? 'brand' : 'secondary'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Key value ──────────────────────────────────────────────────────────────

/**
 * A labelled fact on a detail screen. Label left, value right, hairline under.
 * This is what a record looks like on paper and it is what it should look like
 * here.
 */
export function Fact({
  label,
  value,
  mono,
  last,
}: {
  label: string;
  value: string | number | ReactNode;
  mono?: boolean;
  last?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.line.hairline,
      }}
    >
      <Text variant="callout" tone="secondary" style={{ flexShrink: 0 }}>
        {label}
      </Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text
          variant={mono ? 'code' : 'callout'}
          numeric={!mono}
          align="right"
          selectable
          style={{ flex: 1 }}
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}
