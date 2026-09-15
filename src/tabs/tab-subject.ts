import { TabController } from "../app/tab-manager";
import { SessionState } from "../model/session";

export class SubjectTab implements TabController {
  private panel: HTMLElement | null = null;

  constructor(private session: SessionState) {}

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-inner">
        <h2>Podatki o preiskovancu</h2>
        <div id="subject-empty" class="placeholder-text" hidden>Ni aktivnega pregleda.</div>
        <div id="subject-form">
          <div class="form-group">
            <label class="form-label" for="s-code">Koda preiskovanca</label>
            <input type="text" id="s-code" class="form-input" placeholder="npr. SHZ-014" />
            <p class="form-hint">Anonimizirana šifra. Obvezno polje.</p>
          </div>
          <div class="form-group">
            <label class="form-label" for="s-date">Datum pregleda</label>
            <input type="date" id="s-date" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label" for="s-examiner">Izvajalec pregleda</label>
            <input type="text" id="s-examiner" class="form-input" placeholder="Ime in priimek" />
          </div>
          <div class="form-group">
            <label class="form-label" for="s-note">Opomba</label>
            <textarea id="s-note" class="form-textarea" rows="4"
              placeholder="Poljubne opombe o pregledu ..."></textarea>
          </div>
        </div>
      </div>
    `;

    this.bind("#s-code", "code");
    this.bind("#s-date", "date");
    this.bind("#s-examiner", "examiner");
    this.bind("#s-note", "note");
  }

  private bind(selector: string, field: "code" | "date" | "examiner" | "note"): void {
    const el = this.panel?.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    el.addEventListener("input", () => {
      if (!this.session.hasSession()) return;
      this.session.setSubjectField(field, el.value);
    });
  }

  onActivate(): void {
    if (!this.panel) return;
    const has = this.session.hasSession();
    (this.panel.querySelector("#subject-empty") as HTMLElement).hidden = has;
    (this.panel.querySelector("#subject-form") as HTMLElement).hidden = !has;
    if (!has) return;

    const s = this.session.get();
    (this.panel.querySelector("#s-code") as HTMLInputElement).value = s.subject.code;
    (this.panel.querySelector("#s-date") as HTMLInputElement).value = s.subject.date;
    (this.panel.querySelector("#s-examiner") as HTMLInputElement).value = s.subject.examiner;
    (this.panel.querySelector("#s-note") as HTMLTextAreaElement).value = s.subject.note;
  }
}
