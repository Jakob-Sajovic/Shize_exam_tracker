import { StatusSession, LocalSessionInfo } from "../model/types";
import { STORE_SESSIONS, idbPut, idbGet, idbGetAll, idbDelete } from "./idb";
import { buildWorkbook, readWorkbook, workbookFileName, downloadWorkbook } from "./workbook";
import { plural } from "../model/plural";

/** What actually sits in IndexedDB: the session plus local bookkeeping. */
interface StoredSession {
  sessionId: string;
  session: StatusSession;
  modifiedAt: string;
  /** The session's own modifiedAt at export time, to detect edits since. */
  exportedSessionModifiedAt: string | null;
  exportedAt: string | null;
}

function describe(s: StatusSession): { title: string; subtitle: string } {
  const parts: string[] = [];
  if (s.subject.date) parts.push(s.subject.date);
  if (s.subject.examiner) parts.push(s.subject.examiner);
  return {
    title: s.subject.code || "Neimenovan pregled",
    subtitle: parts.join(" · ") || "brez datuma",
  };
}

/**
 * Local-first storage: an exam lives in IndexedDB and only becomes a file when
 * the examiner exports it, so the landing list has to make un-exported work
 * impossible to miss.
 */
export class Store {
  async list(): Promise<LocalSessionInfo[]> {
    const all = await idbGetAll<StoredSession>(STORE_SESSIONS);
    return all
      .filter((r) => r && r.session)
      .map((r) => ({
        sessionId: r.sessionId,
        ...describe(r.session),
        modifiedAt: r.modifiedAt || r.session.modifiedAt,
        exported: !!r.exportedAt,
      }))
      .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
  }

  async open(sessionId: string): Promise<StatusSession | null> {
    const row = await idbGet<StoredSession>(STORE_SESSIONS, sessionId);
    return row?.session || null;
  }

  async remove(sessionId: string): Promise<void> {
    await idbDelete(STORE_SESSIONS, sessionId);
  }

  async autosave(session: StatusSession): Promise<void> {
    const existing = await idbGet<StoredSession>(STORE_SESSIONS, session.sessionId);
    // The exported file goes stale the moment the session changes after it —
    // but an autosave carrying no change must not clear the flag.
    const stillExported =
      !!existing?.exportedAt && existing.exportedSessionModifiedAt === session.modifiedAt;

    await idbPut<StoredSession>(STORE_SESSIONS, {
      sessionId: session.sessionId,
      session,
      modifiedAt: new Date().toISOString(),
      exportedSessionModifiedAt: stillExported ? existing.exportedSessionModifiedAt : null,
      exportedAt: stillExported ? existing.exportedAt : null,
    });
  }

  private async markExported(sessionId: string): Promise<void> {
    const row = await idbGet<StoredSession>(STORE_SESSIONS, sessionId);
    if (!row) return;
    await idbPut<StoredSession>(STORE_SESSIONS, {
      ...row,
      exportedAt: new Date().toISOString(),
      exportedSessionModifiedAt: row.session.modifiedAt,
    });
  }

  async save(session: StatusSession): Promise<string> {
    await this.autosave(session);
    downloadWorkbook(buildWorkbook([session]), workbookFileName(session));
    await this.markExported(session.sessionId);
    return "Pregled shranjen v napravo in izvožen v .xlsx.";
  }

  async exportAll(): Promise<string> {
    const all = await idbGetAll<StoredSession>(STORE_SESSIONS);
    const sessions = all.filter((r) => r && r.session).map((r) => r.session);
    if (sessions.length === 0) throw new Error("Ni shranjenih pregledov za izvoz.");

    sessions.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    downloadWorkbook(
      buildWorkbook(sessions),
      `ZobniStatus_vsi_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    for (const s of sessions) await this.markExported(s.sessionId);
    const n = sessions.length;
    return (
      plural(n, "Izvožen", "Izvožena", "Izvoženi", "Izvoženih") +
      ` ${n} ` +
      plural(n, "pregled", "pregleda", "pregledi", "pregledov") +
      " v eno datoteko."
    );
  }

  async loadFromFile(file: File): Promise<StatusSession | null> {
    const session = await readWorkbook(file);
    if (session) await this.autosave(session);
    return session;
  }
}
