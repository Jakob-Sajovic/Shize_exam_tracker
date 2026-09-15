import {
  Fdi,
  StatusSession,
  PbToothData,
  CariesToothData,
  FillingToothData,
  CariesGrade,
  FillingMaterial,
  PbSurface,
  FullSurface,
} from "./types";
import { ALL_TEETH, PB_SURFACES, FULL_SURFACES } from "./constants";

function makePb(): PbToothData {
  return { mesial: false, distal: false, buccal: false, oral: false };
}

function makeCaries(): CariesToothData {
  return { mesial: 0, distal: 0, buccal: 0, oral: 0, occlusal: 0 };
}

function makeFillings(): FillingToothData {
  return { mesial: "", distal: "", buccal: "", oral: "", occlusal: "" };
}

export function makeEmptySession(): StatusSession {
  const now = new Date().toISOString();
  const present: Record<Fdi, boolean> = {};
  const plaque: Record<Fdi, PbToothData> = {};
  const bleeding: Record<Fdi, PbToothData> = {};
  const caries: Record<Fdi, CariesToothData> = {};
  const fillings: Record<Fdi, FillingToothData> = {};
  const sealants: Record<Fdi, boolean> = {};

  for (const t of ALL_TEETH) {
    present[t] = true;
    plaque[t] = makePb();
    bleeding[t] = makePb();
    caries[t] = makeCaries();
    fillings[t] = makeFillings();
    sealants[t] = false;
  }

  return {
    sessionId: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    createdAt: now,
    modifiedAt: now,
    subject: { code: "", date: new Date().toISOString().slice(0, 10), examiner: "", note: "" },
    present,
    plaque,
    bleeding,
    caries,
    fillings,
    sealants,
  };
}

/** Fills in anything a stored or imported session is missing, so an older file
 *  still opens after the model grows. */
export function normalizeSession(raw: Partial<StatusSession>): StatusSession {
  const base = makeEmptySession();
  const s: StatusSession = {
    ...base,
    ...raw,
    subject: { ...base.subject, ...(raw.subject || {}) },
    present: { ...base.present, ...(raw.present || {}) },
    plaque: { ...base.plaque },
    bleeding: { ...base.bleeding },
    caries: { ...base.caries },
    fillings: { ...base.fillings },
    sealants: { ...base.sealants, ...(raw.sealants || {}) },
  };
  for (const t of ALL_TEETH) {
    if (raw.plaque?.[t]) s.plaque[t] = { ...base.plaque[t], ...raw.plaque[t] };
    if (raw.bleeding?.[t]) s.bleeding[t] = { ...base.bleeding[t], ...raw.bleeding[t] };
    if (raw.caries?.[t]) s.caries[t] = { ...base.caries[t], ...raw.caries[t] };
    if (raw.fillings?.[t]) s.fillings[t] = { ...base.fillings[t], ...raw.fillings[t] };
  }
  return s;
}

export interface Summary {
  teethPresent: number;
  vpiMarked: number;
  vpiTotal: number;
  vpiPercent: number;
  gbiMarked: number;
  gbiTotal: number;
  gbiPercent: number;
  cariesSurfaces: number;
  cariesTeeth: number;
  fillingSurfaces: number;
  fillingComposite: number;
  fillingAmalgam: number;
  sealedTeeth: number;
}

/** Every index counts present teeth only — an extracted tooth has no surfaces
 *  to score, and including it would silently deflate the percentages. */
export function summarize(s: StatusSession): Summary {
  let teethPresent = 0;
  let vpiMarked = 0;
  let gbiMarked = 0;
  let cariesSurfaces = 0;
  let cariesTeeth = 0;
  let fillingSurfaces = 0;
  let fillingComposite = 0;
  let fillingAmalgam = 0;
  let sealedTeeth = 0;

  for (const t of ALL_TEETH) {
    if (!s.present[t]) continue;
    teethPresent++;
    if (s.sealants[t]) sealedTeeth++;

    for (const surf of PB_SURFACES) {
      if (s.plaque[t][surf]) vpiMarked++;
      if (s.bleeding[t][surf]) gbiMarked++;
    }

    let toothHasCaries = false;
    for (const surf of FULL_SURFACES) {
      if (s.caries[t][surf] > 0) {
        cariesSurfaces++;
        toothHasCaries = true;
      }
      const mat = s.fillings[t][surf];
      if (mat) {
        fillingSurfaces++;
        if (mat === "kompozit") fillingComposite++;
        else fillingAmalgam++;
      }
    }
    if (toothHasCaries) cariesTeeth++;
  }

  const vpiTotal = teethPresent * PB_SURFACES.length;
  const gbiTotal = vpiTotal;

  return {
    teethPresent,
    vpiMarked,
    vpiTotal,
    vpiPercent: vpiTotal ? (vpiMarked / vpiTotal) * 100 : 0,
    gbiMarked,
    gbiTotal,
    gbiPercent: gbiTotal ? (gbiMarked / gbiTotal) * 100 : 0,
    cariesSurfaces,
    cariesTeeth,
    fillingSurfaces,
    fillingComposite,
    fillingAmalgam,
    sealedTeeth,
  };
}

type Listener = () => void;

/**
 * The single in-memory session. Tabs read and write it through here so that a
 * change made on one chart is visible on every other, and one autosave hook
 * covers the whole app.
 */
export class SessionState {
  private static instance: SessionState | null = null;
  private session: StatusSession | null = null;
  private listeners: Listener[] = [];

  static getInstance(): SessionState {
    if (!SessionState.instance) SessionState.instance = new SessionState();
    return SessionState.instance;
  }

  hasSession(): boolean {
    return this.session !== null;
  }

  get(): StatusSession {
    if (!this.session) throw new Error("Ni aktivnega pregleda.");
    return this.session;
  }

  onChange(fn: Listener): void {
    this.listeners.push(fn);
  }

  private touch(): void {
    if (this.session) this.session.modifiedAt = new Date().toISOString();
    this.listeners.forEach((fn) => fn());
  }

  newSession(): StatusSession {
    this.session = makeEmptySession();
    this.touch();
    return this.session;
  }

  load(session: StatusSession): void {
    this.session = normalizeSession(session);
    this.touch();
  }

  close(): void {
    this.session = null;
    this.listeners.forEach((fn) => fn());
  }

  setSubjectField<K extends keyof StatusSession["subject"]>(key: K, value: string): void {
    this.get().subject[key] = value;
    this.touch();
  }

  isPresent(tooth: Fdi): boolean {
    return !!this.get().present[tooth];
  }

  /** Marking a tooth absent clears everything recorded on it — leaving stale
   *  surface data on a missing tooth is how indices end up wrong later. */
  setPresent(tooth: Fdi, present: boolean): void {
    const s = this.get();
    s.present[tooth] = present;
    if (!present) {
      s.plaque[tooth] = makePb();
      s.bleeding[tooth] = makePb();
      s.caries[tooth] = makeCaries();
      s.fillings[tooth] = makeFillings();
      s.sealants[tooth] = false;
    }
    this.touch();
  }

  togglePb(kind: "plaque" | "bleeding", tooth: Fdi, surface: PbSurface): void {
    const s = this.get();
    if (!s.present[tooth]) return;
    s[kind][tooth][surface] = !s[kind][tooth][surface];
    this.touch();
  }

  setCaries(tooth: Fdi, surface: FullSurface, grade: CariesGrade): void {
    const s = this.get();
    if (!s.present[tooth]) return;
    s.caries[tooth][surface] = grade;
    this.touch();
  }

  setFilling(tooth: Fdi, surface: FullSurface, material: FillingMaterial): void {
    const s = this.get();
    if (!s.present[tooth]) return;
    s.fillings[tooth][surface] = material;
    this.touch();
  }

  toggleSealant(tooth: Fdi): void {
    const s = this.get();
    if (!s.present[tooth]) return;
    s.sealants[tooth] = !s.sealants[tooth];
    this.touch();
  }

  resetSection(section: "present" | "plaque" | "bleeding" | "caries" | "fillings" | "sealants"): void {
    const s = this.get();
    for (const t of ALL_TEETH) {
      if (section === "present") s.present[t] = true;
      else if (section === "plaque") s.plaque[t] = makePb();
      else if (section === "bleeding") s.bleeding[t] = makePb();
      else if (section === "caries") s.caries[t] = makeCaries();
      else if (section === "sealants") s.sealants[t] = false;
      else s.fillings[t] = makeFillings();
    }
    this.touch();
  }
}
