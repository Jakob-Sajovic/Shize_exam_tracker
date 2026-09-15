import { Fdi, PbSurface, FullSurface, CariesGrade, FillingMaterial } from "./types";

export const UPPER_RIGHT: Fdi[] = [18, 17, 16, 15, 14, 13, 12, 11];
export const UPPER_LEFT: Fdi[] = [21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_RIGHT: Fdi[] = [48, 47, 46, 45, 44, 43, 42, 41];
export const LOWER_LEFT: Fdi[] = [31, 32, 33, 34, 35, 36, 37, 38];

/** Display order, left to right on screen. Viewer-left is the subject's right,
 *  and the lower row is mirrored so each column is the same side in both jaws. */
export const UPPER_ROW: Fdi[] = [...UPPER_RIGHT, ...UPPER_LEFT];
export const LOWER_ROW: Fdi[] = [...LOWER_RIGHT, ...LOWER_LEFT];

/** Storage order — stable, and what the .xlsx columns follow. */
export const ALL_TEETH: Fdi[] = [...UPPER_ROW, ...LOWER_ROW];

export const PB_SURFACES: PbSurface[] = ["mesial", "distal", "buccal", "oral"];
export const FULL_SURFACES: FullSurface[] = ["mesial", "distal", "buccal", "oral", "occlusal"];

/** Short keys used in the exported column names. */
export const SURFACE_KEY: Record<FullSurface, string> = {
  mesial: "m",
  distal: "d",
  buccal: "b",
  oral: "p",
  occlusal: "o",
};

export function surfaceLabel(surface: FullSurface, tooth: Fdi): string {
  if (surface === "oral") {
    // The oral surface is palatal in the upper jaw and lingual in the lower.
    return isUpper(tooth) ? "palatinalno" : "lingvalno";
  }
  return { mesial: "mezialno", distal: "distalno", buccal: "bukalno", occlusal: "okluzalno" }[
    surface as Exclude<FullSurface, "oral">
  ];
}

export function isUpper(tooth: Fdi): boolean {
  return tooth < 30;
}

export interface CariesGradeDef {
  value: CariesGrade;
  label: string;
  description: string;
  color: string;
}

/** Severity scale 1–6; 0 means "nothing recorded" and is not a button. */
export const CARIES_GRADES: CariesGradeDef[] = [
  { value: 1, label: "1", description: "Prva vidna sprememba sklenine", color: "#fde7cf" },
  { value: 2, label: "2", description: "Izrazita sprememba sklenine", color: "#fbcf9b" },
  { value: 3, label: "3", description: "Lokalna prekinitev sklenine", color: "#f4a259" },
  { value: 4, label: "4", description: "Senca dentina", color: "#e07b39" },
  { value: 5, label: "5", description: "Vidna kavitacija z dentinom", color: "#c04a1e" },
  { value: 6, label: "6", description: "Obsežna kavitacija", color: "#8c2f13" },
];

export interface FillingMaterialDef {
  value: FillingMaterial;
  label: string;
  color: string;
}

export const FILLING_MATERIALS: FillingMaterialDef[] = [
  { value: "kompozit", label: "Kompozit", color: "#b9d9f2" },
  { value: "amalgam", label: "Amalgam", color: "#8a8886" },
];

export interface TabDef {
  id: string;
  label: string;
  icon: string;
}

export const TABS: TabDef[] = [
  { id: "landing", label: "Začetek", icon: "🏠" },
  { id: "subject", label: "Preiskovanec", icon: "👤" },
  { id: "teeth", label: "Zobje", icon: "🦷" },
  { id: "plaque", label: "VPI", icon: "🟡" },
  { id: "bleeding", label: "GBI", icon: "🔴" },
  { id: "caries", label: "Karies", icon: "🔍" },
  { id: "fillings", label: "Zalivke", icon: "⬜" },
  { id: "export", label: "Izvoz", icon: "💾" },
];
