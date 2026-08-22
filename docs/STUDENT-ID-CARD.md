# Student ID card: design brief

Everything needed to design `design/id-card.svg`, and the contract the code
relies on when it fills that file in.

Design the card in Figma or Illustrator, export SVG, save it to
`design/id-card.svg`. The application never edits the artwork; it only replaces
the contents of the elements listed under [The SVG contract](#the-svg-contract).
Anything not in that list is yours to move, restyle or remove.

---

## 1. Physical specification

| Property | Value | Why |
| --- | --- | --- |
| Size | **85.60 × 53.98 mm** (CR80) | The bank-card standard. Fits every lanyard holder and card printer sold locally. |
| Aspect ratio | 1.586 : 1 | Locked by CR80. |
| SVG viewBox | `0 0 856 540` | 1 unit = 0.1 mm. Whole numbers, no floating point in the artwork. |
| Corner radius | 32 units (3.2 mm) | CR80 standard corner. |
| Bleed | 20 units (2 mm) on every edge | Artwork that must reach the edge has to extend into the bleed. |
| Safe area | 40 units (4 mm) inset from the trim | Nothing readable may sit outside this. Card printers drift. |
| Sides | Two: `id-card-front.svg`, `id-card-back.svg` | Both listed below. |
| Output | Export at 300 DPI minimum for print | 600 DPI if the printer supports it. |

The card is **landscape**. Portrait cards look neater on a lanyard but leave no
room for a photo beside the school block, and every card printer the school is
likely to buy feeds landscape.

---

## 2. What goes on the front

Ordered by visual weight, most prominent first.

| # | Element | Source | Notes |
| --- | --- | --- | --- |
| 1 | Student photo | `user.photoUrl` | See [Photo](#photo-slot). Never omit; a card without a face verifies nothing. |
| 2 | Student full name | `user.firstName + user.lastName` | Up to 5 name parts. Must survive 34 characters. |
| 3 | Student ID | `student.studentIdNumber` | Monospace. Format `STD-2025-231419-167`, 19 characters. |
| 4 | QR code | Generated | See [QR code](#qr-code). |
| 5 | School logo | `school_config.logo_url` | |
| 6 | School name | `school_config.school_name` | |
| 7 | Level | `student.classSection.classLevel.name` | e.g. "Senior 1", "Level 4". **See the warning below.** |
| 8 | Validity | Academic year dates | e.g. "Valid to 30 Jun 2026". |

> **A warning about level.** Level changes every year, so printing it commits
> the school to reissuing all ~1,200 cards annually. If you would rather issue a
> card that lasts a full cycle, drop element 7 and let the validity date carry
> the time limit. The decision is the school's; the SVG contract supports both
> (leave `#student-level` out of the file and the code skips it).

---

## 3. What goes on the back

| # | Element | Source | Notes |
| --- | --- | --- | --- |
| 1 | Guardian phone | First linked parent's `phone` | Labelled "In case of emergency". The number that matters when a child's card is found. |
| 2 | Blood type | `student.bloodType` | Present for 739 of 1,229 students. Must degrade to blank, not to "—". |
| 3 | "If found" block | `school_address`, `school_phone` | "If found, please return to: <address> · <phone>". |
| 4 | School contact | `school_email`, `school_phone`, `school_website` | |
| 5 | Verification line | Generated | Short human-readable code beneath the QR, so someone without a phone can type it. |

`school_website` **does not exist yet** in `SchoolConfig`. It has to be added
before the back can carry it (see [Open items](#open-items)).

---

## 4. What is deliberately not on the card

| Excluded | Reason |
| --- | --- |
| Class or stream ("Senior 1 B") | Changes every year and mid-year on transfer. Forces reprints. |
| NFC card ID (`MK-7B99FF6D15`) | Internal plumbing. It means nothing to a human and the QR already carries what scanners need. |
| Handwritten signature and rubber stamp | A scanned signature on a printed card is trivially copied and proves nothing. The QR verification below replaces it, and actually proves something. |
| Date of birth | Not needed to identify a student at a gate, and it is personal data on an object children lose. |
| National ID number | Same reasoning, more strongly. Never print it. |

---

## 5. Verification: what is and is not possible

The school asked for something on the card that cannot be copied and that the
server checks. The honest position:

**Nothing printed on a card can be uncopyable.** A photocopier reproduces a QR
code as faithfully as it reproduces a signature. Any design that claims
otherwise is relying on physical measures — holograms, microtext, UV ink — which
are a printing decision, not a software one.

What a signed QR plus a server check *does* give, which a signature never did:

1. **Forgery becomes impossible.** The verification code is unguessable and
   issued only by the server. Nobody can invent a card for a student who does
   not exist, or alter the name or level on a real one, because the code will
   not resolve.
2. **A lost card can be killed.** Reissuing revokes the previous card. The old
   one still scans, and the server answers **REVOKED**. The application already
   has this action (`POST /reports/id-cards/revoke`).
3. **A copy is caught by the person checking.** Scanning returns the school's
   own photo and the student's current status. A copied card handed to someone
   else fails the moment the checker looks at the screen and then at the face.

That third point is the real defence, and it is the same model used by event
tickets and vaccine certificates. The code proves the card is genuine; the
photo on the server proves the bearer is its owner.

This mirrors the report-card verification already in the system
(`GET /api/verify/:code`, public and rate limited at 20/minute).

---

## 6. QR code

| Property | Value |
| --- | --- |
| Encodes | `https://<school_website>/verify/card/<code>` |
| Fallback when no website is set | The bare code, so gate scanners still resolve the student |
| Size | 180 × 180 units (18 mm) minimum |
| Quiet zone | 4 modules, non-negotiable, part of the QR spec |
| Error correction | Level **M** (15%). Level H wastes space; a card in a wallet is not a warehouse label. |
| Colour | Pure `#000000` on `#FFFFFF`. Not the brand navy. |

> Do not tint the QR, do not round its modules, and do not place a logo over
> the centre. Every one of those reduces the scan rate on the cheap handheld
> readers a school actually buys.

The card also carries the same code as text beneath the QR, so a member of staff
without a scanner can type it into the verification page.

**Existing scanners already work with this.** `POST /attendance/qr-scan` and
`POST /library/checkout` both resolve a student by `studentIdNumber`, so a card
scanned at the gate or the library desk works with no backend change.

---

## 7. Photo slot

| Property | Value |
| --- | --- |
| Aspect ratio | 3 : 4 portrait |
| Size on card | 200 × 267 units (20 × 26.7 mm) minimum |
| Crop | Head and shoulders, eyes on the upper third |
| Fit | `preserveAspectRatio="xMidYMid slice"` so a wrong-ratio photo crops rather than distorts |
| Fallback | If `photoUrl` is null, the code draws the student's initials on `color.accent`. Leave the slot in the artwork; do not design around its absence. |

---

## 8. Typography

Only these two families, both already in the design system:

| Use | Family | Weight | Minimum size |
| --- | --- | --- | --- |
| Student name | **Poppins** | 600 | 44 units (4.4 mm) |
| Labels and school text | **Poppins** | 400 / 500 | 22 units (2.2 mm) |
| Student ID, verification code | **JetBrains Mono** | 500 | 26 units (2.6 mm) |

Machine-readable codes are always monospace: it is what stops `0`/`O` and `1`/`l`
being misread aloud.

**Convert all text to outlines only in the print export.** The working
`design/id-card.svg` must keep live `<text>` nodes, or the code cannot fill it.

Nothing on the card may be below 20 units (2 mm) cap height. Below that it stops
being readable on the card stock a school buys.

---

## 9. Colour

From `design/tokens.json`. Do not introduce colours outside this list.

| Token | Hex | Use |
| --- | --- | --- |
| `color.primary` | `#1B4F72` | Header band, school name |
| `color.primaryDark` | `#154360` | Rules and dividers |
| `color.primaryLight` | `#2E86C1` | Accent only, never text on white |
| `color.accent` | `#D6EAF8` | Photo fallback background |
| `color.surface` | `#FFFFFF` | Card face |
| `color.foreground` | `#1E293B` | Student name, primary text |
| `color.foregroundMuted` | `#475569` | Labels |
| `color.borderStrong` | `#CBD5E1` | Hairlines |

Every text/background pairing must clear **WCAG AA (4.5:1)**. Measured against
white: `color.foreground` 14.6:1, `color.primary` 8.7:1, `color.foregroundMuted`
7.6:1. `color.primaryLight` is **4.0:1 and therefore not usable for text** at
any size on the card; use it for rules and fills only.

The card must also survive being photocopied in black and white, which is how
half of them will be reproduced for a register. Do not rely on colour alone to
distinguish anything.

---

## 10. The SVG contract

The code looks up these elements **by `id`** and replaces their contents.
Everything else in the file is left exactly as designed.

### Front — `design/id-card-front.svg`

| Element id | Type | Replaced with |
| --- | --- | --- |
| `student-photo` | `<image>` | `href` set to the photo URL |
| `student-photo-fallback` | `<g>` | Shown only when there is no photo |
| `student-name` | `<text>` | Full name |
| `student-id` | `<text>` | `STD-2025-231419-167` |
| `student-level` | `<text>` | `Senior 1` — omit the element to omit the field |
| `card-validity` | `<text>` | `Valid to 30 Jun 2026` |
| `school-name` | `<text>` | From config |
| `school-logo` | `<image>` | `href` set to the logo URL |
| `qr-code` | `<g>` | Replaced wholesale with the generated QR |

### Back — `design/id-card-back.svg`

| Element id | Type | Replaced with |
| --- | --- | --- |
| `guardian-phone` | `<text>` | First linked guardian's number |
| `blood-type` | `<text>` | e.g. `A-`, blank when unknown |
| `if-found` | `<text>` | Address and phone |
| `school-contact` | `<text>` | Email, phone, website |
| `verification-code` | `<text>` | The same code the QR encodes |

Rules for the designer:

- **Ids must be exactly as written**, lowercase, hyphenated. Figma will rename
  duplicates to `student-name-1`; check the exported file.
- Every `<text>` node above must be a **single text node**, not a group of
  per-character spans. Figma exports character spans when letter-spacing is
  applied to part of a string; apply it to the whole node instead.
- Give long fields room to grow. `student-name` must hold 34 characters, and
  `Aaron Prince Mahoro Irakoze` is a real student in the current data.
- Do not group a placeholder inside a mask or clip path other than the photo's.

---

## 11. How the student ID is built

Printed as `STD-<year>-<ABC>-<DEF>`, for example `STD-2025-231419-167`.

**`year`** — the year the student enrolled, four digits.

**`ABC`** — three two-digit numbers, each the position of a letter in the
alphabet (A=01 … Z=26), taken from the student's own name:

| Name parts | A | B | C |
| --- | --- | --- | --- |
| 2 | first letter of the given name | first letter of the family name | **second** letter of the family name |
| 3 or more | first letter of the first name | first letter of the last name | first letter of `parts[len ÷ 2]`, the true middle name |
| 1 | first letter | second letter | third letter |

Using `parts[len ÷ 2]` means a student with three names and a student with five
are handled by one rule, and C is always a letter that is genuinely theirs.

```
Wilson Nshizirungu            W=23  N=14  s=19   ->  231419
Aaron Prince Mahoro Irakoze   A=01  I=09  M=13   ->  010913
Calvin Aidan Nshuti           C=03  N=14  A=01   ->  031401
```

**`DEF`** — three digits from `HMAC-SHA256(school_secret, year|ABC|student)`.
Only the server can compute it, so a student cannot invent an ID that passes a
gate scanner.

`DEF` is also what makes the ID unique. Measured against the 1,229 students
currently in the database, **429 of them (35%) share a `year-ABC` prefix with
someone else**, the largest group being 7 students. `year-ABC` alone is not an
identifier. With `DEF` added, all 1,229 are unique with no collisions.

**The ID is computed once at enrolment and stored.** It is never recomputed, so
correcting a spelling or adding a name later never changes a student's ID.

---

## 12. Open items

These have to be settled before the card can be produced in full:

1. **`school_website` does not exist** in `SchoolConfig`. Needs adding, seeding
   and a field in Settings before the back can carry it or the QR can point at
   a verification URL rather than a bare code.
2. **Level on the card** — reprint annually, or drop it and rely on validity.
   See the warning in section 2.
3. **Card stock and printer** — decides whether bleed is honoured and whether
   two-sided printing is available. If the school prints on a home printer,
   the back should be designed to be optional.

---

## 13. Checklist before handing the SVG over

- [ ] `viewBox="0 0 856 540"`, no other coordinate system
- [ ] Every id from section 10 present, spelled exactly, and unique
- [ ] Every placeholder `<text>` is a single text node
- [ ] `student-name` still readable at 34 characters
- [ ] Nothing readable outside the 40-unit safe area
- [ ] QR area is at least 180 × 180 units with its quiet zone clear
- [ ] Only Poppins and JetBrains Mono, text left live and not outlined
- [ ] Only colours from section 9
- [ ] Legible when photocopied in black and white
- [ ] No class, NFC id, date of birth or national ID anywhere on either side
