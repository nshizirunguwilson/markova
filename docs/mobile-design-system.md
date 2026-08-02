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

Four durations and three curves, and both came out of research rather than
taste. They live in `design/motion.ts` rather than in the token file, because
unlike everything else they are not constants.

| Token | ms | For |
| --- | --- | --- |
| `feedback` | 100 | A control acknowledging a touch |
| `enter` | 280 | Something arriving |
| `exit` | 200 | Something leaving |
| `screen` | 360 | A whole screen or sheet |

**Entering is longer than exiting, deliberately.** Nielsen Norman's work on
animation duration is explicit that a thing arriving needs more time than the
same thing leaving, around 300ms in against 200 to 250ms out, because the eye
has to find something that has appeared and needs no time at all to let go of
something that has gone. The first version of this system used one duration in
both directions, which makes entrances feel abrupt and exits feel sluggish
simultaneously.

The ceiling is 400. NN/G puts 500ms at the point where animation "starts to
feel like a real drag", and the Doherty threshold work is the reason nothing
here approaches it.

Curves are decelerating in, accelerating out, symmetric for movement in place.
Never linear, which reads as mechanical because nothing physical moves that
way.

### Motion is optional, and that is not a preference

Every animated thing in the app asks first. `useReducedMotion()` reads the
platform setting and durations collapse to zero, not to something small,
because the guidance is to remove the animation rather than perform it
quickly.

This matters most for the skeleton loader, which pulsed forever. WCAG 2.3.3
covers animation triggered by interaction, and the vestibular literature is
clear that repeating motion can cause dizziness, nausea and headaches. An
infinite pulse is close to the textbook example. With reduced motion on, the
skeleton sits still at a fixed opacity and still says "something is coming",
which was its only job.

---

## Navigation

Four tabs plus More, per role.

Apple puts the tab bar range at three to five, Material lands in the same
place, and the usability work behind those guidelines reports meaningfully
faster navigation for bars of three to five items than for six or more. Five is
the practical ceiling before tap accuracy suffers, so this sits at the top of
the researched range rather than past it.

The rule for what earns a tab: used at least weekly by that role, and a place
rather than an action. Marks entry is the single most used screen a teacher
has and it is still not a tab, because it is something you do to a class you
picked, not somewhere you go.

---

## Forms

Three findings from Baymard's checkout research shaped these, all from studies
of real people failing at real forms.

**Labels sit above the field, never inside it.** Baymard tested more than a
thousand mobile checkout fields across eighteen sites. Inline and left aligned
labels leave too little room for the input on a narrow screen, so people cannot
see what they typed, and when they get something wrong they delete the whole
field and start again rather than correcting it. Above the field lets the input
run the full width. This app asks parents for national ID numbers and teachers
for marks against a named assessment, so the label has to survive the moment
they start typing.

**Optional fields are marked as explicitly as required ones.** Baymard found
that marking only the required fields leaves every other field ambiguous, and
that the sites doing both are a small minority. The `Field` component takes
`required` and `optional` and the add-a-person form uses both, because a
national ID genuinely is optional for a thirteen year old and genuinely is not
for a member of staff.

**Validation is inline where it can be.** The password rules on reset and in
settings tick as you type rather than telling you what was wrong after you
submitted. Marks entry catches an out of range value on the keystroke, because
finding out at the end that entry nine was 105 means hunting for it.

---

## Empty states

Nielsen Norman set three jobs for an empty state: say what the system is doing,
teach what would fill the space, and offer a direct path to the task that fills
it.

The first two are always present here. The third is not, and the omission is
deliberate. There are three kinds of empty in this app:

- **Actionable.** The person can fill it, so it carries the action. An admin on
  an empty homework list gets a button that sets homework.
- **Blocked.** The person cannot act, and the screen says who can. A parent
  waiting on a term to be published is not given a button, because there is
  nothing honest to put on one.
- **Good news.** Nothing is missing. A full attendance record and an empty
  appeals queue are not problems, and putting an action there would invent a
  task out of a healthy state.

---

## Lists

Rows rather than cards, full bleed, separated by a hairline.

The density argument is the one that decides it. A list gives more information
per screen than a card grid and is faster to select from, and people scan
rather than read, so the useful thing is to get more scannable lines in front
of them rather than to give each line a box. A list of ten cards is ten
competing objects. A register is one object with ten lines.

---

## Sources

Motion:

- Nielsen Norman Group, *Executing UX Animations: Duration and Motion
  Characteristics.* https://www.nngroup.com/articles/animation-duration/
- W3C, *Understanding SC 2.3.3 Animation from Interactions*, WCAG 2.2.
  https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- web.dev, *Animation and motion*, accessibility course.
  https://web.dev/learn/accessibility/motion
- Deque University, *2.3.3 Animations from Interactions.*
  https://dequeuniversity.com/resources/wcag2.1/2.3.3-animations-from-interactions
- Val Head, *How fast should your UI animations be?*
  https://valhead.com/2016/05/05/how-fast-should-your-ui-animations-be/
- UXmatters, *Designing Interface Animation.*
  https://www.uxmatters.com/mt/archives/2016/12/designing-interface-animation.php
- Cited within the above: Card, Moran and Newell's Model Human Processor
  (230ms to perceive), the Doherty threshold (Doherty and Thadhani, 1982), and
  Pratt et al. (2010) on animate motion capturing attention.

Navigation and information architecture:

- Apple Human Interface Guidelines, tab bars, three to five items.
- Material Design 3 navigation bar guidance.
- UXPin, *Mobile Navigation Patterns: Pros and Cons.*
  https://www.uxpin.com/studio/blog/mobile-navigation-patterns-pros-and-cons/
- Nitrous Design, *Mobile Tab Navigation Best Practices.*
  https://www.nitrousdesign.com/blogs/guideliness-for-designing-effective-tab-bar-navigation-on-mobile
- *iOS Tab Bar: A Complete UX and Design Guide.*
  https://uiuxdesigning.com/ios-tab-bar/
- AppInstitute, *Best Practices for Mobile App Navigation Menus.*
  https://appinstitute.com/best-practices-for-mobile-app-navigation-menus/

Forms:

- Baymard Institute, *Field Label UX: Place Labels Above the Field.* Read
  directly. https://baymard.com/blog/mobile-form-usability-label-position
- Baymard Institute, *Mobile Form Usability: Never Use Inline Labels.*
  https://baymard.com/blog/mobile-forms-avoid-inline-labels
- Baymard Institute, *Mark Both Required and Optional Fields Explicitly.*
  https://baymard.com/blog/required-optional-form-fields
- Baymard Institute, *Avoid Splitting Single Input Entities.*
  https://baymard.com/blog/mobile-form-usability-single-input-fields
- Baymard Institute, *8 Recommendations for Creating Effective Input Fields.*
  https://baymard.com/learn/input-fields
- Baymard Institute, *Form Design: 6 Best Practices.*
  https://baymard.com/learn/form-design

Empty states and list density:

- Nielsen Norman Group, *Designing Empty States in Complex Applications: 3
  Guidelines.* Read directly.
  https://www.nngroup.com/articles/empty-state-interface-design/
- Nielsen Norman Group, *Empty States in Application Design* (video).
  https://www.nngroup.com/videos/empty-states-in-application-design-guidelines/
- Nielsen Norman Group, information density collection.
  https://www.nngroup.com/topic/information-density/
- Nielsen Norman Group, *Utilize Available Screen Space.*
  https://www.nngroup.com/articles/utilize-available-screen-space/
- Nielsen Norman Group, *3 Strategies for Managing Visual Complexity.*
  https://www.nngroup.com/videos/managing-visual-complexity/
- Nielsen Norman Group, *Maps and Location Finders on Mobile Devices*, on list
  layout giving higher information density and faster selection.
  https://www.nngroup.com/articles/mobile-maps-locations/

Typography, colour and space, read directly:

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
