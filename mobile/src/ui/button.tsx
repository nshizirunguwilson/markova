import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/design/provider';
import { curve, radius, space, touch } from '@/design/tokens';
import { Text } from './text';

/**
 * Four kinds, and there is no fifth.
 *
 *   primary      the one thing this screen is for. At most one per screen.
 *   secondary    a real alternative to the primary action.
 *   quiet        everything else. No fill, no border, just a target.
 *   destructive  removes something a person cannot get back.
 *
 * There is no outline variant and no ghost variant, because in practice those
 * are the same button with a different amount of decoration, and having both
 * means every screen relitigates which one it wants.
 *
 * Size is a floor, not a target: 48 points tall so it clears the touch
 * minimum with room, because this gets pressed by someone standing up.
 */

type Kind = 'primary' | 'secondary' | 'quiet' | 'destructive';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  kind?: Kind;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  /** Fills the width. Use inside a footer, not inline. */
  block?: boolean;
  /** Suppresses the haptic. For buttons pressed repeatedly, like a stepper. */
  silent?: boolean;
}

export function Button({
  label,
  onPress,
  kind = 'secondary',
  icon,
  loading,
  disabled,
  block,
  silent,
}: ButtonProps) {
  const t = useTheme();
  const off = disabled || loading;

  const skin = {
    primary: { bg: t.brand.solid, bgPressed: t.brand.solidPressed, fg: t.brand.onSolid, border: 'transparent' },
    secondary: { bg: t.bg.page, bgPressed: t.bg.fill, fg: t.fg.primary, border: t.line.border },
    quiet: { bg: 'transparent', bgPressed: t.bg.fill, fg: t.brand.text, border: 'transparent' },
    destructive: { bg: t.status.critical.solid, bgPressed: t.status.critical.text, fg: '#FFFFFF', border: 'transparent' },
  }[kind];

  const press = () => {
    if (!silent && process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress();
  };

  return (
    <Pressable
      onPress={press}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed }) => ({
        minHeight: touch.comfortable,
        alignSelf: block ? 'stretch' : 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        paddingHorizontal: kind === 'quiet' ? space.md : space.xl,
        borderRadius: radius.md,
        borderWidth: skin.border === 'transparent' ? 0 : 1,
        borderColor: skin.border,
        backgroundColor: pressed && !off ? skin.bgPressed : skin.bg,
        opacity: off ? 0.4 : 1,
        ...curve,
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={skin.fg} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text variant="bodyMedium" style={{ color: skin.fg }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
