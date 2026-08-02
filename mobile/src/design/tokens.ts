import { oklch } from './color';

/**
 * The fixed half of the design system. Everything here is decided once and
 * does not change per school. The brand colour is the only thing that varies
 * at runtime, and it lives in theme.ts.
 *
 * The reasoning behind each set of numbers is written up in
 * docs/mobile-design-system.md with the sources it came from.
 */

// ─── Type ───────────────────────────────────────────────────────────────────
//
// IBM Plex Sans for the interface, IBM Plex Mono for machine codes.
//
// The scale is anchored on 16, which is where both platform scales put their
// primary reading size and comfortably above the point at which measured
// reading speed falls away. Nothing in the app is allowed below 12.
//
// Tracking follows the shape of Apple's own optical compensation: negative at
// display sizes where letters would otherwise drift apart, zero through the
// reading sizes, positive at the small end where letters crowd. Plex sets a
// little tighter than SF by default, so the positive end is nudged further
// than Apple's numbers rather than copied from them.

export const font = {
  sans: {
    regular: 'IBMPlexSans_400Regular',
    medium: 'IBMPlexSans_500Medium',
    semibold: 'IBMPlexSans_600SemiBold',
  },
  mono: {
    regular: 'IBMPlexMono_400Regular',
    medium: 'IBMPlexMono_500Medium',
  },
} as const;

export type TypeStyle = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
};

export const type = {
  /** One per screen at most. A number worth stopping for, or nothing. */
  display: { fontFamily: font.sans.semibold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  /** Screen titles that carry weight. */
  title1: { fontFamily: font.sans.semibold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  /** Section headings. */
  title2: { fontFamily: font.sans.semibold, fontSize: 21, lineHeight: 28, letterSpacing: -0.3 },
  /** Card and group headings, row titles that need to lead. */
  title3: { fontFamily: font.sans.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.15 },
  /** The workhorse. Everything a person reads properly. */
  body: { fontFamily: font.sans.regular, fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  /** Body weight lifted, for the primary line of a row. */
  bodyMedium: { fontFamily: font.sans.medium, fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  /** Supporting copy beside a body line. */
  callout: { fontFamily: font.sans.regular, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  /** Secondary line in a list row. */
  subhead: { fontFamily: font.sans.regular, fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
  /** Metadata, timestamps, helper text. */
  footnote: { fontFamily: font.sans.regular, fontSize: 13, lineHeight: 18, letterSpacing: 0.15 },
  /** The floor. Group labels, set in caps, and nothing else. */
  caption: { fontFamily: font.sans.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  /** Codes a person reads character by character. */
  code: { fontFamily: font.mono.regular, fontSize: 14, lineHeight: 20, letterSpacing: 0.2 },
  codeSmall: { fontFamily: font.mono.regular, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
} satisfies Record<string, TypeStyle>;

/**
 * Figures that have to line up in a column, or that change in place without
 * the layout jumping. Plex carries proper tabular figures, so this is a real
 * feature of the typeface rather than a monospace substitute.
 */
export const tabular = { fontVariant: ['tabular-nums' as const] };

// ─── Neutrals ───────────────────────────────────────────────────────────────
//
// Twelve steps, each with one job, so nobody has to guess which grey to reach
// for. Built at a fixed hue with a trace of chroma: a warm cast at 80 degrees,
// strong enough that the surfaces read as paper rather than as a screen, weak
// enough that nothing looks tinted. This is a product about school records,
// and records are paper.
//
// Lightness values are hand placed rather than evenly spaced. The gaps are
// close together at the light end, where surfaces have to separate from each
// other by a hair, and open up through the middle, where the eye needs real
// distance to tell a border from a placeholder.

const NEUTRAL_HUE = 80;
const n = (l: number, c: number) => oklch(l, c, NEUTRAL_HUE);

export const neutral = {
  /** The page. Almost but not quite white. */
  1: n(0.995, 0.0015),
  /** A surface lifted off the page without a shadow. */
  2: n(0.982, 0.003),
  /** Component fill at rest. */
  3: n(0.963, 0.004),
  /** Component fill, pressed. Light enough that secondary ink still carries. */
  4: n(0.949, 0.005),
  /** A heavier fill for non-text surfaces. Do not put small text on it. */
  5: n(0.917, 0.006),
  /** Hairline between rows. The quietest mark the system makes. */
  6: n(0.886, 0.006),
  /** A border you are meant to notice. */
  7: n(0.840, 0.007),
  /** A border under focus, and the edge of a disabled control. */
  8: n(0.762, 0.008),
  /** Placeholder text and disabled labels. Sits exactly on the Lc 60 floor. */
  9: n(0.634, 0.010),
  /** Icons and text that support without competing. */
  10: n(0.556, 0.011),
  /** Secondary reading text. Passes at body size. */
  11: n(0.452, 0.012),
  /** Primary text. Not black, because black on paper white is a glare. */
  12: n(0.242, 0.012),
} as const;

// ─── Semantic colour ────────────────────────────────────────────────────────
//
// Fixed, and deliberately separate from the school's brand colour. A school
// that picks a red brand must not end up with an interface where danger and
// identity are the same signal.
//
// Three roles each, and no more: a solid for the rare filled element, a tint
// for the background of a message, and a text colour proven to carry at body
// size on that tint. Hues sit where they are conventionally read, with the
// warning hue pulled toward amber rather than yellow because yellow cannot
// hold enough chroma at a readable lightness.

// Lightness is set at 0.545 rather than somewhere prettier because that is
// where white stops passing on top of these hues. Measured, not chosen.
const semantic = (hue: number) => ({
  solid: oklch(0.545, 0.155, hue),
  tint: oklch(0.965, 0.028, hue),
  text: oklch(0.44, 0.13, hue),
  border: oklch(0.87, 0.055, hue),
});

export const status = {
  positive: semantic(150),
  caution: semantic(75),
  critical: semantic(27),
  info: semantic(250),
} as const;

// ─── Space ──────────────────────────────────────────────────────────────────
//
// A 4pt rhythm, but only eight steps of it. A scale with a value every 4
// points is not a scale, it is a licence to nudge, and nudging is how a
// layout stops having a rhythm at all.
//
// The screen gutter is 20 rather than the 16 both platforms default to.
// Whitespace is the one thing this design is actually made of, and the extra
// four points on each side is the cheapest place to buy it.

export const space = {
  /** Between a glyph and its label. */
  xs: 4,
  /** Inside a dense control. */
  sm: 8,
  /** Between related lines. */
  md: 12,
  /** The standard gap between things. */
  lg: 16,
  /** Screen gutter, and the gap between unrelated things. */
  xl: 20,
  /** Between sections of a screen. */
  xxl: 32,
  /** Around a screen's one important thing. */
  xxxl: 48,
  /** Above a lone empty state. */
  huge: 64,
} as const;

export const gutter = space.xl;

// ─── Shape ──────────────────────────────────────────────────────────────────
//
// Three radii and a pill. Continuous curvature everywhere, which is the
// rounding both platform design languages actually use and which reads as
// drawn rather than as a rectangle with the corners taken off.

export const radius = {
  /** Chips, small fills. */
  sm: 8,
  /** Controls: buttons, fields, the things you touch. */
  md: 12,
  /** Surfaces: cards, sheets, the things you read. */
  lg: 16,
  /** Avatars, pills, anything whose height defines it. */
  full: 999,
} as const;

export const curve = { borderCurve: 'continuous' } as const;

// ─── Depth ──────────────────────────────────────────────────────────────────
//
// Almost nothing. A shadow under every card is the single clearest signal
// that a layout was assembled rather than designed, and it flattens hierarchy
// by giving everything the same importance.
//
// Separation is done with space first and a hairline second. A shadow is
// reserved for surfaces that genuinely sit above the page and can be
// dismissed: sheets, menus, and a control that floats over scrolling content.

export const depth = {
  none: undefined,
  /** Something that floats over content and can be dismissed. */
  lifted: { boxShadow: '0 6px 24px rgba(23, 21, 16, 0.10)' },
  /** A sheet resting against the bottom of the screen. */
  sheet: { boxShadow: '0 -2px 32px rgba(23, 21, 16, 0.12)' },
} as const;

/** The hairline. One point at any density, drawn in the quietest neutral. */
export const hairline = { borderBottomWidth: 1, borderBottomColor: neutral[6] } as const;

// ─── Touch ──────────────────────────────────────────────────────────────────
//
// WCAG 2.2 sets the floor at 24 by 24 to pass at AA, and 44 by 44 to reach
// AAA. Both platform guidelines land on 44 to 48. This app gets used one
// handed, standing in a corridor, by a teacher holding a register, so it
// takes the higher number as the minimum rather than the target.

export const touch = {
  min: 44,
  comfortable: 48,
  /** Expands the tap area of a small glyph without changing how it looks. */
  slop: { top: 12, bottom: 12, left: 12, right: 12 },
} as const;

// ─── Motion ─────────────────────────────────────────────────────────────────
//
// Lives in design/motion.ts, not here, because unlike everything else in this
// file it is not a constant. Durations collapse to zero when a person has
// asked their phone for less motion, so it needs a hook, and a hook does not
// belong in a token file.
