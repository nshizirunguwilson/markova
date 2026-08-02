import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { type as typeScale, tabular } from '@/design/tokens';
import { useTheme } from '@/design/provider';

type Variant = keyof typeof typeScale;
type Tone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'placeholder'
  | 'brand'
  | 'onSolid'
  | 'positive'
  | 'caution'
  | 'critical';

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  /**
   * Figures that sit in a column, or that change in place. Switches on the
   * typeface's tabular figures so digits share a width: a countdown does not
   * jiggle, and a column of marks lines up on its own without a monospace.
   */
  numeric?: boolean;
  align?: TextStyle['textAlign'];
  /** Caps and wide tracking. Only for the small group labels above a section. */
  caps?: boolean;
}

export function Text({
  variant = 'body',
  tone = 'primary',
  numeric,
  align,
  caps,
  style,
  ...rest
}: TextProps) {
  const t = useTheme();

  const colors: Record<Tone, string> = {
    primary: t.fg.primary,
    secondary: t.fg.secondary,
    tertiary: t.fg.tertiary,
    placeholder: t.fg.placeholder,
    brand: t.brand.text,
    onSolid: t.fg.onSolid,
    positive: t.status.positive.text,
    caution: t.status.caution.text,
    critical: t.status.critical.text,
  };

  return (
    <RNText
      {...rest}
      style={[
        typeScale[variant],
        { color: colors[tone] },
        numeric && tabular,
        align && { textAlign: align },
        caps && { textTransform: 'uppercase' },
        style,
      ]}
    />
  );
}
