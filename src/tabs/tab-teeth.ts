import { TabController } from "../app/tab-manager";
import { SessionState, summarize } from "../model/session";
import { buildChart } from "../dental/chart";
import { ALL_TEETH } from "../model/constants";
import { armReset } from "./reset-button";
import { plural } from "../model/plural";

/**
 * Tooth count. Everything else in the app scores only the teeth marked present
 * here, so this tab is the one that has to be right first.
 */
export class TeethTab implements TabController {
  private panel: HTMLElement | null = null;

  constructor(private session: SessionState) {}

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-inner">
        <div class="tab-head">
          <h2>Zobje</h2>
          <button type="button" class="btn btn-danger-outline btn-sm" id="teeth-reset">Vsi prisotni</button>
        </div>
        <div class="count-bar" id="teeth-count"></div>
        <div id="teeth-chart"></div>
        <div class="legend">
          <span class="legend-item"><span class="legend-swatch present"></span> prisoten</span>
          <span class="legend-item"><span class="legend-swatch absent"></span> manjka</span>
        </div>
        <p class="tab-help">
          Tapnite zob, da ga označite kot manjkajočega. Manjkajoči zobje so izključeni iz
          VPI in GBI ter jih na ostalih zavihkih ni mogoče označevati.
          <strong>Če zob označite kot manjkajoč, se vsi vnosi na njem izbrišejo.</strong>
        </p>
      </div>
    `;

    armReset(panel.querySelector("#teeth-reset") as HTMLButtonElement, "Vsi prisotni", () => {
      this.session.resetSection("present");
      this.render();
    });
  }

  onActivate(): void {
    this.render();
  }

  private render(): void {
    if (!this.panel) return;
    const host = this.panel.querySelector("#teeth-chart") as HTMLElement;
    const countEl = this.panel.querySelector("#teeth-count") as HTMLElement;

    if (!this.session.hasSession()) {
      host.innerHTML = `<p class="placeholder-text">Ni aktivnega pregleda.</p>`;
      countEl.textContent = "";
      return;
    }

    const sum = summarize(this.session.get());
    const missing = ALL_TEETH.length - sum.teethPresent;
    countEl.innerHTML =
      `<strong>${sum.teethPresent}</strong> ` +
      `${plural(sum.teethPresent, "prisoten zob", "prisotna zoba", "prisotni zobje", "prisotnih zob")} ` +
      `<span class="count-sub">(od ${ALL_TEETH.length} · manjkajočih: ${missing})</span>`;

    host.innerHTML = "";
    host.appendChild(
      buildChart({
        mode: "whole",
        isMissing: (t) => !this.session.isPresent(t),
        toothTitle: (t) => (this.session.isPresent(t) ? `Zob ${t} — prisoten` : `Zob ${t} — manjka`),
        onTooth: (t) => {
          this.session.setPresent(t, !this.session.isPresent(t));
          this.render();
        },
      })
    );
  }
}
