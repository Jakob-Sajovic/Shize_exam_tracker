/** FDI tooth number, permanent dentition: 18–11, 21–28, 38–31, 41–48. */
export type Fdi = number;

/** The four surfaces scored for plaque and bleeding. */
export type PbSurface = "mesial" | "distal" | "buccal" | "oral";

/** Caries and fillings add the occlusal/incisal surface. */
export type FullSurface = PbSurface | "occlusal";

/** 0 = no caries recorded; 1–6 follow the ICDAS-style severity scale. */
export type CariesGrade = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** "" = no filling on this surface. */
export type FillingMaterial = "" | "kompozit" | "amalgam";

export type PbToothData = Record<PbSurface, boolean>;
export type CariesToothData = Record<FullSurface, CariesGrade>;
export type FillingToothData = Record<FullSurface, FillingMaterial>;

export interface SubjectData {
  /** Anonymised study code — the only mandatory field. */
  code: string;
  date: string;
  examiner: string;
  note: string;
}

export interface StatusSession {
  sessionId: string;
  createdAt: string;
  modifiedAt: string;
  subject: SubjectData;
  /** Tooth present in the mouth. Absent teeth are excluded from every index. */
  present: Record<Fdi, boolean>;
  plaque: Record<Fdi, PbToothData>;
  bleeding: Record<Fdi, PbToothData>;
  caries: Record<Fdi, CariesToothData>;
  fillings: Record<Fdi, FillingToothData>;
  /** Fissure sealant present on the tooth (zalitje fisur) — whole tooth, yes/no. */
  sealants: Record<Fdi, boolean>;
}

/** What the landing list shows about a locally stored session. */
export interface LocalSessionInfo {
  sessionId: string;
  title: string;
  subtitle: string;
  modifiedAt: string;
  exported: boolean;
}
