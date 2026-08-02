import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
} from 'react-native-reanimated';
import { useTheme } from '@/design/provider';
import { radius, space, curve, gutter } from '@/design/tokens';
import { duration, useReducedMotion, withReducedMotion } from '@/design/motion';
import { Text } from './text';
import { Button } from './button';

/**
 * The three states every list in this app can be in besides having content.
 *
 * They live together because they have to agree with each other. A list that
 * shows six skeleton rows while loading and then a centred illustration when
 * empty makes the screen jump twice. These all occupy the same region and
 * keep the same rhythm.
 */

// ─── Loading ────────────────────────────────────────────────────────────────

/**
 * A skeleton shaped like the thing that is coming, not a spinner.
 *
 * A spinner says "wait". A skeleton says "here is what you are about to read
 * and roughly how much of it there is", which is the more useful thing to say
 * to a teacher who is deciding whether they have time to do this now.
 *
 * The pulse is opacity only, at a low amplitude and a slow period. A shimmer
 * sweeping across the screen is motion for its own sake.
 */
export function Skeleton({ height = 16, width = '100%', round }: { height?: number; width?: number | `${number}%`; round?: boolean }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(reduced ? 0.85 : 0.5);

  useEffect(() => {
    // An infinite pulse is the clearest example of the motion the vestibular
    // guidance warns about, so when motion is turned down the placeholder sits
    // still at a fixed opacity. It still says "something is coming", which is
    // the whole job it had.
    if (reduced) {
      pulse.value = 0.85;
      return;
    }
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withTiming(0.5, { duration: 700 })),
      -1,
      false,
    );
  }, [pulse, reduced]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[
        {
          height,
          width,
          borderRadius: round ? radius.full : radius.sm,
          backgroundColor: t.bg.fill,
          ...curve,
        },
        style,
      ]}
    />
  );
}

/** A run of skeleton rows matching the shape of Row. */
export function LoadingRows({ count = 5, lead = false }: { count?: number; lead?: boolean }) {
  return (
    <View accessibilityLabel="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            paddingVertical: space.lg,
            paddingHorizontal: gutter,
          }}
        >
          {lead ? <Skeleton height={40} width={40} round /> : null}
          <View style={{ flex: 1, gap: space.sm }}>
            <Skeleton height={15} width={`${62 + ((i * 13) % 26)}%`} />
            <Skeleton height={12} width={`${38 + ((i * 17) % 22)}%`} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Empty ──────────────────────────────────────────────────────────────────

/**
 * Nothing here, and why.
 *
 * Nielsen Norman set three jobs for an empty state: say what the system is
 * doing, teach what would fill the space, and offer a direct path to the task
 * that fills it. The first two are always required here, which is why title
 * and body are not optional in practice. "No data" is not an empty state, it
 * is a shrug.
 *
 * The third only applies sometimes, and the distinction is deliberate rather
 * than accidental. There are three kinds of empty in this app:
 *
 *   actionable   the person looking at it can fill it, so it carries the
 *                action. An admin on an empty homework list can set homework.
 *   blocked      the person cannot act, and the screen says who can. A parent
 *                waiting on a term to be published is not given a button,
 *                because there is nothing honest to put on it.
 *   good news    nothing is missing. A full attendance record and an empty
 *                appeals queue are not problems, and offering an action there
 *                would invent a task out of a healthy state.
 */
export function Empty({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  icon?: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <Animated.View
      entering={FadeIn.duration(withReducedMotion(reduced, duration.enter))}
      style={{
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.xxxl,
        paddingHorizontal: space.xl,
      }}
    >
      {icon}
      <Text variant="title3" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="callout" tone="secondary" align="center" style={{ maxWidth: 320 }}>
          {body}
        </Text>
      ) : null}
      {action ? (
        <View style={{ paddingTop: space.sm }}>
          <Button label={action.label} onPress={action.onPress} kind="secondary" />
        </View>
      ) : null}
    </Animated.View>
  );
}

// ─── Failed ─────────────────────────────────────────────────────────────────

/**
 * Something went wrong, said in the language of the person reading it.
 *
 * The technical detail is kept and made selectable, because a teacher
 * reporting a problem to an admin needs to be able to copy it, but it sits
 * under the plain sentence rather than instead of it.
 */
export function Failed({
  title = 'That did not load',
  body = 'Check your connection and try again.',
  detail,
  onRetry,
}: {
  title?: string;
  body?: string;
  detail?: string;
  onRetry?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxxl, paddingHorizontal: space.xl }}>
      <Text variant="title3" align="center">
        {title}
      </Text>
      <Text variant="callout" tone="secondary" align="center" style={{ maxWidth: 320 }}>
        {body}
      </Text>
      {onRetry ? <Button label="Try again" onPress={onRetry} kind="secondary" /> : null}
      {detail ? (
        <Text
          variant="codeSmall"
          tone="placeholder"
          align="center"
          selectable
          style={{ marginTop: space.sm, backgroundColor: t.bg.fill, padding: space.sm, borderRadius: radius.sm }}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
