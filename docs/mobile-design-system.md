# Markova mobile design system

The reasoning behind every number in `mobile/src/design/`. If you change a
value there, change the paragraph here that justified it.

---

## The position

This is a school's record system on a phone. A parent opens it to find out how
their child did. A teacher opens it at 7am, standing up, holding a register. A
librarian opens it at a desk with a queue in front of them.

None of those people came to admire an interface. The design is therefore built
on three commitments:

1. **Hierarchy comes from size and space, not from decoration.** No shadow
   under a thing unless that thing genuinely floats above the page.
2. **Colour carries meaning or it does not appear.** The interface is neutral
   until something needs saying.
3. **Nothing ships that has not been measured.** Contrast in particular is
   verified rather than eyeballed, because the brand colour is not ours to
   choose.

## What was here before

Worth recording, because the new system is partly a reaction to it.

The previous interface put a navy header block on every screen, a coloured
welcome card at the top of the dashboard, two-up grids of solid coloured action
tiles, stat cards with a four pixel coloured left border, and a soft shadow on
essentially every surface. `shadowOpacity: 0.06, elevation: 3` appeared dozens
of times. Radius 16 was on everything.

The effect of a shadow under every card is that nothing is emphasised, because
emphasis is relative. The layout had no quiet, so it had no loud either.

There was also no typeface. No `expo-font`, no `useFonts`, nothing. The app
rendered in whatever the operating system defaulted to, which meant it had no
voice of its own and looked materially different on iOS and Android.

---

## Typography

### The choice

**IBM Plex Sans** for the interface. **IBM Plex Mono** for machine codes.

### Why not Inter

Inter is the technically strongest candidate and I want to be honest that it
was the near miss. Rasmus Andersson designed it specifically for screen
interfaces: a tall x-height, deliberately open apertures, ink traps and bridges
at text sizes, a disambiguation stylistic set that separates the characters
people confuse, a slashed zero, and proper tabular figures. Its own
documentation describes two optical sizes, text and display, tuned separately.
On the metrics alone it wins.

Two things moved me off it.

The first is a brief constraint: Inter has become the default face of generated
interfaces. It is what appears when nobody made a decision. For a project whose
explicit goal is not to look automatically produced, the most-defaulted
typeface in the world is the wrong starting point.

The second is a better fit elsewhere. Plex was commissioned to carry a large
institution's identity across documents, interfaces and signage at the same
time. That is exactly this product: a school's records, which exist as screens
and as printed report cards. Plex reads as considered rather than as unchosen,
and it sets slightly tighter than Inter, which gives lists and tables an
organised, document-like quality that suits a register.

### Why not the alternatives

**Plus Jakarta Sans** was the strongest of the geometric options and it is on
the standing font whitelist. Its design brief cites Neuzeit Grotesk and Futura
and claims a raised x-height with open counters, and it carries tabular
figures under the SIL Open Font Licence. The problem is the lineage: geometric
faces build their letters from shared circular forms, which is precisely what
reduces differentiation at 12 and 13 points on a low density Android screen.
This app runs on cheap phones in Rwandan classrooms. Differentiation at small
sizes outranks personality at large ones.

**Geist** reads as a developer tool. **Satoshi** reads as a fintech product.
Neither is what a school looks like.

**The system font** was a serious option and remains defensible: perfect
rendering, zero bundle cost, native feel. It was rejected because it makes the
product look different on every device, and a report card should look the same
to the parent as it does to the teacher.

### The superfamily argument

Plex Sans and Plex Mono are one design with two jobs. That matters more here
than it would in most apps, because this product is full of two different kinds
of number:

- **Quantities** that a person reads as a value: marks, percentages, ranks,
  aggregates, conduct points, counts. These are set in Plex Sans with tabular
  figures, so a column of them aligns and a changing figure does not shift the
  layout.
- **Codes** that a person reads character by character and may have to read
  aloud or copy: the twelve digit report verification code, student ID numbers,
  NIDA numbers, NFC card IDs. These are set in Plex Mono, where every glyph
  occupies the same width and the confusable pairs are unambiguous.

Pairing Inter with JetBrains Mono would be two unrelated decisions. Plex Sans
with Plex Mono is one decision applied twice.

### The scale

Anchored at 16, which is where both platform scales put their primary reading
size. The systematic review of mobile font size research is the reason there is
a hard floor: it identifies a critical print size below which reading speed
falls away sharply, and also finds that oversized type degrades reading, so
bigger is not simply better. Nothing in this app is set below 12.

| Role | Size / line height | Weight | Tracking | Used for |
| --- | --- | --- | --- | --- |
| `display` | 32 / 38 | 600 | -0.6 | One number worth stopping for. At most one per screen. |
| `title1` | 26 / 32 | 600 | -0.4 | Screen titles that carry weight. |
| `title2` | 21 / 28 | 600 | -0.3 | Section headings. |
| `title3` | 18 / 24 | 600 | -0.15 | Card headings, leading row titles. |
| `body` | 16 / 24 | 400 | 0 | The workhorse. Everything read properly. |
| `bodyMedium` | 16 / 24 | 500 | 0 | The primary line of a list row. |
| `callout` | 15 / 22 | 400 | 0 | Supporting copy beside a body line. |
| `subhead` | 14 / 20 | 400 | +0.1 | Secondary line in a row. |
| `footnote` | 13 / 18 | 400 | +0.15 | Metadata, timestamps, helper text. |
| `caption` | 12 / 16 | 500 | +0.4 | Group labels in caps. The floor. |
| `code` | 14 / 20 | mono 400 | +0.2 | Codes read character by character. |
| `codeSmall` | 12 / 16 | mono 400 | +0.2 | The same, inline. |

Body sits at a 1.5 line height rather than the 1.2 to 1.3 the platforms
default to. Whitespace is the material this design is made of, and leading is
where it does the most work per point spent. The tradeoff is real and worth
stating: the Wichita State usability lab's work on whitespace found that more
generous spacing improves comprehension while slightly reducing raw reading
speed. For a screen carrying a child's results, comprehension is the thing to
optimise.

Tracking follows the shape of Apple's optical compensation rather than its
exact numbers: negative at display sizes where letters drift apart, zero
through the reading sizes, positive at the small end where they crowd. The
positive end is pushed a little further than Apple's values because Plex sets
tighter than SF by default.

### Weights bundled

Three sans weights and two mono. Plex ships nine weights plus italics for each;
bundling all of them would cost roughly a megabyte for weights this interface
never asks for. Since hierarchy here comes from size and space, 400, 500 and
600 cover every style in the scale with nothing spare.

---

## Colour

### Built in OKLCH

Every colour in the system is authored in OKLCH and converted to hex at the
edge. The reason is that HSL is not perceptually uniform: adding ten percent
lightness to a blue and to a yellow produces two visibly different results, and
modifying a blue in HSL drags it toward purple. A ramp built by hand in HSL
cannot be evenly stepped, and worse, cannot be evenly stepped *across hues*.

That matters here more than in most products, because the brand hue is not
ours. Each school sets `primary_color` through school-config. The system has to
produce a usable palette from a hue it has never seen. Fixed lightness values
in OKLCH give that: the same L reads as the same lightness whatever the hue.

Conversion to sRGB reduces chroma rather than clipping channels when a colour
falls outside gamut, so a step keeps its position in the ramp and its hue even
when the display cannot render it fully saturated.

### The neutral ramp

Twelve steps, each with exactly one job, so nobody has to guess which grey to
reach for. The structure follows the Radix Colors argument that a scale is only
useful if each step is assigned a purpose: backgrounds, then component fills,
then borders, then solids, then text.

All twelve sit at hue 80 with a trace of chroma, between 0.0015 and 0.012. That
is a warm cast, weak enough that nothing looks tinted and strong enough that
the surfaces read as paper rather than as a screen. This is a product about
school records, and records are paper.

Lightness is hand placed, not evenly divided. The gaps are tight at the light
end where surfaces separate from each other by a hair, and open through the
middle where the eye needs real distance to tell a border from a placeholder.

### The brand is derived, never used raw

This is the part that most needed the research.

`primary_color` arrives from the API as an arbitrary hex. Using it directly as
a button fill and assuming white text is what almost every multi-tenant app
does, and it is wrong. Measured with APCA:

| School picks | White on it | Verdict |
| --- | --- | --- |
| `#1B4F72` navy | Lc 94.1 | fine |
| `#C0392B` red | Lc 81.3 | fine |
| `#27AE60` green | Lc 59.7 | **fails**, floor is 75 |
| `#F1C40F` yellow | Lc 32.5 | **fails badly**, under half the floor |

So `deriveBrand()` in `theme.ts` takes the hue as given and derives every role
against a measured threshold. It tries white on the brand first, because a
school choosing a colour almost always pictures white on it, and only walks
lightness down when the hue cannot hold it. Hue and chroma are preserved
throughout, so the result still looks like the colour they chose.

Brand text is derived against the brand tint rather than against the page. The
tint is the darker of the two backgrounds it lands on, so deriving against the
harder case makes one value safe in both places. Deriving against the page
instead was the original approach and it failed on seven of the ten test hues.

### Status colours are separate from brand, on purpose

A school that picks a red brand must not end up with an interface where danger
and identity are the same signal. The four status hues are fixed and
independent.

Their solid lightness is 0.545, which is not a round number and was not chosen
for looks. It is the point at which white stops passing on top of those hues.

### Measured, not eyeballed

`npm run design:check` runs 125 assertions over the whole palette, including
fourteen different school brand colours and six kinds of junk input. Thresholds
come from APCA's own size and weight guidance: Lc 90 preferred for body copy,
Lc 75 the minimum at 16px regular, Lc 60 for large or heavy text and meaningful
icons, Lc 30 for solid non-text elements, Lc 15 below which a divider should be
treated as invisible.

APCA is used rather than the WCAG 2 contrast ratio because the ratio treats a
hairline weight and a bold weight as identical when the colours match, and
materially overstates contrast for dark pairs. The WCAG numbers are still met;
they are simply not sufficient on their own.

**The check changed a design decision, not just a hex value.** Selected rows
were originally a darker grey fill. Secondary text on that fill measured Lc
69.5 against a floor of 75. Rather than lighten the fill until the state became
invisible, selection moved to the brand tint, which measures Lc 96 for primary
ink and has the additional benefit that the thing you picked is coloured by
your own school.

---

## Space

A 4pt rhythm, but only eight steps of it: 4, 8, 12, 16, 20, 32, 48, 64.

A scale with a value every four points is not a scale, it is a licence to
nudge, and nudging is how a layout stops having a rhythm at all.

The screen gutter is 20 rather than the 16 both platforms default to. Whitespace
is what this design is made of and the extra four points on each side is the
cheapest place to buy it.

---

## Shape and depth

Three radii and a pill: 8 for chips, 12 for controls, 16 for surfaces, 999 for
anything whose height defines it. All with `borderCurve: 'continuous'`, which
is the rounding both platform design languages actually use and which reads as
drawn rather than as a rectangle with its corners removed.

Depth is close to absent. Two shadows exist in the entire system: one for a
surface that floats over content and can be dismissed, and one for a sheet.
Everything else separates with space first and a one point hairline second.

This is the single largest departure from what was here before, and it is the
main reason the new screens read as designed.

---

## Touch

44 points minimum, 48 comfortable.

WCAG 2.2 sets the floor at 24 by 24 CSS pixels to pass at AA and 44 by 44 to
reach AAA, with an exception where undersized targets are separated by enough
clearance. Both platform guidelines land between 44 and 48. This app gets used
one handed, standing in a corridor, by someone already holding something else,
so it takes the higher number as a minimum rather than as a target.

Small glyphs get their tap area expanded with `hitSlop` rather than being drawn
larger, so the target grows without the visual weight growing with it.

---

## Motion

Four durations: 90, 140, 220, 320. Three curves: decelerating for things
arriving, accelerating for things leaving, symmetric for things moving in
place.

Nothing in this app animates to be admired. Motion exists to say where
something came from.

---

## Sources

Read directly:

- Rasmus Andersson, *Inter* typeface documentation. https://rsms.me/inter/
- Wang, L. et al. *How to design font size for older adults: A systematic
  literature review with a mobile device.* Frontiers in Psychology, 2022.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC9376262/
- Apple Human Interface Guidelines typography scale, via a mirrored
  specification table.
  https://gist.github.com/eonist/b9c180a67980c6e18a5184f19bff68fa
- Material Design 3 typography roles and token structure.
  https://material-web.dev/theming/typography/
- Tokotype, *Plus Jakarta Sans* design brief and FONTLOG.
  https://github.com/tokotype/PlusJakartaSans
- Andrey Sitnik and Travis Turner, *OKLCH in CSS: why quit RGB/HSL.* Evil
  Martians. https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl
- Radix Colors, *Understanding the scale.*
  https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- Andrew Somers, *APCA in a Nutshell*, contrast levels by size and weight.
  https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell.html
- W3C, *Understanding SC 2.5.8 Target Size (Minimum)*, WCAG 2.2.
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

Consulted through search summaries rather than read in full, and treated as
weaker evidence accordingly:

- Software Usability Research Laboratory, Wichita State University, on
  whitespace, comprehension and reading speed.
- Comparative discussion of APCA against WCAG 2 relative luminance, including
  the Myndex/SAPC-APCA repository discussions.

Deliberately discarded: several 2026 "best fonts for apps" listicles surfaced
by search. One asserted that mobile operating systems now use front-facing
depth sensors to adjust optical sizing by viewing distance, which is not a
thing. Another cited a 33 percent comprehension improvement from whitespace
attributed to a journal that does not exist. Neither claim appears in this
document and neither informed any decision here.
