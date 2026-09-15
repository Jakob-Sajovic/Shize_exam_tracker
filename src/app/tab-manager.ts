import { TABS } from "../model/constants";

export interface TabController {
  init(panel: HTMLElement): void;
  onActivate?(): void;
  onDeactivate?(): void;
}

/** Owns the tab strip and panel lifecycle. Panels are built lazily on first
 *  activation — 32-tooth charts are not free, and most tabs are never opened
 *  in a given session. */
export class TabManager {
  private controllers = new Map<string, TabController>();
  private initialized = new Set<string>();
  private activeId: string | null = null;

  constructor(private tabBar: HTMLElement, private panelContainer: HTMLElement) {
    this.buildTabBar();
  }

  registerController(id: string, controller: TabController): void {
    this.controllers.set(id, controller);
  }

  private buildTabBar(): void {
    this.tabBar.innerHTML = "";
    for (const tab of TABS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab-btn";
      btn.dataset.tabId = tab.id;
      btn.innerHTML = `<span class="tab-icon">${tab.icon}</span><span class="tab-label">${tab.label}</span>`;
      btn.addEventListener("click", () => this.switchTo(tab.id));
      this.tabBar.appendChild(btn);
    }
  }

  switchTo(id: string): void {
    if (this.activeId === id) return;

    if (this.activeId) this.controllers.get(this.activeId)?.onDeactivate?.();

    this.activeId = id;
    this.tabBar.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tabId === id);
    });

    let activePanel: HTMLElement | null = null;
    this.panelContainer.querySelectorAll<HTMLElement>(".tab-panel").forEach((panel) => {
      const on = panel.dataset.tab === id;
      panel.classList.toggle("active", on);
      if (on) activePanel = panel;
    });

    const controller = this.controllers.get(id);
    if (controller && activePanel) {
      const scroll = (activePanel as HTMLElement).querySelector(".panel-scroll") as HTMLElement;
      if (!this.initialized.has(id)) {
        controller.init(scroll);
        this.initialized.add(id);
      }
      controller.onActivate?.();
    }
  }

  active(): string | null {
    return this.activeId;
  }
}
