import { TabController } from "../app/tab-manager";
import { SessionState, summarize } from "../model/session";
import { buildChart } from "../dental/chart";
import { PbSurface, FullSurface } from "../model/types";
import { armReset } from "./reset-button";
import { teethPhrase } from "../model/plural";

interface IndexTabConfig {
  kind: "plaque" | "bleeding";
  title: string;
  subtitle: string;
  color: string;
  help: string;
}

const CONFIG: Record<"plaque" | "bleeding", IndexTabConfig> = {
  plaque: {
    kind: "plaque",
    title: "VPI — plak indeks",
    subtitle: "Vidni plak",
    color: "#ffd335",
    help:
      "Tapnite ploskev, da označite prisotnost plaka (+); ponoven tap jo odznači (−). " +
      "Ocenjujejo se štiri ploskve na zob: mezialno, distalno, bukalno in palatinalno/lingvalno.",
  },
  bleeding: {
    kind: "bleeding",
    title: "GBI — indeks krvavitve",
    subtitle: "Krvavitev ob sondiranju",
    color: "#d13438",
    help:
      "Tapnite ploskev, da označite krvavitev (+); ponoven tap jo odznači (−). " +
      "Iste štiri ploskve kot pri VPI.",
  },
};

/**
 * VPI and GBI are the same chart over different data, so they share one
 * controller registered twice — a second copy would only drift.
 */
export class IndexTab implements TabController {
  private panel: HTMLElement | null = null;
  private cfg: IndexTabConfig;

  constructor(private session: SessionState, kind: "plaque" | "bleeding") {
    this.cfg = CONFIG[kind];
  }

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-inner">
        <div class="tab-head">
          <h2>${this.cfg.title}</h2>
          <button type="button" class="btn btn-danger-outline btn-sm" id="idx-reset">Ponastavi</button>
        </div>
        <div class="count-bar" id="idx-score"></div>
        <div id="idx-chart"></div>
        <div class="legend">
          <span class="legend-item">
            <span class="legend-swatch" style="background:${this.cfg.color}"></span> ${this.cfg.subtitle}
          </span>
        </div>
        <p class="tab-help">${this.cfg.help}</p>
      </div>
    `;

    armReset(panel.querySelector("#idx-reset") as HTMLButtonElement, "Ponastavi", () => {
      this.session.resetSection(this.cfg.kind);
      this.render();
    });
  }

  onActivate(): void {
    this.render();
  }

  private render(): void {
    if (!this.panel) return;
    const host = this.panel.querySelector("#idx-chart") as HTMLElement;
    const score = this.panel.querySelector("#idx-score") as HTMLElement;

    if (!this.session.hasSession()) {
      host.innerHTML = `<p class="placeholder-text">Ni aktivnega pregleda.</p>`;
      score.textContent = "";
      return;
    }

    const s = this.session.get();
    const sum = summarize(s);
    const marked = this.cfg.kind === "plaque" ? sum.vpiMarked : sum.gbiMarked;
    const total = this.cfg.kind === "plaque" ? sum.vpiTotal : sum.gbiTotal;
    const percent = this.cfg.kind === "plaque" ? sum.vpiPercent : sum.gbiPercent;

    score.innerHTML =
      `<strong>${percent.toFixed(1)} %</strong> ` +
      `<span class="count-sub">(${marked} od ${total} ploskev · ${teethPhrase(sum.teethPresent)})</span>`;

    host.innerHTML = "";
    host.appendChild(
      buildChart({
        mode: 4,
        isMissing: (t) => !this.session.isPresent(t),
        fillFor: (t, surface) =>
          s[this.cfg.kind][t][surface as PbSurface] ? this.cfg.color : "",
        onSurface: (t, surface: FullSurface) => {
          this.session.togglePb(this.cfg.kind, t, surface as PbSurface);
          this.render();
        },
      })
    );
  }
}
