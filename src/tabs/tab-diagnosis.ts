import { TabController } from "../app/tab-manager";
import { SessionState } from "../model/session";

/**
 * Free-text diagnostic observations. Kept apart from the short note on the
 * Preiskovanec tab, which is about the visit rather than the findings.
 */
export class DiagnosisTab implements TabController {
  private panel: HTMLElement | null = null;
  private textarea: HTMLTextAreaElement | null = null;

  constructor(private session: SessionState) {}

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-inner">
        <h2>Diagnostične opombe</h2>
        <div id="diag-empty" class="placeholder-text" hidden>Ni aktivnega pregleda.</div>
        <div id="diag-form">
          <label class="form-label" for="diag-text">Diagnostična opažanja</label>
          <textarea id="diag-text" class="form-textarea diag-textarea" rows="14"
            placeholder="Klinične ugotovitve, posebnosti, priporočila ..."></textarea>
          <p class="form-hint">Besedilo se samodejno shranjuje in je vključeno v izvoz .xlsx ter v poročilo PDF.</p>
        </div>
      </div>
    `;

    this.textarea = panel.querySelector("#diag-text") as HTMLTextAreaElement;
    this.textarea.addEventListener("input", () => {
      if (!this.session.hasSession() || !this.textarea) return;
      this.session.setDiagnosticNotes(this.textarea.value);
    });
  }

  onActivate(): void {
    if (!this.panel || !this.textarea) return;
    const has = this.session.hasSession();
    (this.panel.querySelector("#diag-empty") as HTMLElement).hidden = has;
    (this.panel.querySelector("#diag-form") as HTMLElement).hidden = !has;
    if (has) this.textarea.value = this.session.get().diagnosticNotes;
  }
}
