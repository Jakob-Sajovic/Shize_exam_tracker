import { TabController } from "../app/tab-manager";
import { SessionState, summarize } from "../model/session";
import { Store } from "../storage/store";
import { openReport } from "../report/report";

export class ExportTab implements TabController {
  private panel: HTMLElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;
  private reportBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(private session: SessionState, private store: Store) {}

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-inner">
        <h2>Izvoz</h2>
        <div id="export-summary"></div>
        <div id="export-status" class="export-status"></div>
        <button type="button" id="btn-save" class="btn btn-primary btn-large">💾 Shrani in izvozi (.xlsx)</button>
        <button type="button" id="btn-report" class="btn btn-secondary btn-large btn-report">📄 Poročilo (PDF)</button>
        <p class="tab-help">
          Pregled se med vnašanjem samodejno shranjuje v napravo. Zgornji gumb prenese
          datoteko .xlsx — eno vrstico na pregled, primerno za nadaljnjo obdelavo. Spodnji prikaže
          poročilo; tapnite <strong>Natisni / PDF</strong> in izberite <strong>Shrani kot PDF</strong>.
        </p>
      </div>
    `;

    this.saveBtn = panel.querySelector("#btn-save") as HTMLButtonElement;
    this.statusEl = panel.querySelector("#export-status") as HTMLElement;
    this.saveBtn.addEventListener("click", () => void this.handleSave());
    this.reportBtn = panel.querySelector("#btn-report") as HTMLButtonElement;
    this.reportBtn.addEventListener("click", () => this.handleReport());
  }

  onActivate(): void {
    this.render();
    if (this.statusEl) this.statusEl.textContent = "";
  }

  private async handleSave(): Promise<void> {
    if (!this.session.hasSession() || !this.saveBtn || !this.statusEl) return;

    const s = this.session.get();
    if (!s.subject.code.trim()) {
      this.setStatus("Vnesite kodo preiskovanca na zavihku Preiskovanec.", "warn");
      return;
    }

    this.saveBtn.disabled = true;
    this.setStatus("Shranjevanje ...", "muted");
    try {
      this.setStatus(await this.store.save(s), "ok");
    } catch (err) {
      this.setStatus(`Napaka: ${err instanceof Error ? err.message : String(err)}`, "warn");
    } finally {
      this.saveBtn.disabled = false;
    }
  }

  private handleReport(): void {
    if (!this.session.hasSession()) return;
    try {
      openReport(this.session.get());
      this.setStatus("", "muted");
    } catch (err) {
      this.setStatus(`Napaka: ${err instanceof Error ? err.message : String(err)}`, "warn");
    }
  }

  private setStatus(text: string, kind: "ok" | "warn" | "muted"): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.className = `export-status ${kind}`;
  }

  private render(): void {
    if (!this.panel) return;
    const host = this.panel.querySelector("#export-summary") as HTMLElement;

    if (!this.session.hasSession()) {
      host.innerHTML = `<p class="placeholder-text">Ni aktivnega pregleda.</p>`;
      if (this.saveBtn) this.saveBtn.disabled = true;
      if (this.reportBtn) this.reportBtn.disabled = true;
      return;
    }
    if (this.saveBtn) this.saveBtn.disabled = false;
    if (this.reportBtn) this.reportBtn.disabled = false;

    const s = this.session.get();
    const sum = summarize(s);
    const card = (title: string, rows: [string, string][]) => `
      <div class="summary-card">
        <h3>${title}</h3>
        ${rows.map(([k, v]) => `<div class="summary-row"><span>${k}</span><strong>${v}</strong></div>`).join("")}
      </div>`;

    host.innerHTML =
      card("Preiskovanec", [
        ["Koda", s.subject.code || "—"],
        ["Datum", s.subject.date || "—"],
        ["Izvajalec", s.subject.examiner || "—"],
      ]) +
      card("Zobje", [
        ["Prisotni", `${sum.teethPresent} / 32`],
        ["Manjkajoči", String(32 - sum.teethPresent)],
      ]) +
      card("Indeksi", [
        ["VPI (plak)", `${sum.vpiPercent.toFixed(1)} % (${sum.vpiMarked} / ${sum.vpiTotal})`],
        ["GBI (krvavitev)", `${sum.gbiPercent.toFixed(1)} % (${sum.gbiMarked} / ${sum.gbiTotal})`],
      ]) +
      card("Karies", [
        ["Kariozne ploskve", String(sum.cariesSurfaces)],
        ["Prizadeti zobje", String(sum.cariesTeeth)],
      ]) +
      card("Zalivke", [
        ["Ploskve z zalivko", String(sum.fillingSurfaces)],
        ["Kompozit", String(sum.fillingComposite)],
        ["Amalgam", String(sum.fillingAmalgam)],
        ["Zalitje fisur (zobje)", String(sum.sealedTeeth)],
      ]);
  }
}
