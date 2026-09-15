import { TabController } from "../app/tab-manager";
import { SessionState, summarize } from "../model/session";
import { buildChart } from "../dental/chart";
import { FILLING_MATERIALS } from "../model/constants";
import { FillingMaterial, FullSurface } from "../model/types";
import { armReset } from "./reset-button";
import { plural } from "../model/plural";

/** Fillings: material per surface, same brush model as the caries tab. */
export class FillingsTab implements TabController {
  private panel: HTMLElement | null = null;
  private brush: FillingMaterial = "kompozit";

  constructor(private session: SessionState) {}

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-inner">
        <div class="tab-head">
          <h2>Zalivke</h2>
          <button type="button" class="btn btn-danger-outline btn-sm" id="fil-reset">Ponastavi</button>
        </div>
        <div class="count-bar" id="fil-score"></div>

        <div class="brush-bar" id="fil-brush">
          ${FILLING_MATERIALS.map(
            (m) => `<button type="button" class="brush brush-wide" data-mat="${m.value}"
                      style="--brush-color:${m.color}">${m.label}</button>`
          ).join("")}
          <button type="button" class="brush brush-erase" data-mat="" title="Izbriši oznako">⌫</button>
        </div>

        <div id="fil-chart"></div>
        <p class="tab-help">
          Izberite material in tapnite ploskev. Ponoven tap na ploskev z istim materialom jo izbriše.
          Ocenjuje se pet ploskev na zob, vključno z <strong>okluzalno</strong> (sredina).
        </p>
      </div>
    `;

    panel.querySelectorAll<HTMLButtonElement>("#fil-brush .brush").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.brush = (btn.dataset.mat || "") as FillingMaterial;
        this.syncBrush();
      });
    });

    armReset(panel.querySelector("#fil-reset") as HTMLButtonElement, "Ponastavi", () => {
      this.session.resetSection("fillings");
      this.render();
    });

    this.syncBrush();
  }

  onActivate(): void {
    this.render();
  }

  private syncBrush(): void {
    if (!this.panel) return;
    this.panel.querySelectorAll<HTMLButtonElement>("#fil-brush .brush").forEach((btn) => {
      btn.classList.toggle("active", (btn.dataset.mat || "") === this.brush);
    });
  }

  private render(): void {
    if (!this.panel) return;
    const host = this.panel.querySelector("#fil-chart") as HTMLElement;
    const score = this.panel.querySelector("#fil-score") as HTMLElement;

    if (!this.session.hasSession()) {
      host.innerHTML = `<p class="placeholder-text">Ni aktivnega pregleda.</p>`;
      score.textContent = "";
      return;
    }

    const s = this.session.get();
    const sum = summarize(s);
    score.innerHTML =
      `<strong>${sum.fillingSurfaces}</strong> ` +
      `${plural(sum.fillingSurfaces, "ploskev z zalivko", "ploskvi z zalivko", "ploskve z zalivko", "ploskev z zalivko")} ` +
      `<span class="count-sub">(kompozit ${sum.fillingComposite} · amalgam ${sum.fillingAmalgam})</span>`;

    host.innerHTML = "";
    host.appendChild(
      buildChart({
        mode: 5,
        isMissing: (t) => !this.session.isPresent(t),
        fillFor: (t, surface) => {
          const mat = s.fillings[t][surface];
          return mat ? FILLING_MATERIALS.find((m) => m.value === mat)?.color || "" : "";
        },
        textFor: (t, surface) => {
          const mat = s.fillings[t][surface];
          return mat === "kompozit" ? "K" : mat === "amalgam" ? "A" : "";
        },
        onSurface: (t, surface: FullSurface) => {
          const current = s.fillings[t][surface];
          const next = current === this.brush ? "" : this.brush;
          this.session.setFilling(t, surface, next as FillingMaterial);
          this.render();
        },
      })
    );
  }
}
