# Light, dark and system

The reader picks one of three, from the menu under their own name. Two of
those are colours; the third is "follow this machine", which is the one most
people want and the one a two-state toggle cannot express.

## The three states, and how each is carried

| Choice | On the document | What decides the colours |
| --- | --- | --- |
| Light | `data-theme="light"` | the `[data-theme='light']` block |
| Dark | `data-theme="dark"` | the `[data-theme='dark']` block |
| System | **nothing stamped** | `@media (prefers-color-scheme: dark)` |

Stamping nothing for "system" is the whole mechanism, not a tidy-up. With the
attribute absent the media query decides on its own, so the page keeps
following the machine as it changes with no JavaScript running at all. Setting
`data-theme="system"` instead would match no rule and pin the page to light
for ever.

Two consequences follow, and both are load-bearing:

**Every colour is defined on bare `:root`.** The un-stamped document is the
common case, so the light palette is the complete set and the dark blocks only
*redefine*. A token defined solely inside a media or `[data-theme]` block would
be undefined for the majority of readers, and the page would render one
theme's text on the other theme's ground.

**The dark media query is guarded.** It is written
`:root:not([data-theme='light'])`, so a reader who explicitly chose light keeps
light on a dark OS. The explicit blocks then win in both directions.

## Where a colour comes from

```
design/tokens.json          every colour, with a `value` and a `dark`
        |
        |  node scripts/sync-design-tokens.mjs
        v
web/src/app/tokens.css      :root light, media-query dark, [data-theme] both
        |
        v
--tone-* / --brand-*  ->  @theme inline  ->  bg-surface, text-foreground, ...
```

Note the indirection. `@theme inline` bakes a literal into every utility, which
is cheaper to paint and was right while the app was light-only. A switchable
theme needs the variable: `bg-surface` has to resolve to whatever
`--tone-surface` currently is, or redefining it does nothing at all.

Brand keeps its own `--brand-*` names because BrandProvider sets those per
school at runtime.

**Never hand-edit `web/src/app/tokens.css`.** Edit `design/tokens.json` and
rerun the sync. CI fails if they drift.

## Adding or changing a colour

1. Add it to `design/tokens.json` with **both** a `value` and a `dark`.
2. `node scripts/sync-design-tokens.mjs`
3. Add its pairings to `scripts/check-contrast.mjs` if text sits on it.
4. `node scripts/check-contrast.mjs` - it runs every pairing twice, once per
   palette.

A dark theme is not the light one inverted. A fill that carries white text on
paper is pale on a dark ground and carries near-black instead, which is why
`onSuccess`, `onWarning`, `onDanger` and `onPrimary` exist as tokens rather
than as the literal `text-white` they replaced.

## Rules for writing components

**Never write a literal colour.** No `bg-white`, no `text-gray-500`, no
`text-violet-600`, no hex. Use the tokens: `bg-surface`, `text-muted`,
`text-foreground`, `border-border`.

**Text on a solid fill takes the fill's own "on" token.** `bg-primary
text-on-primary`, `bg-danger text-on-danger`. Not `text-white` - that is the
bug this whole pass fixed, and it is invisible until somebody switches theme.

The one exception is text over media or a black scrim: a caption over a video,
a control on a photo. Those are `text-white` on `bg-black/45` deliberately,
because the ground is the image, not the theme.

**Chrome that floats shares a corner family, not a corner.** The navigation
panel is `rounded-panel` (44px) and the topbar is `rounded-bar` (28px), both
with `corner-shape: squircle`. Two values rather than one because a radius is
only meaningful against the height it sits on: 44px on a 64px bar is more than
half its height, so the corners at each end meet and the browser clamps them
into a stadium. 28px is the same squircle read at the bar's scale, which is
what makes the two shapes look related rather than identical.

**Anything drawn rather than styled needs the resolved theme.** ECharts cannot
be handed a CSS variable, so charts take their axis labels, grid lines and
tooltip card from `useChartTheme()`. The data colours do not change - they are
chosen for separation from each other and carry direct labels, so they hold on
either ground. It is the chrome that has to flip.

```tsx
const chart = useChartTheme();          // one object, memoised on the theme
// ...
xAxis: { axisLabel: chart.axisLabel, splitLine: chart.splitLine }
```

One object rather than four destructured values, so the option builders take a
single stable dependency instead of four the React compiler cannot track.

## The parts that are not CSS

| Thing | Why it needs the theme, and where |
| --- | --- |
| Charts | ECharts wants concrete colours. `lib/chart-theme.ts`, `hooks/use-chart-theme.ts` |
| Toasts | Sonner draws its own surface. `components/app-toaster.tsx` |
| The school's brand | Derived in JS against the ground it sits on. `components/brand-provider.tsx` |

The brand case is the subtle one. `applyColor` sets **inline** styles, which
beat every rule in a stylesheet including the dark palette's. So the default
install must *clear* them rather than re-assert the designed navy: setting
`--brand-primary` to that navy would win over the dark block and leave a
near-invisible navy on a dark card, on the one install nobody has customised.
A school that has chosen its own colour still gets it inline, lightened by
`readableOnDark()` when the ground is dark, because a deep maroon on a dark
card is not a colour, it is an absence of one.

## No flash

A small script is inlined into `<head>` and runs before the first paint. Set
the theme after hydration instead and a reader in a dark room gets a
full-screen white flash on every navigation. It sets one attribute, reads one
storage key, and swallows its own errors - the worst a broken read can do is
leave the page on "system", which is the correct fallback anyway.

It lives in `lib/theme.ts` as `THEME_SCRIPT` so the app and the script cannot
drift apart on the storage key, and a test parses it to prove it is valid
JavaScript. A syntax error there would take down every page.

## Storage can throw

Reading `localStorage` does not merely come back empty in a private window or
a browser set to block site data - the accessor itself raises. Every read and
write in `lib/theme.ts` is wrapped, and a reader who cannot persist their
choice still gets it for the current visit.

## Testing it

```bash
cd web && npx vitest run src/lib/theme.test.ts
cd web && npx vitest run src/components/ui/theme-switch.test.tsx
node scripts/check-contrast.mjs                    # both palettes, 78 checks

# axe over all 108 pages, in each palette
WEB=http://localhost:3001 API=http://localhost:3000/api node web/e2e/a11y-audit.spec.js
WEB=http://localhost:3001 API=http://localhost:3000/api THEME=dark node web/e2e/a11y-audit.spec.js
```

`THEME=dark` runs the same sweep with the OS asking for dark and nothing
stamped, which is the state most readers are in. Contrast is the failure a
dark theme actually ships with, and axe measures exactly that, so it is the
same audit rather than a second one that would drift.

## Things that have already gone wrong here

- **`text-white` on a themed fill.** Correct on paper, invisible on a pale
  dark-mode fill. Seventeen sites, now `text-on-*`.
- **The brand colour re-asserted inline on the default install.** Inline
  styles beat the dark block, so the whole dark palette lost to a navy nobody
  had chosen.
- **An untested pairing surfaced by the sweep.** The secondary button is a
  solid `primaryLight` fill carrying `onPrimary`, which had never been checked
  as text and shipped at 3.97:1. The fill is now `#2A7CB4` and the pairing is
  in the guard.
- **Charts left on light chrome.** Near-black axis labels and near-white grid
  lines on a dark card is an unreadable chart, and no CSS rule can reach it.
- **The store starting on light.** The CSS resolves the theme before any
  JavaScript runs, so a store that assumed light and corrected itself in an
  effect left everything derived in JavaScript one render behind the page: the
  school's colour was computed against a white card and set on a dark one.
  `resolved` now reads the media query at creation.
- **Checking the brand against the wrong ground.** Brand-coloured text sits on
  the card *and* on the accent behind an active row, and the accent is the
  lighter of the two. Checking only the card left the active nav row at 3.28:1
  for a school whose colour was a mid-green.
- **A derived fill with unchecked text on it.** `primaryLight` is the fill
  behind the secondary button, not only a hover tint. Lightening a school's
  colour by a fixed 18% put white on #448D74 at 3.95:1. It is now walked back
  toward the base until the text on it clears AA.
