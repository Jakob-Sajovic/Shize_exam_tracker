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

/**
 * What the report says, independent of how it is drawn. The on-screen HTML
 * view (html.ts) and the generated PDF (pdf.ts) both render this one model, so
 * the two cannot drift apart. Charts are reduced to drawing primitives in chart
 * units, which each renderer scales.
 */

export type Prim =
  | { kind: "poly"; pts: [number, number][]; fill: string; stroke: string; width: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; rx: number; fill: string; stroke: string; width: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number; dash?: boolean }
  | {
      kind: "text";
      x: number;
      y: number;
      str: string;
      size: number;
      color: string;
      bold?: boolean;
      anchor: "start" | "middle" | "end";
    };

export interface Chart {
  width: number;
  height: number;
  prims: Prim[];
}

export interface LegendItem {
  color: string;
  border?: string;
  label: string;
}

export interface TableCell {
  text: string;
  fill?: string;
  color?: string;
  bold?: boolean;
  muted?: boolean;
}

export interface JawTable {
  label: string;
  teeth: Fdi[];
  rows: { label: string; cells: TableCell[] }[];
}

export interface Section {
  title: string;
  level: 2 | 3;
  /** Score line: the bold lead ("13.9 %") and the rest of the sentence. */
  score?: { strong: string; rest: string };
  chart?: Chart;
  legend?: LegendItem[];
  tables?: JawTable[];
  notes?: string;
}

export interface SummaryItem {
  label: string;
  value: string;
  /** Spans the remaining columns of its row. */
  wide?: boolean;
}

export interface ReportModel {
  fileTitle: string;
  meta: [string, string][];
  summary: SummaryItem[][];
  sections: Section[];
  note: string;
  examiner: string;
  generatedAt: string;
}

export const COLORS = {
  blue: "#0078d4",
  plaque: "#ffd335",
  bleeding: "#d13438",
  present: "#eff6fc",
  missing: "#e8e8e8",
  sealed: "#dff6dd",
  sealedBorder: "#107c10",
};

export function reportFileTitle(s: StatusSession): string {
  return `ZobniStatus_${(s.subject.code || "pregled").replace(/[^\w\-.]+/g, "_")}_${s.subject.date || "brez-datuma"}`;
}

export function buildReportModel(s: StatusSession): ReportModel {
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
  const teethWord = (n: number) => plural(n, "zob", "zoba", "zobje", "zob");

  const sections: Section[] = [];

  sections.push({
    title: "Zobje",
    level: 2,
    score: {
      strong: String(sum.teethPresent),
      rest: ` ${plural(sum.teethPresent, "prisoten zob", "prisotna zoba", "prisotni zobje", "prisotnih zob")} od ${ALL_TEETH.length} · manjkajočih: ${missing.length}`,
    },
    chart: buildChart("whole", s),
    legend: [
      { color: COLORS.present, border: COLORS.blue, label: "prisoten" },
      { color: COLORS.missing, label: "manjka" },
    ],
  });

  for (const [kind, title, legend, color, percent, marked, total] of [
    ["plaque", "VPI — plak indeks", "Vidni plak", COLORS.plaque, sum.vpiPercent, sum.vpiMarked, sum.vpiTotal],
    ["bleeding", "GBI — indeks krvavitve", "Krvavitev ob sondiranju", COLORS.bleeding, sum.gbiPercent, sum.gbiMarked, sum.gbiTotal],
  ] as const) {
    const on = (t: Fdi, surf: FullSurface) => !!s[kind][t][surf as PbSurface];
    const cell = (t: Fdi, surf: FullSurface): TableCell =>
      on(t, surf) ? { text: "●", fill: color, bold: true, color: kind === "bleeding" ? "#ffffff" : undefined } : { text: "○" };
    sections.push({
      title,
      level: 2,
      score: {
        strong: `${percent.toFixed(1)} %`,
        rest: ` (${marked} od ${total} ${plural(total, "ploskve", "ploskev", "ploskev", "ploskev")})`,
      },
      chart: buildChart(4, s, (t, surf) => (on(t, surf) ? color : "")),
      legend: [{ color, label: legend }],
      tables: [
        jawTable("Zgornja čeljust", UPPER_ROW, s, PB_SURFACES, cell),
        jawTable("Spodnja čeljust", LOWER_ROW, s, PB_SURFACES, cell),
      ],
    });
  }

  const cariesCell = (t: Fdi, surf: FullSurface): TableCell => {
    const g = s.caries[t][surf];
    return g ? { text: String(g), fill: cariesColor(t, surf), bold: true, color: g >= 5 ? "#ffffff" : undefined } : { text: "" };
  };
  sections.push({
    title: "Karies",
    level: 2,
    score: {
      strong: String(sum.cariesSurfaces),
      rest: ` ${plural(sum.cariesSurfaces, "kariozna ploskev", "kariozni ploskvi", "kariozne ploskve", "karioznih ploskev")} na ${sum.cariesTeeth} ${plural(sum.cariesTeeth, "zobu", "zobeh", "zobeh", "zobeh")}`,
    },
    chart: buildChart(5, s, cariesColor, (t, surf) => (s.caries[t][surf] ? String(s.caries[t][surf]) : "")),
    legend: CARIES_GRADES.map((g) => ({ color: g.color, label: `${g.label} — ${g.description}` })),
    tables: [
      jawTable("Zgornja čeljust", UPPER_ROW, s, FULL_SURFACES, cariesCell),
      jawTable("Spodnja čeljust", LOWER_ROW, s, FULL_SURFACES, cariesCell),
    ],
  });

  const fillingCell = (t: Fdi, surf: FullSurface): TableCell => {
    const letter = fillingLetter(t, surf);
    return letter
      ? { text: letter, fill: fillingColor(t, surf), bold: true, color: letter === "A" ? "#ffffff" : undefined }
      : { text: "" };
  };
  sections.push({
    title: "Zalivke",
    level: 2,
    score: {
      strong: String(sum.fillingSurfaces),
      rest: ` ${plural(sum.fillingSurfaces, "ploskev z zalivko", "ploskvi z zalivko", "ploskve z zalivko", "ploskev z zalivko")} (kompozit ${sum.fillingComposite} · amalgam ${sum.fillingAmalgam})`,
    },
    chart: buildChart(5, s, fillingColor, fillingLetter),
    legend: FILLING_MATERIALS.map((m) => ({ color: m.color, label: `${m.label[0]} — ${m.label}` })),
    tables: [
      jawTable("Zgornja čeljust", UPPER_ROW, s, FULL_SURFACES, fillingCell),
      jawTable("Spodnja čeljust", LOWER_ROW, s, FULL_SURFACES, fillingCell),
    ],
  });

  sections.push({
    title: "Zalitje fisur",
    level: 3,
    score: {
      strong: String(sum.sealedTeeth),
      rest: ` ${teethWord(sum.sealedTeeth)} z zalitimi fisurami${sealed.length ? ` (${sealed.join(", ")})` : ""}`,
    },
    chart: buildChart("whole", s, undefined, undefined, (t) => !!s.sealants[t]),
    legend: [
      { color: COLORS.sealed, border: COLORS.sealedBorder, label: "zalito" },
      { color: "#ffffff", label: "ni zalito" },
      { color: COLORS.missing, label: "manjka" },
    ],
  });

  sections.push({ title: "Diagnostične opombe", level: 2, notes: (s.diagnosticNotes || "").trim() || "—" });

  return {
    fileTitle: reportFileTitle(s),
    meta: [
      ["Koda preiskovanca", sub.code || "—"],
      ["Datum pregleda", formatDate(sub.date)],
      ["Izvajalec", sub.examiner || "—"],
      ["ID pregleda", s.sessionId],
    ],
    summary: [
      [
        { label: "Prisotni zobje", value: `${sum.teethPresent} / ${ALL_TEETH.length}` },
        { label: "Manjkajoči zobje", value: missing.length ? missing.join(", ") : "—" },
      ],
      [
        { label: "VPI (plak)", value: `${sum.vpiPercent.toFixed(1)} % (${sum.vpiMarked} / ${sum.vpiTotal})` },
        { label: "GBI (krvavitev)", value: `${sum.gbiPercent.toFixed(1)} % (${sum.gbiMarked} / ${sum.gbiTotal})` },
      ],
      [
        { label: "Kariozne ploskve", value: `${sum.cariesSurfaces} (na ${sum.cariesTeeth} ${plural(sum.cariesTeeth, "zobu", "zobeh", "zobeh", "zobeh")})` },
        { label: "Ploskve z zalivko", value: `${sum.fillingSurfaces} (kompozit ${sum.fillingComposite} · amalgam ${sum.fillingAmalgam})` },
      ],
      [
        {
          label: "Zalitje fisur",
          value: sealed.length ? `${sealed.length} ${teethWord(sealed.length)}: ${sealed.join(", ")}` : "—",
          wide: true,
        },
      ],
    ],
    sections,
    note: sub.note.trim() || "—",
    examiner: sub.examiner,
    generatedAt: new Date().toLocaleString("sl-SI"),
  };
}

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : iso || "—";
}

/** Surfaces as rows, teeth as columns — 16 columns fit an A4 width, 32 rows would not. */
function jawTable<S extends FullSurface>(
  label: string,
  teeth: Fdi[],
  s: StatusSession,
  surfaces: S[],
  cell: (t: Fdi, surf: S) => TableCell
): JawTable {
  return {
    label,
    teeth,
    rows: surfaces.map((surf) => {
      const name = surfaceLabel(surf, teeth[0]);
      return {
        label: name[0].toUpperCase() + name.slice(1),
        cells: teeth.map((t) => (s.present[t] ? cell(t, surf) : { text: "—", muted: true })),
      };
    }),
  };
}

// ── Chart geometry ───────────────────────────────────────────────

const C = { cell: 26, gap: 2, midGap: 8, numH: 11, rowGap: 3, sideH: 12 };
const HALF_W = 8 * C.cell + 7 * C.gap;
export const CHART_W = HALF_W * 2 + C.midGap;
const CHART_H = C.numH + C.cell + C.rowGap + C.cell + C.numH + C.sideH;

function colX(i: number): number {
  return i < 8 ? i * (C.cell + C.gap) : HALF_W + C.midGap + (i - 8) * (C.cell + C.gap);
}

/**
 * Same layout as the on-screen chart: viewer-left is the subject's right, the
 * lower row mirrored under the upper, numbers outside the rows.
 */
function buildChart(
  mode: 4 | 5 | "whole",
  s: StatusSession,
  fillFor?: (t: Fdi, surf: FullSurface) => string,
  textFor?: (t: Fdi, surf: FullSurface) => string,
  marked?: (t: Fdi) => boolean
): Chart {
  const upperY = C.numH;
  const lowerY = upperY + C.cell + C.rowGap;
  const prims: Prim[] = [];
  const text = (x: number, y: number, str: string, size: number, color: string, bold = false, anchor: "start" | "middle" | "end" = "middle") =>
    prims.push({ kind: "text", x, y, str, size, color, bold, anchor });

  const midX = HALF_W + C.midGap / 2;
  prims.push({ kind: "line", x1: midX, y1: upperY, x2: midX, y2: lowerY + C.cell, stroke: "#bbbbbb", width: 0.5, dash: true });

  UPPER_ROW.forEach((t, i) => {
    const x = colX(i);
    text(x + C.cell / 2, C.numH - 3, String(t), 7, "#333333");
    tooth(prims, text, mode, s, t, x, upperY, fillFor, textFor, marked);
  });
  LOWER_ROW.forEach((t, i) => {
    const x = colX(i);
    tooth(prims, text, mode, s, t, x, lowerY, fillFor, textFor, marked);
    text(x + C.cell / 2, lowerY + C.cell + C.numH - 2, String(t), 7, "#333333");
  });

  text(0, CHART_H - 2, "preiskovančeva DESNA", 6, "#888888", false, "start");
  text(CHART_W, CHART_H - 2, "preiskovančeva LEVA", 6, "#888888", false, "end");
  return { width: CHART_W, height: CHART_H, prims };
}

function tooth(
  prims: Prim[],
  text: (x: number, y: number, str: string, size: number, color: string, bold?: boolean) => void,
  mode: 4 | 5 | "whole",
  s: StatusSession,
  t: Fdi,
  x: number,
  y: number,
  fillFor?: (t: Fdi, surf: FullSurface) => string,
  textFor?: (t: Fdi, surf: FullSurface) => string,
  marked?: (t: Fdi) => boolean
): void {
  const c = C.cell;
  if (!s.present[t]) {
    prims.push({ kind: "rect", x, y, w: c, h: c, rx: 0, fill: COLORS.missing, stroke: "#bbbbbb", width: 0.5 });
    prims.push({ kind: "line", x1: x + 4, y1: y + 4, x2: x + c - 4, y2: y + c - 4, stroke: "#aaaaaa", width: 0.8 });
    prims.push({ kind: "line", x1: x + c - 4, y1: y + 4, x2: x + 4, y2: y + c - 4, stroke: "#aaaaaa", width: 0.8 });
    return;
  }
  if (mode === "whole") {
    // Yes/no charts (sealants) draw marked green and unmarked plain; otherwise plain presence.
    const [fill, stroke, ink] = !marked
      ? [COLORS.present, COLORS.blue, COLORS.blue]
      : marked(t)
        ? [COLORS.sealed, COLORS.sealedBorder, "#0b5a0b"]
        : ["#ffffff", "#8a8886", "#605e5c"];
    prims.push({ kind: "rect", x, y, w: c, h: c, rx: 2, fill, stroke, width: 0.8 });
    text(x + c / 2, y + c / 2 + 2.5, String(t), 7, ink, true);
    return;
  }

  const h = c / 2;
  const m = Math.round(c * 0.28);
  const shapes: { pos: Pos5; pts: [number, number][]; tx: number; ty: number }[] =
    mode === 4
      ? [
          { pos: "top", pts: [[x, y], [x + c, y], [x + h, y + h]], tx: x + h, ty: y + 7.5 },
          { pos: "right", pts: [[x + c, y], [x + c, y + c], [x + h, y + h]], tx: x + c - 5, ty: y + h + 2.5 },
          { pos: "bottom", pts: [[x, y + c], [x + c, y + c], [x + h, y + h]], tx: x + h, ty: y + c - 3 },
          { pos: "left", pts: [[x, y], [x, y + c], [x + h, y + h]], tx: x + 5, ty: y + h + 2.5 },
        ]
      : [
          { pos: "top", pts: [[x, y], [x + c, y], [x + c - m, y + m], [x + m, y + m]], tx: x + h, ty: y + m - 1.5 },
          { pos: "right", pts: [[x + c - m, y + m], [x + c, y], [x + c, y + c], [x + c - m, y + c - m]], tx: x + c - m / 2, ty: y + h + 2.5 },
          { pos: "bottom", pts: [[x + m, y + c - m], [x + c - m, y + c - m], [x + c, y + c], [x, y + c]], tx: x + h, ty: y + c - 1.5 },
          { pos: "left", pts: [[x, y], [x + m, y + m], [x + m, y + c - m], [x, y + c]], tx: x + m / 2, ty: y + h + 2.5 },
          { pos: "center", pts: [[x + m, y + m], [x + c - m, y + m], [x + c - m, y + c - m], [x + m, y + c - m]], tx: x + h, ty: y + h + 2.5 },
        ];

  for (const sh of shapes) {
    const fill = fillFor?.(t, surfaceAt(t, sh.pos)) || "#ffffff";
    prims.push({ kind: "poly", pts: sh.pts, fill, stroke: "#999999", width: 0.5 });
  }
  if (textFor) {
    for (const sh of shapes) {
      const label = textFor(t, surfaceAt(t, sh.pos));
      if (label) text(sh.tx, sh.ty, label, 6.5, "#201f1e", true);
    }
  }
  prims.push({ kind: "rect", x, y, w: c, h: c, rx: 0, fill: "", stroke: "#666666", width: 0.6 });
}
