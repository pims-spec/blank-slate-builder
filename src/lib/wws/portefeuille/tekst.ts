// Kleine teksthulpen voor scherm en PDF van de portefeuille-analyse.

/** "1 woning", "2 woningen", "0 woningen" */
export function aantal(n: number, enkelvoud: string, meervoud: string): string {
  return n + " " + (n === 1 ? enkelvoud : meervoud);
}

/**
 * Een periode van twee tijdstippen in de gegeven opmaak: één waarde als beide er in die
 * opmaak hetzelfde uitzien (dus geen "09:20 t/m 09:20"), anders "van t/m tot".
 */
export function periode(van: string, tot: string | null, opmaak: (iso: string) => string): string {
  const a = opmaak(van);
  const b = tot ? opmaak(tot) : a;
  return a === b ? a : a + " t/m " + b;
}
