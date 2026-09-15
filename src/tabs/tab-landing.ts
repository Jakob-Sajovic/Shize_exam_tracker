import { TabController, TabManager } from "../app/tab-manager";
import { SessionState } from "../model/session";
import { Store } from "../storage/store";
import { LocalSessionInfo } from "../model/types";
import { requestPersistence, storageEstimate } from "../storage/idb";
import { plural } from "../model/plural";

function esc(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export class LandingTab implements TabController {
  private panel: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private tabManager: TabManager | null = null;
  private confirmingDelete: string | null = null;
  /** Guards against out-of-order refreshes: a slow earlier read must not
   *  overwrite a faster later one. */
  private refreshToken = 0;

  constructor(private session: SessionState, private store: Store) {}

  setTabManager(tm: TabManager): void {
    this.tabManager = tm;
  }

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="landing">
        <h1 class="landing-title">Zobni status</h1>
        <p class="landing-sub">UKC Shize 2025 — vnos podatkov</p>

        <div class="landing-actions">
          <button type="button" id="btn-new" class="btn btn-primary btn-large">➕ Nov pregled</button>
          <button type="button" id="btn-import" class="btn btn-secondary btn-large">📁 Uvozi iz datoteke (.xlsx)</button>
          <input type="file" id="file-input" accept=".xlsx,.xls" hidden />
        </div>

        <div id="session-status" class="session-status"></div>

        <div class="section">
          <div class="section-head">
            <h2 class="section-title">Shranjeni pregledi v tej napravi</h2>
            <button type="button" id="btn-export-all" class="btn btn-secondary btn-sm">Izvozi vse</button>
          </div>
          <div id="session-list"></div>
          <div id="storage-note" class="form-hint"></div>
        </div>

        <p class="tab-help">
          Pregledi se shranjujejo v pomnilnik te naprave, tudi brez povezave.
          <strong>Dokler pregleda ne izvozite v .xlsx, obstaja samo tukaj</strong> — če pobrišete
          podatke brskalnika ali odstranite aplikacijo, je izgubljen.
        </p>
      </div>
    `;

    this.listEl = panel.querySelector("#session-list") as HTMLElement;
    this.statusEl = panel.querySelector("#session-status") as HTMLElement;

    const fileInput = panel.querySelector("#file-input") as HTMLInputElement;
    (panel.querySelector("#btn-new") as HTMLButtonElement).addEventListener("click", () => {
      this.session.newSession();
      this.updateStatus();
      this.tabManager?.switchTo("subject");
    });
    (panel.querySelector("#btn-import") as HTMLButtonElement).addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => void this.handleImport(fileInput));
    (panel.querySelector("#btn-export-all") as HTMLButtonElement)
      .addEventListener("click", () => void this.handleExportAll());

    void requestPersistence();
    void this.refresh();
  }

  onActivate(): void {
    this.updateStatus();
    void this.refresh();
  }

  onDeactivate(): void {
    this.confirmingDelete = null;
  }

  private async handleImport(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";
    this.setStatus("Uvažanje datoteke ...", false);
    try {
      const session = await this.store.loadFromFile(file);
      if (!session) {
        this.setStatus("V izbrani datoteki ni podatkov pregleda.", false);
        return;
      }
      this.session.load(session);
      this.updateStatus();
      await this.refresh();
      this.tabManager?.switchTo("subject");
    } catch (err) {
      this.setStatus(`Napaka pri uvozu: ${msg(err)}`, false);
    }
  }

  private async handleExportAll(): Promise<void> {
    try {
      this.setStatus(await this.store.exportAll(), true);
      await this.refresh();
    } catch (err) {
      this.setStatus(msg(err), false);
    }
  }

  private async refresh(): Promise<void> {
    if (!this.listEl) return;
    const token = ++this.refreshToken;
    const current = () => token === this.refreshToken;

    let sessions: LocalSessionInfo[];
    let estimate: { usage: number; quota: number } | null;
    try {
      [sessions, estimate] = await Promise.all([this.store.list(), storageEstimate()]);
    } catch (err) {
      if (current()) this.listEl.innerHTML = `<p class="placeholder-text">Lokalna baza ni na voljo: ${esc(msg(err))}</p>`;
      return;
    }
    if (!current()) return;

    if (sessions.length === 0) {
      this.listEl.innerHTML = `<p class="placeholder-text">Ni shranjenih pregledov.</p>`;
    } else {
      const activeId = this.session.hasSession() ? this.session.get().sessionId : null;
      this.listEl.innerHTML = sessions
        .map((s) => {
          const isActive = s.sessionId === activeId;
          const armed = this.confirmingDelete === s.sessionId;
          return `
            <div class="session-row${isActive ? " active" : ""}">
              <div class="session-info">
                <div class="session-title">
                  ${esc(s.title)}
                  ${s.exported
                    ? `<span class="badge badge-ok">izvoženo</span>`
                    : `<span class="badge badge-warn">ni izvoženo</span>`}
                </div>
                <div class="session-sub">${esc(s.subtitle)} · ${new Date(s.modifiedAt).toLocaleString("sl-SI")}</div>
              </div>
              <div class="session-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-open="${s.sessionId}">${isActive ? "Aktiven" : "Odpri"}</button>
                <button type="button" class="btn btn-danger-outline btn-sm${armed ? " armed" : ""}" data-del="${s.sessionId}">
                  ${armed ? "Ste prepričani?" : "Izbriši"}
                </button>
              </div>
            </div>`;
        })
        .join("");

      this.listEl.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((btn) => {
        btn.addEventListener("click", () => void this.handleOpen(btn.dataset.open as string));
      });
      this.listEl.querySelectorAll<HTMLButtonElement>("[data-del]").forEach((btn) => {
        btn.addEventListener("click", () => void this.handleDelete(btn.dataset.del as string));
      });
    }

    const note = this.panel?.querySelector("#storage-note") as HTMLElement | null;
    if (note) {
      const unexported = sessions.filter((s) => !s.exported).length;
      const parts: string[] = [];
      if (unexported > 0) {
        parts.push(
          `${unexported} ` +
            plural(
              unexported,
              "pregled še ni izvožen",
              "pregleda še nista izvožena",
              "pregledi še niso izvoženi",
              "pregledov še ni izvoženih"
            ) +
            " v .xlsx"
        );
      }
      if (estimate && estimate.quota > 0) {
        parts.push(`porabljeno ${formatBytes(estimate.usage)} od ${formatBytes(estimate.quota)}`);
      }
      note.textContent = parts.join(" · ");
      note.style.color = unexported > 0 ? "#a4262c" : "#605e5c";
    }
  }

  private async handleOpen(sessionId: string): Promise<void> {
    try {
      const session = await this.store.open(sessionId);
      if (!session) {
        this.setStatus("Pregleda ni bilo mogoče odpreti.", false);
        return;
      }
      this.session.load(session);
      this.updateStatus();
      await this.refresh();
      this.tabManager?.switchTo("subject");
    } catch (err) {
      this.setStatus(`Napaka: ${msg(err)}`, false);
    }
  }

  private async handleDelete(sessionId: string): Promise<void> {
    if (this.confirmingDelete !== sessionId) {
      this.confirmingDelete = sessionId;
      await this.refresh();
      setTimeout(() => {
        if (this.confirmingDelete === sessionId) {
          this.confirmingDelete = null;
          void this.refresh();
        }
      }, 3000);
      return;
    }
    this.confirmingDelete = null;
    try {
      await this.store.remove(sessionId);
      if (this.session.hasSession() && this.session.get().sessionId === sessionId) this.session.close();
      this.updateStatus();
      await this.refresh();
    } catch (err) {
      this.setStatus(`Napaka pri brisanju: ${msg(err)}`, false);
    }
  }

  private setStatus(text: string, ok: boolean): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.className = ok ? "session-status active" : "session-status";
  }

  private updateStatus(): void {
    if (!this.statusEl) return;
    if (this.session.hasSession()) {
      const s = this.session.get();
      this.statusEl.textContent = `Aktiven pregled: ${s.subject.code || s.sessionId}`;
      this.statusEl.className = "session-status active";
    } else {
      this.statusEl.textContent = "Ni aktivnega pregleda.";
      this.statusEl.className = "session-status";
    }
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
