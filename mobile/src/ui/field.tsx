import { useState, type ReactNode } from 'react';
import { TextInput, View, Pressable, type TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTheme } from '@/design/provider';
import { curve, radius, space, touch, type as typeScale } from '@/design/tokens';
import { Text } from './text';

/**
 * A text input with its label above it, not inside it.
 *
 * Floating and placeholder-as-label patterns both lose the label at the moment
 * the person is actually typing, which is the moment they most need it. This
 * app asks parents for national ID numbers and teachers for marks against a
 * named assessment, so the label stays put.
 *
 * The error message replaces the hint rather than appearing underneath it, so
 * the field never changes height and the form never jumps while being filled.
 */

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
  error?: string;
  /** Right-hand affordance: a unit, a clear button, a scan button. */
  accessory?: ReactNode;
  /** Codes read character by character get the mono face and wider tracking. */
  mono?: boolean;
  required?: boolean;
  /**
   * Grows the field for multi line entry. A number rather than a style prop,
   * because letting callers pass arbitrary styles is how a design system stops
   * being one.
   */
  minHeight?: number;
  /**
   * Says so out loud. Baymard's checkout work found that marking only the
   * required fields leaves every unmarked field ambiguous, and that sites
   * marking both are a small minority. In this app that matters most on the
   * add-a-person form, where a national ID genuinely is optional for a
   * thirteen year old and genuinely is not for a member of staff.
   */
  optional?: boolean;
}

export function Field({
  label,
  hint,
  error,
  accessory,
  mono,
  required,
  optional,
  minHeight,
  secureTextEntry,
  ...rest
}: FieldProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const isSecret = Boolean(secureTextEntry);
  const border = error ? t.status.critical.solid : focused ? t.brand.solid : t.line.border;

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: space.xs }}>
        <Text variant="subhead" tone="secondary">
          {label}
        </Text>
        {required ? (
          <Text variant="subhead" tone="critical" accessibilityLabel="required">
            *
          </Text>
        ) : optional ? (
          <Text variant="subhead" tone="placeholder">
            optional
          </Text>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: space.sm,
          minHeight: minHeight ?? touch.comfortable,
          alignItems: minHeight ? 'flex-start' : 'center',
          paddingHorizontal: space.lg,
          paddingVertical: minHeight ? space.md : 0,
          backgroundColor: t.bg.page,
          borderWidth: focused || error ? 2 : 1,
          borderColor: border,
          borderRadius: radius.md,
          ...curve,
        }}
      >
        <TextInput
          {...rest}
          // The label is drawn above the box rather than inside it, so without
          // this a screen reader lands on an unnamed field and announces
          // nothing at all. The error, when there is one, is announced with it.
          accessibilityLabel={rest.accessibilityLabel ?? label}
          accessibilityHint={rest.accessibilityHint ?? error ?? hint}
          secureTextEntry={isSecret && !revealed}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholderTextColor={t.fg.placeholder}
          style={[
            mono ? typeScale.code : typeScale.body,
            {
              flex: 1,
              color: t.fg.primary,
              minHeight: minHeight ? minHeight - space.md * 2 : undefined,
              textAlignVertical: minHeight ? 'top' : 'center',
              // Android adds its own vertical padding that fights the min
              // height and makes the field taller than the touch token.
              paddingVertical: 0,
            },
          ]}
        />

        {isSecret ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            hitSlop={touch.slop}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            {revealed ? (
              <EyeOff size={20} color={t.fg.tertiary} strokeWidth={2} />
            ) : (
              <Eye size={20} color={t.fg.tertiary} strokeWidth={2} />
            )}
          </Pressable>
        ) : null}

        {accessory}
      </View>

      {error ? (
        <Text variant="footnote" tone="critical" selectable>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
