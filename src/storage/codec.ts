import { StatusSession, CariesGrade, FillingMaterial } from "../model/types";
import { ALL_TEETH, PB_SURFACES, FULL_SURFACES, SURFACE_KEY } from "../model/constants";
import { summarize, normalizeSession } from "../model/session";

export const SHEET_NAME = "ZobniStatus";

/**
 * Session <-> one spreadsheet row. Pure on purpose: the column list and the
 * row builder must stay in lockstep, and the only way to guarantee that is to
 * generate both from the same loop.
 *
 * Layout: metadata, then per tooth — presence, VPI (4), GBI (4), caries (5),
 * fillings (5), fissure sealant — then a JSON backup column that makes re-import lossless even
 * if the flat columns fall behind the model.
 */

const META_HEADERS = [
  "session_id",
  "koda",
  "datum",
  "izvajalec",
  "opomba",
  "ustvarjeno",
  "spremenjeno",
  "st_prisotnih_zob",
  "vpi_ploskev",
  "vpi_odstotek",
  "gbi_ploskev",
  "gbi_odstotek",
  "karies_ploskev",
  "karies_zob",
  "zalivke_ploskev",
  "zalivke_kompozit",
  "zalivke_amalgam",
  "zalitje_fisur_zob",
];

export function getColumnHeaders(): string[] {
  const headers = [...META_HEADERS];
  for (const t of ALL_TEETH) {
    headers.push(`t${t}_prisoten`);
    for (const s of PB_SURFACES) headers.push(`t${t}_vpi_${SURFACE_KEY[s]}`);
    for (const s of PB_SURFACES) headers.push(`t${t}_gbi_${SURFACE_KEY[s]}`);
    for (const s of FULL_SURFACES) headers.push(`t${t}_kar_${SURFACE_KEY[s]}`);
    for (const s of FULL_SURFACES) headers.push(`t${t}_zal_${SURFACE_KEY[s]}`);
    headers.push(`t${t}_zalitje_fisur`);
  }
  headers.push("_json");
  return headers;
}

export function sessionToRow(s: StatusSession): (string | number)[] {
  const sum = summarize(s);
  const row: (string | number)[] = [
    s.sessionId,
    s.subject.code,
    s.subject.date,
    s.subject.examiner,
    s.subject.note,
    s.createdAt,
    s.modifiedAt,
    sum.teethPresent,
    sum.vpiMarked,
    round1(sum.vpiPercent),
    sum.gbiMarked,
    round1(sum.gbiPercent),
    sum.cariesSurfaces,
    sum.cariesTeeth,
    sum.fillingSurfaces,
    sum.fillingComposite,
    sum.fillingAmalgam,
    sum.sealedTeeth,
  ];

  for (const t of ALL_TEETH) {
    row.push(s.present[t] ? 1 : 0);
    for (const surf of PB_SURFACES) row.push(s.plaque[t][surf] ? 1 : 0);
    for (const surf of PB_SURFACES) row.push(s.bleeding[t][surf] ? 1 : 0);
    for (const surf of FULL_SURFACES) row.push(s.caries[t][surf]);
    for (const surf of FULL_SURFACES) row.push(s.fillings[t][surf]);
    row.push(s.sealants[t] ? 1 : 0);
  }

  row.push(JSON.stringify(s));
  return row;
}

export function rowToSession(headers: string[], row: (string | number)[]): StatusSession | null {
  const at = (name: string): string | number | undefined => {
    const i = headers.indexOf(name);
    return i < 0 ? undefined : row[i];
  };

  // The JSON column is authoritative when present — it survives column drift.
  const json = at("_json");
  if (typeof json === "string" && json.length > 2) {
    try {
      return normalizeSession(JSON.parse(json));
    } catch {
      /* fall through to the flat columns */
    }
  }

  const id = at("session_id");
  if (id === undefined || id === "") return null;

  const s = normalizeSession({
    sessionId: String(id),
    createdAt: String(at("ustvarjeno") || new Date().toISOString()),
    modifiedAt: String(at("spremenjeno") || new Date().toISOString()),
    subject: {
      code: String(at("koda") || ""),
      date: String(at("datum") || ""),
      examiner: String(at("izvajalec") || ""),
      note: String(at("opomba") || ""),
    },
  });

  for (const t of ALL_TEETH) {
    s.present[t] = num(at(`t${t}_prisoten`)) !== 0;
    for (const surf of PB_SURFACES) s.plaque[t][surf] = num(at(`t${t}_vpi_${SURFACE_KEY[surf]}`)) === 1;
    for (const surf of PB_SURFACES) s.bleeding[t][surf] = num(at(`t${t}_gbi_${SURFACE_KEY[surf]}`)) === 1;
    for (const surf of FULL_SURFACES) {
      const g = num(at(`t${t}_kar_${SURFACE_KEY[surf]}`));
      s.caries[t][surf] = (g >= 0 && g <= 6 ? g : 0) as CariesGrade;
      const m = String(at(`t${t}_zal_${SURFACE_KEY[surf]}`) || "");
      s.fillings[t][surf] = (m === "kompozit" || m === "amalgam" ? m : "") as FillingMaterial;
    }
    s.sealants[t] = num(at(`t${t}_zalitje_fisur`)) === 1;
  }
  return s;
}

function num(v: string | number | undefined): number {
  if (v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
