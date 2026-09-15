/**
 * Slovenian noun agreement: singular, dual, a "few" form for 3–4, and a
 * genitive plural for 5 and up. Counters in the UI change constantly, so the
 * form has to be picked at render time rather than baked into one string.
 */
export function plural(n: number, one: string, two: string, few: string, many: string): string {
  const r = Math.abs(Math.round(n)) % 100;
  if (r === 1) return one;
  if (r === 2) return two;
  if (r === 3 || r === 4) return few;
  return many;
}

/** "29 prisotnih zob", "2 prisotna zoba", … */
export function teethPhrase(n: number): string {
  return `${n} ${plural(n, "prisoten zob", "prisotna zoba", "prisotni zobje", "prisotnih zob")}`;
}
