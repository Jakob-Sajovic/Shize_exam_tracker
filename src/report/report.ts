import { StatusSession, Fdi, FullSurface, PbSurface } from "../model/types";
import {
  UPPER_ROW,
  LOWER_ROW,
  ALL_TEETH,
  PB_SURFACES,
  FULL_SURFACES,
  CARIES_GRADES,
  FILLING_MATERIALS,
  surfaceLabel,
} from "../model/constants";
import { surfaceAt, Pos5 } from "../dental/chart";
import { summarize } from "../model/session";
import { plural } from "../model/plural";

let closeActive: (() => void) | null = null;

/**
 * Shows the report as a full-screen layer inside the app, printed with the
 * app's own window.print() — "Save as PDF" in that dialog is the PDF export.
 *
 * Deliberately not a new window: an installed app on iOS hands window.open to
 * Safari, and from there there is no way back into the app.
 */
export function openReport(session: StatusSession): void {
  closeActive?.();

  const overlay = document.createElement("div");
  overlay.className = "report-overlay";
  overlay.innerHTML = `
    <div class="report-toolbar">
      <button type="button" class="btn btn-secondary" data-act="close">← Nazaj</button>
      <span class="report-toolbar-title">Poročilo</span>
      <button type="button" class="btn btn-primary" data-act="print">🖨 Natisni / PDF</button>
    </div>
    <div class="report-scroll"><div class="report-sheet"></div></div>`;

  // Shadow root keeps the report's print styles and the app's styles apart.
  const sheet = overlay.querySelector(".report-sheet") as HTMLElement;
  sheet.attachShadow({ mode: "open" }).innerHTML = `<style>${REPORT_CSS}</style>${buildReportBody(session)}`;

  const previousTitle = document.title;
  // The print dialog proposes the document title as the PDF file name.
  document.title = reportFileTitle(session);
  document.body.classList.add("report-open");
  document.body.appendChild(overlay);

  const remove = () => {
    window.removeEventListener("popstate", onPop);
    overlay.remove();
    document.body.classList.remove("report-open");
    document.title = previousTitle;
    closeActive = null;
  };
  const onPop = () => remove();

  // A history entry lets the Android back button / back gesture close the report.
  let pushed = false;
  try {
    history.pushState({ report: true }, "");
    pushed = true;
    window.addEventListener("popstate", onPop);
  } catch {
    /* no history API — the Nazaj button still works */
  }
  closeActive = () => (pushed ? history.back() : remove());

  overlay.querySelector('[data-act="close"]')?.addEventListener("click", () => closeActive?.());
  overlay.querySelector('[data-act="print"]')?.addEventListener("click", () => window.print());
}

function reportFileTitle(s: StatusSession): string {
  return `ZobniStatus_${(s.subject.code || "pregled").replace(/[^\w\-.]+/g, "_")}_${s.subject.date || "brez-datuma"}`;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PLAQUE_COLOR = "#ffd335";
const BLEEDING_COLOR = "#d13438";

export function buildReportBody(s: StatusSession): string {
  const sub = s.subject;
  const sum = summarize(s);
  const missing = ALL_TEETH.filter((t) => !s.present[t]).sort((a, b) => a - b);
  const sealed = ALL_TEETH.filter((t) => s.present[t] && s.sealants[t]).sort((a, b) => a - b);

  const cariesColor = (t: Fdi, surf: FullSurface) => {
    const g = s.caries[t][surf];
    return g ? CARIES_GRADES.find((d) => d.value === g)?.color || "" : "";
  };
  const fillingColor = (t: Fdi, surf: FullSurface) => {
    const m = s.fillings[t][surf];
    return m ? FILLING_MATERIALS.find((d) => d.value === m)?.color || "" : "";
  };
  const fillingLetter = (t: Fdi, surf: FullSurface) =>
    s.fillings[t][surf] === "kompozit" ? "K" : s.fillings[t][surf] === "amalgam" ? "A" : "";

  return `
<div class="report">
  <header class="report-header">
    <h1>Zobni status</h1>
    <div class="report-meta">
      <span><strong>Koda preiskovanca:</strong> ${esc(sub.code || "—")}</span>
      <span><strong>Datum pregleda:</strong> ${esc(formatDate(sub.date))}</span>
      <span><strong>Izvajalec:</strong> ${esc(sub.examiner || "—")}</span>
      <span><strong>ID pregleda:</strong> ${esc(s.sessionId)}</span>
    </div>
  </header>

  <section class="section">
    <h2>Povzetek</h2>
    <table class="summary-table">
      <tr><th>Prisotni zobje</th><td>${sum.teethPresent} / ${ALL_TEETH.length}</td>
          <th>Manjkajoči zobje</th><td>${missing.length ? missing.join(", ") : "—"}</td></tr>
      <tr><th>VPI (plak)</th><td>${sum.vpiPercent.toFixed(1)} % (${sum.vpiMarked} / ${sum.vpiTotal})</td>
          <th>GBI (krvavitev)</th><td>${sum.gbiPercent.toFixed(1)} % (${sum.gbiMarked} / ${sum.gbiTotal})</td></tr>
      <tr><th>Kariozne ploskve</th><td>${sum.cariesSurfaces} (na ${onTeeth(sum.cariesTeeth)})</td>
          <th>Ploskve z zalivko</th><td>${sum.fillingSurfaces} (kompozit ${sum.fillingComposite} · amalgam ${sum.fillingAmalgam})</td></tr>
      <tr><th>Zalitje fisur</th><td colspan="3">${sealed.length ? `${sealed.length} ${plural(sealed.length, "zob", "zoba", "zobje", "zob")}: ${sealed.join(", ")}` : "—"}</td></tr>
    </table>
  </section>

  <section class="section">
    <div class="keep">
      <h2>Zobje</h2>
      <p class="score"><strong>${sum.teethPresent}</strong> ${plural(sum.teethPresent, "prisoten zob", "prisotna zoba", "prisotni zobje", "prisotnih zob")} od ${ALL_TEETH.length} · manjkajočih: ${missing.length}</p>
      <div class="chart-figure">${chartSvg("whole", s)}</div>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-swatch" style="background:#eff6fc;border-color:#0078d4"></span> prisoten</span>
        <span class="legend-item"><span class="legend-swatch" style="background:#e8e8e8"></span> manjka</span>
      </div>
    </div>
  </section>

  ${pbSection("VPI — plak indeks", "Vidni plak", s, "plaque", PLAQUE_COLOR, sum.vpiPercent, sum.vpiMarked, sum.vpiTotal)}
  ${pbSection("GBI — indeks krvavitve", "Krvavitev ob sondiranju", s, "bleeding", BLEEDING_COLOR, sum.gbiPercent, sum.gbiMarked, sum.gbiTotal)}

  <section class="section">
    <div class="keep">
      <h2>Karies</h2>
      <p class="score"><strong>${sum.cariesSurfaces}</strong> ${plural(sum.cariesSurfaces, "kariozna ploskev", "kariozni ploskvi", "kariozne ploskve", "karioznih ploskev")} na ${onTeeth(sum.cariesTeeth)}</p>
      <div class="chart-figure">${chartSvg(5, s, cariesColor, (t, surf) => (s.caries[t][surf] ? String(s.caries[t][surf]) : ""))}</div>
      <div class="chart-legend">
        ${CARIES_GRADES.map((g) => `<span class="legend-item"><span class="legend-swatch" style="background:${g.color}"></span> ${g.label} — ${esc(g.description)}</span>`).join("")}
      </div>
    </div>
    ${jawTable("Zgornja čeljust", UPPER_ROW, s, FULL_SURFACES, (t, surf) => cellFor(s.caries[t][surf] ? String(s.caries[t][surf]) : "", cariesColor(t, surf), s.caries[t][surf] >= 5))}
    ${jawTable("Spodnja čeljust", LOWER_ROW, s, FULL_SURFACES, (t, surf) => cellFor(s.caries[t][surf] ? String(s.caries[t][surf]) : "", cariesColor(t, surf), s.caries[t][surf] >= 5))}
  </section>

  <section class="section">
    <div class="keep">
      <h2>Zalivke</h2>
      <p class="score"><strong>${sum.fillingSurfaces}</strong> ${plural(sum.fillingSurfaces, "ploskev z zalivko", "ploskvi z zalivko", "ploskve z zalivko", "ploskev z zalivko")} (kompozit ${sum.fillingComposite} · amalgam ${sum.fillingAmalgam})</p>
      <div class="chart-figure">${chartSvg(5, s, fillingColor, fillingLetter)}</div>
      <div class="chart-legend">
        ${FILLING_MATERIALS.map((m) => `<span class="legend-item"><span class="legend-swatch" style="background:${m.color}"></span> ${m.label[0]} — ${m.label}</span>`).join("")}
      </div>
    </div>
    ${jawTable("Zgornja čeljust", UPPER_ROW, s, FULL_SURFACES, (t, surf) => cellFor(fillingLetter(t, surf), fillingColor(t, surf), s.fillings[t][surf] === "amalgam"))}
    ${jawTable("Spodnja čeljust", LOWER_ROW, s, FULL_SURFACES, (t, surf) => cellFor(fillingLetter(t, surf), fillingColor(t, surf), s.fillings[t][surf] === "amalgam"))}
    <div class="keep">
      <h3>Zalitje fisur</h3>
      <p class="score"><strong>${sum.sealedTeeth}</strong> ${plural(sum.sealedTeeth, "zob", "zoba", "zobje", "zob")} z zalitimi fisurami${sealed.length ? ` (${sealed.join(", ")})` : ""}</p>
      <div class="chart-figure">${chartSvg("whole", s, undefined, undefined, (t) => !!s.sealants[t])}</div>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-swatch" style="background:#dff6dd;border-color:#107c10"></span> zalito</span>
        <span class="legend-item"><span class="legend-swatch" style="background:#fff"></span> ni zalito</span>
        <span class="legend-item"><span class="legend-swatch" style="background:#e8e8e8"></span> manjka</span>
      </div>
    </div>
  </section>

  <section class="section keep">
    <h2>Diagnostične opombe</h2>
    <div class="notes-content">${esc((s.diagnosticNotes || "").trim() || "—")}</div>
  </section>

  <!-- Note, signatures and footer travel together so a signature never sits alone on a page -->
  <div class="keep">
  <section class="section">
    <h2>Opomba</h2>
    <div class="notes-content">${esc(sub.note.trim() || "—")}</div>
  </section>

  <section class="section signature-section">
    <div class="signature-block">
      <div class="signature-line"></div>
      <div class="signature-label">Ime in priimek: ${esc(sub.examiner)}</div>
    </div>
    <div class="signature-block">
      <div class="signature-line"></div>
      <div class="signature-label">Podpis izvajalca pregleda</div>
    </div>
    <div class="signature-block">
      <div class="signature-line"></div>
      <div class="signature-label">Datum</div>
    </div>
  </section>

  <footer class="report-footer">
    Zobni status — UKC Shize 2025 · Ustvarjeno: ${new Date().toLocaleString("sl-SI")}
  </footer>
  </div>
</div>`;
}

function onTeeth(n: number): string {
  return `${n} ${plural(n, "zobu", "zobeh", "zobeh", "zobeh")}`;
}

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : iso || "—";
}

// ── Sections ─────────────────────────────────────────────────────

function pbSection(
  title: string,
  legend: string,
  s: StatusSession,
  kind: "plaque" | "bleeding",
  color: string,
  percent: number,
  marked: number,
  total: number
): string {
  const on = (t: Fdi, surf: FullSurface) => !!s[kind][t][surf as PbSurface];
  const cell = (t: Fdi, surf: PbSurface) =>
    on(t, surf) ? `<td class="active-cell" style="background:${color}">●</td>` : `<td>○</td>`;

  return `
  <section class="section">
    <div class="keep">
      <h2>${title}</h2>
      <p class="score"><strong>${percent.toFixed(1)} %</strong> (${marked} od ${total} ${plural(total, "ploskve", "ploskev", "ploskev", "ploskev")})</p>
      <div class="chart-figure">${chartSvg(4, s, (t, surf) => (on(t, surf) ? color : ""))}</div>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-swatch" style="background:${color}"></span> ${legend}</span>
      </div>
    </div>
    ${jawTable("Zgornja čeljust", UPPER_ROW, s, PB_SURFACES, cell)}
    ${jawTable("Spodnja čeljust", LOWER_ROW, s, PB_SURFACES, cell)}
  </section>`;
}

function cellFor(text: string, color: string, darkBg: boolean): string {
  if (!text) return `<td></td>`;
  return `<td class="active-cell" style="background:${color};${darkBg ? "color:#fff;" : ""}">${text}</td>`;
}

/** Surfaces as rows, teeth as columns — 16 columns fit an A4 width, 32 rows would not. */
function jawTable<S extends FullSurface>(
  jawLabel: string,
  teeth: Fdi[],
  s: StatusSession,
  surfaces: S[],
  cell: (t: Fdi, surf: S) => string
): string {
  let html = `<table class="jaw-table"><thead>`;
  html += `<tr class="jaw-label-row"><td colspan="${teeth.length + 1}">${jawLabel}</td></tr>`;
  html += `<tr><th class="surface-label-cell"></th>${teeth.map((t) => `<th>${t}</th>`).join("")}</tr>`;
  html += `</thead><tbody>`;
  for (const surf of surfaces) {
    const label = surfaceLabel(surf, teeth[0]);
    html += `<tr><td class="surface-label-cell">${label[0].toUpperCase()}${label.slice(1)}</td>`;
    for (const t of teeth) {
      html += s.present[t] ? cell(t, surf) : `<td class="missing-cell">—</td>`;
    }
    html += `</tr>`;
  }
  return html + `</tbody></table>`;
}

// ── Chart SVG ────────────────────────────────────────────────────

const C = { cell: 26, gap: 2, midGap: 8, numH: 11, rowGap: 3, sideH: 12 };
const HALF_W = 8 * C.cell + 7 * C.gap;
const TOTAL_W = HALF_W * 2 + C.midGap;
const TOTAL_H = C.numH + C.cell + C.rowGap + C.cell + C.numH + C.sideH;

function colX(i: number): number {
  return i < 8 ? i * (C.cell + C.gap) : HALF_W + C.midGap + (i - 8) * (C.cell + C.gap);
}

/**
 * Same layout as the on-screen chart: viewer-left is the subject's right, the
 * lower row mirrored under the upper, numbers outside the rows.
 */
function chartSvg(
  mode: 4 | 5 | "whole",
  s: StatusSession,
  fillFor?: (t: Fdi, surf: FullSurface) => string,
  textFor?: (t: Fdi, surf: FullSurface) => string,
  marked?: (t: Fdi) => boolean
): string {
  const upperY = C.numH;
  const lowerY = upperY + C.cell + C.rowGap;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TOTAL_W} ${TOTAL_H}" style="width:100%;max-width:${TOTAL_W * 1.5}px">`,
  ];

  const midX = HALF_W + C.midGap / 2;
  parts.push(`<line x1="${midX}" y1="${upperY}" x2="${midX}" y2="${lowerY + C.cell}" stroke="#bbb" stroke-width="0.5" stroke-dasharray="2,2"/>`);

  UPPER_ROW.forEach((t, i) => {
    const x = colX(i);
    parts.push(text(x + C.cell / 2, C.numH - 3, String(t), 7, "#333"));
    parts.push(toothSvg(mode, s, t, x, upperY, fillFor, textFor, marked));
  });
  LOWER_ROW.forEach((t, i) => {
    const x = colX(i);
    parts.push(toothSvg(mode, s, t, x, lowerY, fillFor, textFor, marked));
    parts.push(text(x + C.cell / 2, lowerY + C.cell + C.numH - 2, String(t), 7, "#333"));
  });

  const sideY = TOTAL_H - 2;
  parts.push(`<text x="0" y="${sideY}" font-size="6" font-family="sans-serif" fill="#888">preiskovančeva DESNA</text>`);
  parts.push(`<text x="${TOTAL_W}" y="${sideY}" text-anchor="end" font-size="6" font-family="sans-serif" fill="#888">preiskovančeva LEVA</text>`);
  parts.push(`</svg>`);
  return parts.join("");
}

function text(x: number, y: number, str: string, size: number, fill: string, weight = "normal"): string {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="${weight}" font-family="sans-serif" fill="${fill}">${esc(str)}</text>`;
}

function toothSvg(
  mode: 4 | 5 | "whole",
  s: StatusSession,
  t: Fdi,
  x: number,
  y: number,
  fillFor?: (t: Fdi, surf: FullSurface) => string,
  textFor?: (t: Fdi, surf: FullSurface) => string,
  marked?: (t: Fdi) => boolean
): string {
  const c = C.cell;
  if (!s.present[t]) {
    return (
      `<rect x="${x}" y="${y}" width="${c}" height="${c}" fill="#e8e8e8" stroke="#bbb" stroke-width="0.5"/>` +
      `<line x1="${x + 4}" y1="${y + 4}" x2="${x + c - 4}" y2="${y + c - 4}" stroke="#aaa" stroke-width="0.8"/>` +
      `<line x1="${x + c - 4}" y1="${y + 4}" x2="${x + 4}" y2="${y + c - 4}" stroke="#aaa" stroke-width="0.8"/>`
    );
  }
  if (mode === "whole") {
    // Yes/no charts (sealants) draw marked green and unmarked plain; otherwise plain presence.
    const [fill, stroke, ink] = !marked
      ? ["#eff6fc", "#0078d4", "#0078d4"]
      : marked(t)
        ? ["#dff6dd", "#107c10", "#0b5a0b"]
        : ["#fff", "#8a8886", "#605e5c"];
    return (
      `<rect x="${x}" y="${y}" width="${c}" height="${c}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="0.8"/>` +
      text(x + c / 2, y + c / 2 + 2.5, String(t), 7, ink, "bold")
    );
  }

  const h = c / 2;
  const m = Math.round(c * 0.28);
  const shapes: { pos: Pos5; points: string; tx: number; ty: number }[] =
    mode === 4
      ? [
          { pos: "top", points: `${x},${y} ${x + c},${y} ${x + h},${y + h}`, tx: x + h, ty: y + 7.5 },
          { pos: "right", points: `${x + c},${y} ${x + c},${y + c} ${x + h},${y + h}`, tx: x + c - 5, ty: y + h + 2.5 },
          { pos: "bottom", points: `${x},${y + c} ${x + c},${y + c} ${x + h},${y + h}`, tx: x + h, ty: y + c - 3 },
          { pos: "left", points: `${x},${y} ${x},${y + c} ${x + h},${y + h}`, tx: x + 5, ty: y + h + 2.5 },
        ]
      : [
          { pos: "top", points: `${x},${y} ${x + c},${y} ${x + c - m},${y + m} ${x + m},${y + m}`, tx: x + h, ty: y + m - 1.5 },
          { pos: "right", points: `${x + c - m},${y + m} ${x + c},${y} ${x + c},${y + c} ${x + c - m},${y + c - m}`, tx: x + c - m / 2, ty: y + h + 2.5 },
          { pos: "bottom", points: `${x + m},${y + c - m} ${x + c - m},${y + c - m} ${x + c},${y + c} ${x},${y + c}`, tx: x + h, ty: y + c - 1.5 },
          { pos: "left", points: `${x},${y} ${x + m},${y + m} ${x + m},${y + c - m} ${x},${y + c}`, tx: x + m / 2, ty: y + h + 2.5 },
          { pos: "center", points: `${x + m},${y + m} ${x + c - m},${y + m} ${x + c - m},${y + c - m} ${x + m},${y + c - m}`, tx: x + h, ty: y + h + 2.5 },
        ];

  let out = "";
  for (const sh of shapes) {
    const surf = surfaceAt(t, sh.pos);
    const fill = fillFor?.(t, surf) || "#fff";
    out += `<polygon points="${sh.points}" fill="${fill}" stroke="#999" stroke-width="0.5"/>`;
  }
  if (textFor) {
    for (const sh of shapes) {
      const label = textFor(t, surfaceAt(t, sh.pos));
      if (label) out += text(sh.tx, sh.ty, label, 6.5, "#201f1e", "bold");
    }
  }
  out += `<rect x="${x}" y="${y}" width="${c}" height="${c}" fill="none" stroke="#666" stroke-width="0.6"/>`;
  return out;
}

// ── Styles ───────────────────────────────────────────────────────

const REPORT_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
.report { font-family: "Segoe UI", -apple-system, Roboto, sans-serif; font-size: 11px; line-height: normal; color: #1a1a1a; background: #fff; padding: 16px; }
.report { max-width: 900px; margin: 0 auto; }
.report-header { border-bottom: 2px solid #0078d4; padding-bottom: 12px; margin-bottom: 16px; }
.report-header h1 { font-size: 20px; color: #0078d4; margin-bottom: 8px; }
.report-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; }
.section { margin-bottom: 20px; }
.section h2 { font-size: 15px; color: #0078d4; border-bottom: 1px solid #0078d4; padding-bottom: 4px; margin-bottom: 8px; }
.section h3 { font-size: 13px; color: #0078d4; margin: 14px 0 6px; }
.score { font-size: 13px; margin-bottom: 8px; }
table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 8px; }
th, td { border: 1px solid #d0d0d0; padding: 3px 4px; text-align: center; }
th { background: #f0f0f0; font-weight: 600; }
.summary-table th { text-align: left; width: 18%; }
.summary-table td { text-align: left; width: 32%; }
.jaw-table { page-break-inside: avoid; break-inside: avoid; }
.keep { page-break-inside: avoid; break-inside: avoid; }
.jaw-label-row td { background: #e8f4fd; font-weight: 600; text-align: left; font-size: 11px; }
.surface-label-cell { text-align: left; font-weight: 600; background: #f8f8f8; white-space: nowrap; }
.missing-cell { color: #a0a0a0; }
.active-cell { font-weight: 700; }
.chart-figure { margin: 8px 0; text-align: center; }
.chart-figure svg { display: inline-block; }
.chart-legend { display: flex; flex-wrap: wrap; gap: 6px 12px; justify-content: center; margin-bottom: 10px; font-size: 9.5px; }
.legend-item { display: inline-flex; align-items: center; gap: 4px; }
.legend-swatch { display: inline-block; width: 11px; height: 11px; border: 1px solid #999; border-radius: 2px; }
.notes-content { white-space: pre-wrap; background: #fafafa; border: 1px solid #e0e0e0; padding: 8px; border-radius: 4px; min-height: 24px; font-size: 11px; }
.signature-section { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 32px; page-break-inside: avoid; }
.signature-block { flex: 1; min-width: 180px; }
.signature-line { border-bottom: 1px solid #333; height: 36px; margin-bottom: 4px; }
.signature-label { font-size: 10px; color: #555; text-align: center; }
.report-footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #d0d0d0; font-size: 10px; color: #888; text-align: right; }
@media print {
  .report { padding: 0; max-width: none; }
}
`;
