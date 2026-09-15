import { StatusSession } from "../model/types";
import { buildReportModel } from "./model";
import { renderReportHtml, REPORT_CSS } from "./html";

let closeActive: (() => void) | null = null;

/** iPhone, iPod, and iPadOS (which reports itself as a Mac with a touch screen). */
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Shows the report as a full-screen layer inside the app.
 *
 * Deliberately not a new window: an installed app on iOS hands window.open to
 * Safari, and from there there is no way back into the app. And because
 * window.print() does nothing in an installed iOS app either, the PDF is
 * generated here and handed to the share sheet (Save to Files, Print, Mail).
 * Elsewhere it downloads, and printing the layer itself stays available.
 */
export function openReport(session: StatusSession): void {
  closeActive?.();

  const model = buildReportModel(session);
  const ios = isIOS();

  const overlay = document.createElement("div");
  overlay.className = "report-overlay";
  overlay.innerHTML = `
    <div class="report-toolbar">
      <button type="button" class="btn btn-secondary" data-act="close">← Nazaj</button>
      <span class="report-toolbar-title">Poročilo</span>
      ${ios ? "" : `<button type="button" class="btn btn-secondary" data-act="print">🖨 Natisni</button>`}
      <button type="button" class="btn btn-primary" data-act="pdf" disabled>Pripravljam PDF …</button>
    </div>
    <div class="report-status" hidden></div>
    <div class="report-scroll"><div class="report-sheet"></div></div>`;

  // Shadow root keeps the report's styles and the app's styles apart.
  const sheet = overlay.querySelector(".report-sheet") as HTMLElement;
  sheet.attachShadow({ mode: "open" }).innerHTML = `<style>${REPORT_CSS}</style>${renderReportHtml(model)}`;

  const previousTitle = document.title;
  // The print dialog proposes the document title as the PDF file name.
  document.title = model.fileTitle;
  document.body.classList.add("report-open");
  document.body.appendChild(overlay);

  const pdfBtn = overlay.querySelector('[data-act="pdf"]') as HTMLButtonElement;
  const status = overlay.querySelector(".report-status") as HTMLElement;
  const showStatus = (text: string) => {
    status.textContent = text;
    status.hidden = !text;
  };

  const remove = () => {
    window.removeEventListener("popstate", onPop);
    overlay.remove();
    document.body.classList.remove("report-open");
    document.title = previousTitle;
    closeActive = null;
  };
  const onPop = () => remove();

  // A history entry lets the Android back button / back gesture close the report.
  let pushed = false;
  try {
    history.pushState({ report: true }, "");
    pushed = true;
    window.addEventListener("popstate", onPop);
  } catch {
    /* no history API — the Nazaj button still works */
  }
  closeActive = () => (pushed ? history.back() : remove());

  overlay.querySelector('[data-act="close"]')?.addEventListener("click", () => closeActive?.());
  overlay.querySelector('[data-act="print"]')?.addEventListener("click", () => window.print());

  // Build the PDF up front. iOS only opens the share sheet from inside the tap
  // itself, so the file has to be ready before the button is pressed.
  let file: File | null = null;
  import(/* webpackChunkName: "pdf" */ "./pdf")
    .then(({ renderReportPdf }) => {
      const blob = renderReportPdf(model);
      file = new File([blob], `${model.fileTitle}.pdf`, { type: "application/pdf" });
      if (!overlay.isConnected) return;
      pdfBtn.disabled = false;
      pdfBtn.textContent = ios ? "📤 Shrani / deli PDF" : "📄 Shrani PDF";
    })
    .catch((err: unknown) => {
      pdfBtn.textContent = "PDF ni na voljo";
      showStatus(
        `PDF ni bilo mogoče pripraviti: ${err instanceof Error ? err.message : String(err)}. ` +
          "Če ste brez povezave, aplikacijo enkrat odprite s povezavo."
      );
    });

  pdfBtn.addEventListener("click", () => {
    if (!file) return;
    const shareData = { files: [file], title: model.fileTitle };
    if (ios && navigator.canShare?.(shareData)) {
      navigator.share(shareData).catch((err: unknown) => {
        // Closing the share sheet is not an error worth reporting.
        if (err instanceof DOMException && err.name === "AbortError") return;
        downloadFile(file as File);
      });
      return;
    }
    downloadFile(file);
    showStatus(`PDF je shranjen v Prenose kot ${file.name}.`);
  });
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
