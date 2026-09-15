import { Fdi, PbSurface, FullSurface } from "../model/types";
import { UPPER_ROW, LOWER_ROW, isUpper } from "../model/constants";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Where a surface sits in the drawing, independent of anatomy. */
export type Pos4 = "top" | "bottom" | "left" | "right";
export type Pos5 = Pos4 | "center";

/**
 * Screen position → anatomical surface.
 *
 * Chart layout (viewer-left is the subject's right):
 *   upper row: 18→11 | 21→28
 *   lower row: 48→41 | 31→38
 *
 * Vestibular is drawn away from the midline of the chart: at the top for the
 * upper jaw, at the bottom for the lower, which is how the arches face each
 * other on paper. Mesial always points toward the middle of the row.
 */
export function surfaceAt(tooth: Fdi, pos: Pos5): FullSurface {
  if (pos === "center") return "occlusal";

  const quadrant = Math.floor(tooth / 10);
  switch (pos) {
    case "top":
      return quadrant <= 2 ? "buccal" : "oral";
    case "bottom":
      return quadrant <= 2 ? "oral" : "buccal";
    case "left":
      // Quadrants 1 and 4 sit on the viewer's left half of each row.
      return quadrant === 1 || quadrant === 4 ? "distal" : "mesial";
    case "right":
      return quadrant === 1 || quadrant === 4 ? "mesial" : "distal";
  }
}

/** The 4-surface chart never touches the occlusal surface. */
export function pbSurfaceAt(tooth: Fdi, pos: Pos4): PbSurface {
  return surfaceAt(tooth, pos) as PbSurface;
}

/** X-divided square: four triangles meeting in the middle. */
function buildSvg4(tooth: Fdi, size: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("class", "tooth-svg");

  const h = size / 2;
  const shapes: { pos: Pos4; points: string }[] = [
    { pos: "top", points: `0,0 ${size},0 ${h},${h}` },
    { pos: "right", points: `${size},0 ${size},${size} ${h},${h}` },
    { pos: "bottom", points: `0,${size} ${size},${size} ${h},${h}` },
    { pos: "left", points: `0,0 0,${size} ${h},${h}` },
  ];
  for (const s of shapes) addPoly(svg, s.pos, s.points, tooth);

  addLine(svg, 0, 0, size, size);
  addLine(svg, size, 0, 0, size);
  addBorder(svg, size);
  return svg;
}

/** Cross-divided square: four trapezoids around a central occlusal box. */
function buildSvg5(tooth: Fdi, size: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("class", "tooth-svg");

  const s = size;
  const m = Math.round(size * 0.28);
  const shapes: { pos: Pos5; points: string }[] = [
    { pos: "top", points: `0,0 ${s},0 ${s - m},${m} ${m},${m}` },
    { pos: "right", points: `${s - m},${m} ${s},0 ${s},${s} ${s - m},${s - m}` },
    { pos: "bottom", points: `${m},${s - m} ${s - m},${s - m} ${s},${s} 0,${s}` },
    { pos: "left", points: `0,0 ${m},${m} ${m},${s - m} 0,${s}` },
    { pos: "center", points: `${m},${m} ${s - m},${m} ${s - m},${s - m} ${m},${s - m}` },
  ];
  for (const shape of shapes) addPoly(svg, shape.pos, shape.points, tooth);

  addLine(svg, 0, 0, m, m);
  addLine(svg, s, 0, s - m, m);
  addLine(svg, s, s, s - m, s - m);
  addLine(svg, 0, s, m, s - m);
  addBorder(svg, size);
  return svg;
}

function addPoly(svg: SVGSVGElement, pos: Pos5, points: string, tooth: Fdi): void {
  const poly = document.createElementNS(SVG_NS, "polygon");
  poly.setAttribute("points", points);
  poly.setAttribute("class", "tooth-surface");
  poly.dataset.pos = pos;
  poly.dataset.tooth = String(tooth);
  svg.appendChild(poly);
}

function addLine(svg: SVGSVGElement, x1: number, y1: number, x2: number, y2: number): void {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("class", "tooth-divider");
  svg.appendChild(line);
}

function addBorder(svg: SVGSVGElement, size: number): void {
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", "0.5");
  rect.setAttribute("y", "0.5");
  rect.setAttribute("width", String(size - 1));
  rect.setAttribute("height", String(size - 1));
  rect.setAttribute("class", "tooth-border");
  svg.appendChild(rect);
}

export interface ChartOptions {
  /** 4 = plaque/bleeding, 5 = caries/fillings, "whole" = one box per tooth. */
  mode: 4 | 5 | "whole";
  isMissing(tooth: Fdi): boolean;
  /** Inline fill for a surface, or "" to leave it blank. */
  fillFor?(tooth: Fdi, surface: FullSurface): string;
  /** Text drawn in the middle of a surface (a caries grade, say). */
  textFor?(tooth: Fdi, surface: FullSurface): string;
  onSurface?(tooth: Fdi, surface: FullSurface): void;
  onTooth?(tooth: Fdi): void;
  /** Tooltip for a whole tooth box. */
  toothTitle?(tooth: Fdi): string;
  /** Yes/no picker on the whole-tooth chart: present teeth are drawn marked or
   *  unmarked instead of the plain "present" style. */
  isMarked?(tooth: Fdi): boolean;
}

/**
 * Builds both jaws. Re-rendering is a full rebuild: at 32 teeth it is cheap,
 * and it keeps the DOM a pure function of the session rather than something
 * that can drift out of sync with it.
 */
export function buildChart(opts: ChartOptions): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "chart";

  wrap.appendChild(jawLabel("zgornja čeljust"));
  wrap.appendChild(numberRow(UPPER_ROW));
  wrap.appendChild(toothRow(UPPER_ROW, opts));
  wrap.appendChild(toothRow(LOWER_ROW, opts));
  wrap.appendChild(numberRow(LOWER_ROW));
  wrap.appendChild(jawLabel("spodnja čeljust"));

  const hints = document.createElement("div");
  hints.className = "chart-sides";
  hints.innerHTML = `<span>preiskovančeva DESNA</span><span>preiskovančeva LEVA</span>`;
  wrap.appendChild(hints);

  return wrap;
}

function jawLabel(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "chart-jaw-label";
  el.textContent = text;
  return el;
}

function numberRow(teeth: Fdi[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "chart-row chart-numbers";
  for (const t of teeth) {
    const cell = document.createElement("div");
    cell.className = "tooth-number";
    cell.textContent = String(t);
    row.appendChild(cell);
  }
  return row;
}

function toothRow(teeth: Fdi[], opts: ChartOptions): HTMLElement {
  const row = document.createElement("div");
  row.className = "chart-row";

  for (const tooth of teeth) {
    const cell = document.createElement("div");
    cell.className = "tooth-cell";
    const missing = opts.isMissing(tooth);
    if (missing) cell.classList.add("missing");

    if (opts.mode === "whole") {
      const box = document.createElement("button");
      box.type = "button";
      const state = missing ? "absent" : opts.isMarked ? (opts.isMarked(tooth) ? "marked" : "unmarked") : "present";
      box.className = `tooth-box ${state}`;
      box.textContent = missing ? "✕" : String(tooth);
      if (opts.toothTitle) box.title = opts.toothTitle(tooth);
      box.addEventListener("click", () => opts.onTooth?.(tooth));
      cell.appendChild(box);
      row.appendChild(cell);
      continue;
    }

    const svg = opts.mode === 4 ? buildSvg4(tooth, 40) : buildSvg5(tooth, 40);

    svg.querySelectorAll<SVGPolygonElement>("polygon").forEach((poly) => {
      const pos = poly.dataset.pos as Pos5;
      const surface = surfaceAt(tooth, pos);
      const fill = opts.fillFor?.(tooth, surface) || "";
      if (fill) poly.style.fill = fill;
      poly.setAttribute("data-surface", surface);

      if (missing) return;
      poly.addEventListener("click", (ev) => {
        ev.stopPropagation();
        opts.onSurface?.(tooth, surface);
      });
    });

    if (opts.textFor) {
      const positions: Pos5[] =
        opts.mode === 5 ? ["top", "right", "bottom", "left", "center"] : ["top", "right", "bottom", "left"];
      for (const pos of positions) {
        const surface = surfaceAt(tooth, pos);
        const text = opts.textFor(tooth, surface);
        if (!text) continue;
        const label = document.createElementNS(SVG_NS, "text");
        const p = textAnchor(pos, 40, opts.mode === 5);
        label.setAttribute("x", String(p.x));
        label.setAttribute("y", String(p.y));
        label.setAttribute("class", "tooth-surface-text");
        label.textContent = text;
        svg.appendChild(label);
      }
    }

    cell.appendChild(svg);
    row.appendChild(cell);
  }

  return row;
}

/** Where the digit sits inside each surface. */
function textAnchor(pos: Pos5, size: number, cross: boolean): { x: number; y: number } {
  const h = size / 2;
  const off = cross ? size * 0.14 : size * 0.17;
  switch (pos) {
    case "top":
      return { x: h, y: off + 4 };
    case "bottom":
      return { x: h, y: size - off + 3 };
    case "left":
      return { x: off, y: h + 3 };
    case "right":
      return { x: size - off, y: h + 3 };
    case "center":
      return { x: h, y: h + 3 };
  }
}

export { isUpper };
