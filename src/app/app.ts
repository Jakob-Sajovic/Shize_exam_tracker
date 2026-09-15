import "./app.css";
import { SessionState } from "../model/session";
import { TabManager } from "./tab-manager";
import { Store } from "../storage/store";
import { LandingTab } from "../tabs/tab-landing";
import { SubjectTab } from "../tabs/tab-subject";
import { TeethTab } from "../tabs/tab-teeth";
import { IndexTab } from "../tabs/tab-index";
import { CariesTab } from "../tabs/tab-caries";
import { FillingsTab } from "../tabs/tab-fillings";
import { ExportTab } from "../tabs/tab-export";

const AUTOSAVE_DEBOUNCE_MS = 1500;

declare const __BUILD_ID__: string;

function initApp(): void {
  const tabBar = document.getElementById("tab-bar") as HTMLElement;
  const panelContainer = document.getElementById("panel-container") as HTMLElement;

  const session = SessionState.getInstance();
  const store = new Store();
  const tabManager = new TabManager(tabBar, panelContainer);

  const landing = new LandingTab(session, store);
  landing.setTabManager(tabManager);

  tabManager.registerController("landing", landing);
  tabManager.registerController("subject", new SubjectTab(session));
  tabManager.registerController("teeth", new TeethTab(session));
  tabManager.registerController("plaque", new IndexTab(session, "plaque"));
  tabManager.registerController("bleeding", new IndexTab(session, "bleeding"));
  tabManager.registerController("caries", new CariesTab(session));
  tabManager.registerController("fillings", new FillingsTab(session));
  tabManager.registerController("export", new ExportTab(session, store));

  const buildEl = document.getElementById("build-id");
  if (buildEl) buildEl.textContent = `različica ${__BUILD_ID__}`;

  wireAutosave(session, store);
  tabManager.switchTo("landing");
}

/**
 * The app owns the only copy of the data until it is exported, so every change
 * is written back to IndexedDB — debounced, and again on the way out.
 */
function wireAutosave(session: SessionState, store: Store): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const indicator = document.getElementById("autosave-indicator");

  const flush = () => {
    if (!session.hasSession()) return;
    store
      .autosave(session.get())
      .then(() => {
        if (indicator) {
          indicator.textContent = `shranjeno ${new Date().toLocaleTimeString("sl-SI")}`;
          indicator.className = "autosave-indicator ok";
        }
      })
      .catch((err: unknown) => {
        if (indicator) {
          indicator.textContent = `NI SHRANJENO: ${err instanceof Error ? err.message : String(err)}`;
          indicator.className = "autosave-indicator error";
        }
      });
  };

  session.onChange(() => {
    if (indicator && session.hasSession()) {
      indicator.textContent = "shranjujem ...";
      indicator.className = "autosave-indicator pending";
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
  });

  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

/** Offline support, plus telling the operator when a new build is available. */
function wireServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  const banner = document.getElementById("update-banner");
  const reloadBtn = document.getElementById("update-reload-btn");
  const showBanner = () => {
    if (banner) banner.hidden = false;
  };
  reloadBtn?.addEventListener("click", () => window.location.reload());

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) showBanner();

        reg.addEventListener("updatefound", () => {
          const incoming = reg.installing;
          if (!incoming) return;
          incoming.addEventListener("statechange", () => {
            // "installed" with an existing controller = an update, not a first install.
            if (incoming.state === "installed" && navigator.serviceWorker.controller) showBanner();
          });
        });

        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => undefined);
        });
      })
      .catch(() => {
        // Offline support is a bonus; the app works without it.
      });
  });
}

wireServiceWorker();
