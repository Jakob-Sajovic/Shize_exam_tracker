import * as XLSX from "xlsx";
import { StatusSession } from "../model/types";
import { SHEET_NAME, getColumnHeaders, sessionToRow, rowToSession } from "./codec";

export function buildWorkbook(sessions: StatusSession[]): Uint8Array {
  const headers = getColumnHeaders();
  const rows = sessions.map(sessionToRow);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), SHEET_NAME);
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;
}

export async function readWorkbook(file: File): Promise<StatusSession | null> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[SHEET_NAME] || wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return null;

  const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "" });
  if (aoa.length < 2) return null;

  const headers = (aoa[0] as unknown[]).map((h) => String(h));
  // Last row wins: a file with several exams opens on the most recent one.
  for (let i = aoa.length - 1; i >= 1; i--) {
    const session = rowToSession(headers, aoa[i]);
    if (session) return session;
  }
  return null;
}

export function workbookFileName(s: StatusSession): string {
  const who = (s.subject.code || "pregled").replace(/[^\w\-.]+/g, "_");
  return `${who}_${s.subject.date || "bez-datuma"}.xlsx`;
}

/** Hands the file to the user. iOS routes this through the share sheet rather
 *  than a downloads folder, so the anchor must be in the document when clicked. */
export function downloadWorkbook(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
