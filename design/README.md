# Markova design system

Two hand-authored sources drive everything visual in this repo. Nothing else is
the source of truth, and the two generated outputs must never be edited by hand.

| Source | Generates | Command |
| --- | --- | --- |
| `design/tokens.json` | `web/src/app/tokens.css`, `mobile/src/constants/theme.ts` | `node scripts/sync-design-tokens.mjs` |
| `design/logo-mark.svg`, `design/logo-glyph.svg` | 7 raster icon slots in `web/` and `mobile/` | `node scripts/build-brand-assets.mjs` |

CI runs `sync-design-tokens.mjs --check` and `check-contrast.mjs`, so a drifted
token file or a colour pair that fails WCAG AA fails the build.

## Colour

The brand navy `#1B4F72` and its four relatives were already shared by both
clients and are unchanged. Everything else was previously two different
palettes — web had inherited Tailwind's default gray/emerald/amber ramp while
mobile used Slate + Flat-UI. They are now one set, chosen on two rules:

1. **Slate neutrals**, because they carry a blue bias that sits under a navy
   brand without the muddy cast a neutral grey gives.
2. **Every pairing meets WCAG 2.1 AA** — 4.5:1 for text, 3:1 for control
   boundaries. `scripts/check-contrast.mjs` asserts all 27 pairings.

The previous semantic colours all failed that second rule as text:

| Token | Web before | Mobile before | Now | Contrast on surface |
| --- | --- | --- | --- | --- |
| success | `#10B981` (2.5:1) | `#27AE60` (2.9:1) | `#0E7C4A` | 5.25:1 |
| warning | `#F59E0B` (2.2:1) | `#F39C12` (2.2:1) | `#B45309` | 5.02:1 |
| danger | `#EF4444` (3.8:1) | `#E74C3C` (3.8:1) | `#C0392B` | 5.44:1 |

Each semantic colour has a `…Wash` partner for badge backgrounds; the pair is
checked against each other too, not just against white.

`muted` moved from `#64748B` to `#5F6E85` for one reason: at `#64748B` it scored
4.34:1 against `surfaceMuted`, which is exactly where it gets used most — table
headers. The darker value clears 4.5:1 on every surface token in the system.

## Radius

Web and mobile used the same pixel values under different names, so
`rounded-lg` (8px) and `radius.lg` (12px) silently disagreed. Radius keys now
follow Tailwind's scale on both platforms, and the mobile call sites were
remapped to preserve their existing pixels exactly:

    old sm 6  → md 6      old lg 12 → xl 12
    old md 8  → lg 8      old xl 16 → 2xl 16

## Type

Both clients use **Poppins** at 400/500/600/700 — web through `next/font`,
mobile through `expo-font` and `@expo-google-fonts/poppins`. The scale
(12/14/16/18/20/24/30) already matched Tailwind's defaults and is now declared
once in `tokens.json`.

On React Native a custom family will not synthesise weights, so mobile code must
use `fontFamily: fontFamily.semibold` rather than `fontWeight: '600'`. The
generated theme exports `fontFamily` for exactly this.

## The mark

`logo-mark.svg` is a navy badge (48×48, corner radius 11 ≈ 23%) holding a white
geometric monogram. `logo-glyph.svg` is the same monogram alone in
`currentColor` on a transparent ground, for the Android adaptive foreground,
the themed-icon layer and any dark surface.

The monogram's middle vertex descends all the way to the baseline, the way
Poppins draws its own M. That was not the first attempt: a conventional
half-depth vertex was rendered at 16px and **read as an H**, because the notch
filled in at favicon size. Five candidates were rasterised at 16px and compared
on the pixel grid before this construction was chosen. Any future edit to the
mark should be re-checked the same way — render it at 16px, not at 512px.

Round caps extend the stroke by 2.25 units, which puts the glyph's visual box at
27.5×22.5 centred on (24,24), so the mark is optically centred rather than
merely mathematically centred.

### Where it appears

`<Logo />` (`web/src/components/ui/logo.tsx`) and `<Logo />`
(`mobile/src/components/Logo.tsx`) both render the school's uploaded
`logo_url` when one exists and fall back to this mark when it does not. Every
surface goes through those two components — sidebar, both login screens, ID
cards, PDF report headers and the mobile header — so a school that uploads a
crest gets it everywhere at once.
