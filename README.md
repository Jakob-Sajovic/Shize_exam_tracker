# Zobni status — UKC Shize 2025

Dental status data entry for the UKC Shize 2025 study. Standalone web app: no Excel, no
Office add-in, no account. Installs to a tablet home screen, works offline, exports `.xlsx`.

UI language is **Slovenian**; code and comments are in English.

> Prototype. The measures below are what it tracks today — the model and the tab bar
> are built to be extended.

## What it records

| Tab | What | Surfaces |
|---|---|---|
| **Zobje** | Tooth count — present / missing, all 32 permanent teeth | whole tooth |
| **VPI** | Plaque index, marked per surface, auto-calculated % | 4 |
| **GBI** | Bleeding index, same chart over separate data | 4 |
| **Karies** | Caries severity 1–6 per surface | 5 |
| **Zalivke** | Filling material (kompozit / amalgam) per surface | 5 |
| **Zalivke → Zalitje fisur** | Fissure sealant, yes/no | whole tooth |
| **Diagnostične opombe** | Free-text diagnostic observations | — |
| **Izvoz** | Summary, `.xlsx` export, printable report (PDF) | — |

Surfaces are `mesial`, `distal`, `buccal`, `oral` — plus `occlusal` for caries and fillings,
where an occlusal lesion or restoration has to go somewhere. The oral surface is labelled
*palatinalno* in the upper jaw and *lingvalno* in the lower.

**Missing teeth are excluded from every index.** Marking a tooth absent clears everything
recorded on it, so a stale surface can't quietly inflate a denominator later.

## How entry works

- **VPI / GBI** — tap a surface to toggle it.
- **Zobje, Zalitje fisur** — tap a tooth to toggle it.
- **Karies / Zalivke** — pick a grade or material in the toolbar, then tap surfaces to paint
  it. Tapping a surface that already carries the current brush clears it. On a tablet this
  beats opening a dropdown 160 times, and it matches how findings are actually called out.
- Every destructive button needs two taps (the second says *Ste prepričani?*).

## Where the data lives

Autosaves to **IndexedDB** 1.5 s after any change, and again on `pagehide` /
`visibilitychange`. An exam exists **only on the device** until exported — the landing list
flags un-exported sessions with a red *ni izvoženo* badge and a warning count.

Export writes one `.xlsx` row per exam: 660 columns — metadata (including the diagnostic notes)
and computed indices, then
per tooth presence + VPI (4) + GBI (4) + caries (5) + fillings (5) + sealant (1) — followed by a
`_json` backup column. Import prefers `_json` (lossless, survives column changes) and falls back to
the flat columns.

## Report (PDF)

`📄 Poročilo (PDF)` on the Izvoz tab shows the report as a full-screen layer inside the app
(`← Nazaj` / `🖨 Natisni / PDF`), printed with the app's own `window.print()`; *Save as PDF*
there is the PDF export. Not a new window on purpose: an installed app on iOS hands
`window.open` to Safari, with no way back into the app. The report lives in a shadow root so
its styles and the app's stay apart, and a print stylesheet hides the app while it prints. Same approach as the COMFORTage add-in — no PDF
library. Charts are inline SVG using the same `surfaceAt()` mapping as the screen, and
charts and tables are kept whole across page breaks.

A user guide in Slovenian, with screenshots embedded, is in `navodila-za-uporabo.html`.

## Setup

```bash
npm install
npm run dev        # http://localhost:3100
```

| Script | Does |
|---|---|
| `npm run dev` | dev server on port 3100, bound to 0.0.0.0 so a tablet on the LAN can reach it |
| `npm run build` | production build into `dist/` |
| `npm run typecheck` | `tsc --noEmit` (the build itself goes through babel) |
| `npm run deploy` | build and publish `dist/` to the `gh-pages` branch (GitHub Pages) |

A service worker needs a secure context: `localhost` is fine, a plain-`http` LAN IP will run
without offline support.

## Project structure

```
src/
  index.html              app shell — tab strip and one panel per tab
  app/
    app.ts                entry: registers tabs, wires autosave and the service worker
    app.css               all styling
    tab-manager.ts        tab strip, lazy panel init, activate/deactivate lifecycle
  model/
    types.ts              Fdi, surfaces, caries grade, filling material, StatusSession
    constants.ts          tooth rows, surface lists, caries scale, materials, tab defs
    session.ts            singleton session state + summarize() (all indices live here)
    plural.ts             Slovenian singular / dual / few / many agreement
  dental/
    chart.ts              SVG tooth charts (4-surface X, 5-surface cross, whole-tooth box)
                          and the screen-position → anatomical-surface mapping
  tabs/
    tab-landing.ts        session list, new / import / export-all
    tab-subject.ts        code, date, examiner, note
    tab-teeth.ts          tooth count
    tab-index.ts          VPI and GBI — one controller registered twice
    tab-caries.ts         caries, brush entry
    tab-fillings.ts       fillings, brush entry; fissure sealant yes/no chart below
    tab-diagnosis.ts      free-text diagnostic notes
    tab-export.ts         summary, .xlsx export, report button
    reset-button.ts       two-tap confirmation helper
  report/
    report.ts             in-app report layer → window.print() → "Save as PDF"
  storage/
    idb.ts                minimal IndexedDB wrapper, no dependency
    codec.ts              PURE session <-> spreadsheet row (headers and row from one loop)
    workbook.ts           SheetJS driver for the codec + download helper
    store.ts              IndexedDB + export, and the exported/stale bookkeeping
  static/                 manifest.webmanifest, sw.js, icons/
```

### Chart layout

Viewer-left is the subject's **right**. The lower row is mirrored (`48→41 | 31→38`) so each
column is the same side in both jaws. Vestibular is drawn away from the midline: top for the
upper jaw, bottom for the lower. `surfaceAt()` in `dental/chart.ts` is the single place that
turns a screen position into an anatomical surface.

## Adding a measure

1. Add the field to `StatusSession` and its default in `makeEmptySession()` / `normalizeSession()`.
2. Extend `summarize()` if it should be counted.
3. Add a tab entry in `constants.ts`, a panel `<div>` in `index.html`, a controller in
   `tabs/`, and register it in `app.ts`.
4. Add its columns to `getColumnHeaders()` **and** `sessionToRow()` — they are generated from
   the same loop, so keep them together — plus the read side in `rowToSession()`.
5. Add it to the report in `report/report.ts`, and to the summary card on the Izvoz tab.

Old files keep opening: `normalizeSession()` fills in anything a stored session lacks.

## Technology

TypeScript, vanilla DOM (no framework), SheetJS for `.xlsx`, IndexedDB, a service worker,
webpack + babel. Same stack and conventions as the COMFORTage dental add-in, so patterns
carry over between the two projects.
