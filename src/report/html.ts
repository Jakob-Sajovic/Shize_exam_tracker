import { ReportModel, Section, Chart, JawTable, LegendItem, CHART_W } from "./model";

/** Renders the report model as HTML for the in-app preview (and window.print()). */

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderReportHtml(r: ReportModel): string {
  const bodySections = r.sections.map(section).join("");
  return `
<div class="report">
  <header class="report-header">
    <h1>Zobni status</h1>
    <div class="report-meta">
      ${r.meta.map(([k, v]) => `<span><strong>${esc(k)}:</strong> ${esc(v)}</span>`).join("")}
    </div>
  </header>

  <section class="section">
    <h2>Povzetek</h2>
    <table class="summary-table">
      ${r.summary
        .map(
          (row) =>
            `<tr>${row
              .map((item) => `<th>${esc(item.label)}</th><td${item.wide ? ' colspan="3"' : ""}>${esc(item.value)}</td>`)
              .join("")}</tr>`
        )
        .join("")}
    </table>
  </section>

  ${bodySections}

  <!-- Note, signatures and footer travel together so a signature never sits alone on a page -->
  <div class="keep">
    <section class="section">
      <h2>Opomba</h2>
      <div class="notes-content">${esc(r.note)}</div>
    </section>
    <section class="section signature-section">
      <div class="signature-block">
        <div class="signature-line"></div>
        <div class="signature-label">Ime in priimek: ${esc(r.examiner)}</div>
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
    <footer class="report-footer">Zobni status — UKC Shize 2025 · Ustvarjeno: ${esc(r.generatedAt)}</footer>
  </div>
</div>`;
}

function section(sec: Section): string {
  if (sec.notes !== undefined) {
    return `
  <section class="section keep">
    <h2>${esc(sec.title)}</h2>
    <div class="notes-content">${esc(sec.notes)}</div>
  </section>`;
  }
  const head = `
    <div class="keep">
      <h${sec.level}>${esc(sec.title)}</h${sec.level}>
      ${sec.score ? `<p class="score"><strong>${esc(sec.score.strong)}</strong>${esc(sec.score.rest)}</p>` : ""}
      ${sec.chart ? `<div class="chart-figure">${chartSvg(sec.chart)}</div>` : ""}
      ${sec.legend ? legend(sec.legend) : ""}
    </div>`;
  const tables = (sec.tables || []).map(table).join("");
  // Level-3 sections continue the preceding section rather than opening their own.
  return sec.level === 3 ? `<div class="section">${head}${tables}</div>` : `<section class="section">${head}${tables}</section>`;
}

function legend(items: LegendItem[]): string {
  return `<div class="chart-legend">${items
    .map(
      (i) =>
        `<span class="legend-item"><span class="legend-swatch" style="background:${i.color};${i.border ? `border-color:${i.border}` : ""}"></span> ${esc(i.label)}</span>`
    )
    .join("")}</div>`;
}

function table(t: JawTable): string {
  let html = `<table class="jaw-table"><thead>`;
  html += `<tr class="jaw-label-row"><td colspan="${t.teeth.length + 1}">${esc(t.label)}</td></tr>`;
  html += `<tr><th class="surface-label-cell"></th>${t.teeth.map((n) => `<th>${n}</th>`).join("")}</tr>`;
  html += `</thead><tbody>`;
  for (const row of t.rows) {
    html += `<tr><td class="surface-label-cell">${esc(row.label)}</td>`;
    for (const c of row.cells) {
      if (c.muted) {
        html += `<td class="missing-cell">${esc(c.text)}</td>`;
        continue;
      }
      const style = [c.fill ? `background:${c.fill}` : "", c.color ? `color:${c.color}` : ""].filter(Boolean).join(";");
      html += `<td${c.bold ? ' class="active-cell"' : ""}${style ? ` style="${style}"` : ""}>${esc(c.text)}</td>`;
    }
    html += `</tr>`;
  }
  return html + `</tbody></table>`;
}

function chartSvg(chart: Chart): string {
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${chart.width} ${chart.height}" style="width:100%;max-width:${CHART_W * 1.5}px">`,
  ];
  for (const p of chart.prims) {
    switch (p.kind) {
      case "poly":
        out.push(`<polygon points="${p.pts.map(([x, y]) => `${x},${y}`).join(" ")}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.width}"/>`);
        break;
      case "rect":
        out.push(
          `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"${p.rx ? ` rx="${p.rx}"` : ""} fill="${p.fill || "none"}" stroke="${p.stroke}" stroke-width="${p.width}"/>`
        );
        break;
      case "line":
        out.push(
          `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="${p.stroke}" stroke-width="${p.width}"${p.dash ? ' stroke-dasharray="2,2"' : ""}/>`
        );
        break;
      case "text":
        out.push(
          `<text x="${p.x}" y="${p.y}" text-anchor="${p.anchor}" font-size="${p.size}" font-weight="${p.bold ? "bold" : "normal"}" font-family="sans-serif" fill="${p.color}">${esc(p.str)}</text>`
        );
        break;
    }
  }
  out.push(`</svg>`);
  return out.join("");
}

export const REPORT_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
.report { font-family: "Segoe UI", -apple-system, Roboto, sans-serif; font-size: 11px; line-height: normal; color: #1a1a1a; background: #fff; padding: 16px; max-width: 900px; margin: 0 auto; }
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
