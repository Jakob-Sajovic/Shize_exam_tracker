import { jsPDF } from "jspdf";
import autoTable, { CellDef, RowInput } from "jspdf-autotable";
import { ReportModel, Section, Chart, JawTable, LegendItem } from "./model";
import { DEJAVU_SANS, DEJAVU_SANS_BOLD } from "./fonts";

/**
 * Renders the report model straight to a vector A4 PDF.
 *
 * This exists because window.print() does nothing in an app installed to the
 * iOS home screen. A generated file can go to the share sheet instead (Save to
 * Files, Print, Mail), which works everywhere. Loaded on demand — it pulls in
 * jsPDF and an embedded font.
 */

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
const BOTTOM = PAGE_H - 16; // leaves room for the page number
const CONTENT_W = PAGE_W - 2 * MARGIN;
const CHART_MM = 150;
const PT = 0.3528; // mm per point
const FONT = "dejavu";

type RGB = [number, number, number];

function rgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

const BLUE = rgb("#0078d4");
const INK = rgb("#1a1a1a");
const MUTED = rgb("#888888");

export function renderReportPdf(r: ReportModel): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("DejaVuSans.ttf", DEJAVU_SANS);
  doc.addFont("DejaVuSans.ttf", FONT, "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", DEJAVU_SANS_BOLD);
  doc.addFont("DejaVuSans-Bold.ttf", FONT, "bold");
  doc.setProperties({ title: r.fileTitle, subject: "Zobni status — UKC Shize 2025", creator: "Zobni status" });

  const w = new Writer(doc);
  w.header(r);
  w.summary(r);
  for (const sec of r.sections) w.section(sec);
  w.closing(r);
  w.pageNumbers();

  return doc.output("blob");
}

class Writer {
  y = MARGIN;

  constructor(private doc: jsPDF) {}

  private font(size: number, bold = false, color: RGB = INK): void {
    this.doc.setFont(FONT, bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
  }

  /** Starts a new page if `h` millimetres do not fit on this one. */
  private ensure(h: number): void {
    if (this.y + h > BOTTOM) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  header(r: ReportModel): void {
    this.font(18, true, BLUE);
    this.doc.text("Zobni status", MARGIN, this.y + 6);
    this.y += 11;

    // Meta items flow left to right and wrap
    let x = MARGIN;
    for (const [k, v] of r.meta) {
      this.font(9, true);
      const kw = this.doc.getTextWidth(`${k}: `);
      this.font(9);
      const vw = this.doc.getTextWidth(v);
      if (x > MARGIN && x + kw + vw > PAGE_W - MARGIN) {
        x = MARGIN;
        this.y += 5;
      }
      this.font(9, true);
      this.doc.text(`${k}: `, x, this.y);
      this.font(9);
      this.doc.text(v, x + kw, this.y);
      x += kw + vw + 6;
    }
    this.y += 4;
    this.doc.setDrawColor(...BLUE);
    this.doc.setLineWidth(0.6);
    this.doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y);
    this.y += 6;
  }

  private heading(title: string, level: 2 | 3): void {
    if (level === 2) {
      this.font(12.5, true, BLUE);
      this.doc.text(title, MARGIN, this.y + 4.5);
      this.y += 6.5;
      this.doc.setDrawColor(...BLUE);
      this.doc.setLineWidth(0.3);
      this.doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y);
      this.y += 4;
    } else {
      this.font(11, true, BLUE);
      this.doc.text(title, MARGIN, this.y + 4);
      this.y += 6.5;
    }
  }

  summary(r: ReportModel): void {
    this.ensure(40);
    this.heading("Povzetek", 2);
    const labelStyle = { fontStyle: "bold" as const, fillColor: rgb("#f0f0f0") };
    const body: RowInput[] = r.summary.map((row) =>
      row.flatMap((item): CellDef[] => [
        { content: item.label, styles: labelStyle },
        { content: item.value, colSpan: item.wide ? 3 : 1 },
      ])
    );
    autoTable(this.doc, {
      startY: this.y,
      margin: { left: MARGIN, right: MARGIN },
      theme: "grid",
      body,
      styles: { font: FONT, fontSize: 8, cellPadding: 1.4, textColor: INK, lineColor: rgb("#d0d0d0"), lineWidth: 0.15 },
      columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 59 }, 2: { cellWidth: 34 }, 3: { cellWidth: 59 } },
    });
    this.y = this.lastTableY() + 6;
  }

  section(sec: Section): void {
    if (sec.notes !== undefined) {
      this.notesBlock(sec.title, sec.notes, 12);
      return;
    }

    // Heading, score, chart and legend stay together
    const chartH = sec.chart ? (sec.chart.height * CHART_MM) / sec.chart.width + 3 : 0;
    const legendH = sec.legend ? this.legendHeight(sec.legend) : 0;
    this.ensure((sec.level === 2 ? 10.5 : 6.5) + (sec.score ? 6 : 0) + chartH + legendH);
    if (sec.level === 3) this.y += 1;
    this.heading(sec.title, sec.level);

    if (sec.score) {
      this.font(10, true);
      this.doc.text(sec.score.strong, MARGIN, this.y + 3);
      const sw = this.doc.getTextWidth(sec.score.strong);
      this.font(10);
      this.doc.text(sec.score.rest, MARGIN + sw, this.y + 3);
      this.y += 6;
    }
    if (sec.chart) this.chart(sec.chart);
    if (sec.legend) this.legend(sec.legend);
    for (const t of sec.tables || []) this.table(t);
    this.y += sec.level === 2 ? 4 : 2;
  }

  private chart(chart: Chart): void {
    const k = CHART_MM / chart.width;
    const ox = MARGIN + (CONTENT_W - CHART_MM) / 2;
    const oy = this.y;
    const doc = this.doc;

    for (const p of chart.prims) {
      switch (p.kind) {
        case "poly": {
          doc.setFillColor(...rgb(p.fill));
          doc.setDrawColor(...rgb(p.stroke));
          doc.setLineWidth(p.width * k);
          const [x0, y0] = p.pts[0];
          const deltas = p.pts.slice(1).map(([x, y], i) => [(x - p.pts[i][0]) * k, (y - p.pts[i][1]) * k]);
          doc.lines(deltas, ox + x0 * k, oy + y0 * k, [1, 1], "FD", true);
          break;
        }
        case "rect": {
          doc.setDrawColor(...rgb(p.stroke));
          doc.setLineWidth(p.width * k);
          const style = p.fill ? "FD" : "S";
          if (p.fill) doc.setFillColor(...rgb(p.fill));
          if (p.rx) doc.roundedRect(ox + p.x * k, oy + p.y * k, p.w * k, p.h * k, p.rx * k, p.rx * k, style);
          else doc.rect(ox + p.x * k, oy + p.y * k, p.w * k, p.h * k, style);
          break;
        }
        case "line":
          doc.setDrawColor(...rgb(p.stroke));
          doc.setLineWidth(p.width * k);
          if (p.dash) doc.setLineDashPattern([0.6, 0.6], 0);
          doc.line(ox + p.x1 * k, oy + p.y1 * k, ox + p.x2 * k, oy + p.y2 * k);
          if (p.dash) doc.setLineDashPattern([], 0);
          break;
        case "text": {
          // Chart units → millimetres → points
          this.font((p.size * k) / PT, !!p.bold, rgb(p.color));
          const align = p.anchor === "middle" ? "center" : p.anchor === "end" ? "right" : "left";
          doc.text(p.str, ox + p.x * k, oy + p.y * k, { align });
          break;
        }
      }
    }
    this.y += chart.height * k + 3;
  }

  private legendLines(items: LegendItem[]): LegendItem[][] {
    this.font(7.5);
    const lines: LegendItem[][] = [[]];
    let width = 0;
    for (const it of items) {
      const iw = 4 + this.doc.getTextWidth(it.label) + 5;
      if (width + iw > CONTENT_W && lines[lines.length - 1].length) {
        lines.push([]);
        width = 0;
      }
      lines[lines.length - 1].push(it);
      width += iw;
    }
    return lines;
  }

  private legendHeight(items: LegendItem[]): number {
    return this.legendLines(items).length * 4.5 + 2;
  }

  private legend(items: LegendItem[]): void {
    for (const line of this.legendLines(items)) {
      this.font(7.5);
      const widths = line.map((it) => 4 + this.doc.getTextWidth(it.label));
      const total = widths.reduce((a, b) => a + b, 0) + 5 * (line.length - 1);
      let x = MARGIN + (CONTENT_W - total) / 2;
      line.forEach((it, i) => {
        this.doc.setFillColor(...rgb(it.color));
        this.doc.setDrawColor(...rgb(it.border || "#999999"));
        this.doc.setLineWidth(0.2);
        this.doc.rect(x, this.y - 2.4, 2.8, 2.8, "FD");
        this.font(7.5);
        this.doc.text(it.label, x + 4, this.y);
        x += widths[i] + 5;
      });
      this.y += 4.5;
    }
    this.y += 2;
  }

  private table(t: JawTable): void {
    const head: RowInput[] = [
      [
        {
          content: t.label,
          colSpan: t.teeth.length + 1,
          styles: { halign: "left", fillColor: rgb("#e8f4fd"), fontStyle: "bold", fontSize: 7.5 },
        },
      ],
      [{ content: "" }, ...t.teeth.map((n) => ({ content: String(n) }))],
    ];
    const body: RowInput[] = t.rows.map((row) => [
      { content: row.label },
      ...row.cells.map(
        (c): CellDef => ({
          content: c.text,
          styles: {
            fillColor: c.fill ? rgb(c.fill) : false,
            textColor: c.muted ? rgb("#a0a0a0") : c.color ? rgb(c.color) : INK,
            fontStyle: c.bold ? "bold" : "normal",
          },
        })
      ),
    ]);
    const toothW = (CONTENT_W - 22) / t.teeth.length;
    autoTable(this.doc, {
      startY: this.y,
      margin: { left: MARGIN, right: MARGIN, bottom: PAGE_H - BOTTOM },
      theme: "grid",
      pageBreak: "avoid",
      rowPageBreak: "avoid",
      head,
      body,
      styles: {
        font: FONT,
        fontSize: 6.5,
        cellPadding: 0.9,
        halign: "center",
        valign: "middle",
        textColor: INK,
        lineColor: rgb("#d0d0d0"),
        lineWidth: 0.15,
      },
      headStyles: { fillColor: rgb("#f0f0f0"), textColor: INK, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 22, halign: "left", fontStyle: "bold", fillColor: rgb("#f8f8f8") },
        ...Object.fromEntries(t.teeth.map((_, i) => [i + 1, { cellWidth: toothW }])),
      },
    });
    this.y = this.lastTableY() + 3;
  }

  /** A titled grey box of free text. Moves to a new page whole if it fits on one; flows otherwise. */
  private notesBlock(title: string, text: string, minTail: number): void {
    const doc = this.doc;
    this.font(9);
    const lineH = 9 * 1.35 * PT;
    const lines = doc.splitTextToSize(text, CONTENT_W - 6) as string[];
    const boxH = lines.length * lineH + 5;
    const usable = BOTTOM - MARGIN;

    this.ensure(Math.min(10.5 + boxH + minTail, usable));
    this.heading(title, 2);

    let i = 0;
    while (i < lines.length) {
      const room = Math.max(1, Math.floor((BOTTOM - this.y - 5) / lineH));
      const chunk = lines.slice(i, i + room);
      const h = chunk.length * lineH + 5;
      doc.setFillColor(...rgb("#fafafa"));
      doc.setDrawColor(...rgb("#e0e0e0"));
      doc.setLineWidth(0.2);
      doc.roundedRect(MARGIN, this.y, CONTENT_W, h, 1, 1, "FD");
      this.font(9);
      chunk.forEach((ln, j) => doc.text(ln, MARGIN + 3, this.y + 2.5 + lineH * (j + 0.8)));
      i += chunk.length;
      this.y += h;
      if (i < lines.length) {
        doc.addPage();
        this.y = MARGIN;
      }
    }
    this.y += 6;
  }

  closing(r: ReportModel): void {
    // Note, signatures and footer move to a new page together
    this.font(9);
    const noteLines = (this.doc.splitTextToSize(r.note, CONTENT_W - 6) as string[]).length;
    const noteH = 10.5 + noteLines * 9 * 1.35 * PT + 5 + 6;
    this.ensure(noteH + 32);
    this.notesBlock("Opomba", r.note, 32);

    this.y += 12;
    const colW = (CONTENT_W - 2 * 8) / 3;
    const labels = [`Ime in priimek: ${r.examiner}`, "Podpis izvajalca pregleda", "Datum"];
    labels.forEach((label, i) => {
      const x = MARGIN + i * (colW + 8);
      this.doc.setDrawColor(...rgb("#333333"));
      this.doc.setLineWidth(0.3);
      this.doc.line(x, this.y, x + colW, this.y);
      this.font(8, false, rgb("#555555"));
      this.doc.text(label, x + colW / 2, this.y + 4, { align: "center" });
    });
    this.y += 12;
    this.doc.setDrawColor(...rgb("#d0d0d0"));
    this.doc.setLineWidth(0.2);
    this.doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y);
    this.font(8, false, MUTED);
    this.doc.text(`Zobni status — UKC Shize 2025 · Ustvarjeno: ${r.generatedAt}`, PAGE_W - MARGIN, this.y + 4, {
      align: "right",
    });
  }

  pageNumbers(): void {
    const n = this.doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      this.doc.setPage(p);
      this.font(7.5, false, MUTED);
      this.doc.text(`${p} / ${n}`, PAGE_W / 2, PAGE_H - 8, { align: "center" });
    }
  }

  private lastTableY(): number {
    return (this.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  }
}
