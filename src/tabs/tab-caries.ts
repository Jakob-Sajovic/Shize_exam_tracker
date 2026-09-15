import { TabController } from "../app/tab-manager";
import { SessionState, summarize } from "../model/session";
import { buildChart } from "../dental/chart";
import { CARIES_GRADES } from "../model/constants";
import { CariesGrade, FullSurface } from "../model/types";
import { armReset } from "./reset-button";
import { plural } from "../model/plural";

/**
 * Caries, graded 1–6 per surface.
 *
 * Entry is a brush rather than a per-surface dropdown: on a tablet, picking
 * the grade once and tapping every surface that has it is far quicker than
 * opening a menu 160 times, and it matches how an examiner actually calls out
 * findings.
 */
export class CariesTab implements TabController {
  private panel: HTMLElement | null = null;
  private brush: CariesGrade = 1;

  constructor(private session: SessionState) {}

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-inner">
        <div class="tab-head">
          <h2>Karies</h2>
          <button type="button" class="btn btn-danger-outline btn-sm" id="car-reset">Ponastavi</button>
        </div>
        <div class="count-bar" id="car-score"></div>

        <div class="brush-bar" id="car-brush">
          ${CARIES_GRADES.map(
            (g) => `<button type="button" class="brush" data-grade="${g.value}"
                      style="--brush-color:${g.color}" title="${g.description}">${g.label}</button>`
          ).join("")}
          <button type="button" class="brush brush-erase" data-grade="0" title="Izbriši oznako">⌫</button>
        </div>
        <p class="brush-desc" id="car-brush-desc"></p>

        <div id="car-chart"></div>
        <p class="tab-help">
          Izberite stopnjo in tapnite ploskev. Ponoven tap na ploskev z isto stopnjo jo izbriše.
          Ocenjuje se pet ploskev na zob — štirim dodamo <strong>okluzalno</strong> (sredina).
        </p>
      </div>
    `;

    panel.querySelectorAll<HTMLButtonElement>("#car-brush .brush").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.brush = Number(btn.dataset.grade) as CariesGrade;
        this.syncBrush();
      });
    });

    armReset(panel.querySelector("#car-reset") as HTMLButtonElement, "Ponastavi", () => {
      this.session.resetSection("caries");
      this.render();
    });

    this.syncBrush();
  }

  onActivate(): void {
    this.render();
  }

  private syncBrush(): void {
    if (!this.panel) return;
    this.panel.querySelectorAll<HTMLButtonElement>("#car-brush .brush").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.grade) === this.brush);
    });
    const desc = this.panel.querySelector("#car-brush-desc") as HTMLElement;
    const def = CARIES_GRADES.find((g) => g.value === this.brush);
    desc.textContent = def ? `Stopnja ${def.label} — ${def.description}` : "Brisanje oznak";
  }

  private render(): void {
    if (!this.panel) return;
    const host = this.panel.querySelector("#car-chart") as HTMLElement;
    const score = this.panel.querySelector("#car-score") as HTMLElement;

    if (!this.session.hasSession()) {
      host.innerHTML = `<p class="placeholder-text">Ni aktivnega pregleda.</p>`;
      score.textContent = "";
      return;
    }

    const s = this.session.get();
    const sum = summarize(s);
    score.innerHTML =
      `<strong>${sum.cariesSurfaces}</strong> ` +
      `${plural(sum.cariesSurfaces, "kariozna ploskev", "kariozni ploskvi", "kariozne ploskve", "karioznih ploskev")} ` +
      `<span class="count-sub">na ${sum.cariesTeeth} ` +
      `${plural(sum.cariesTeeth, "zobu", "zobeh", "zobeh", "zobeh")}</span>`;

    host.innerHTML = "";
    host.appendChild(
      buildChart({
        mode: 5,
        isMissing: (t) => !this.session.isPresent(t),
        fillFor: (t, surface) => {
          const grade = s.caries[t][surface];
          return grade ? CARIES_GRADES.find((g) => g.value === grade)?.color || "" : "";
        },
        textFor: (t, surface) => {
          const grade = s.caries[t][surface];
          return grade ? String(grade) : "";
        },
        onSurface: (t, surface: FullSurface) => {
          const current = s.caries[t][surface];
          // Tapping a surface that already carries the brush value clears it,
          // so correcting a mis-tap needs no mode switch.
          const next = current === this.brush ? 0 : this.brush;
          this.session.setCaries(t, surface, next as CariesGrade);
          this.render();
        },
      })
    );
  }
}
