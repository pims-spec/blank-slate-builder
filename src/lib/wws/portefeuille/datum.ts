// Datumrekenen voor de portefeuille-analyse, op ISO-datums ("2026-10-15") zonder tijdzone:
// zo kan een dag niet verspringen door zomertijd of de tijdzone van de server.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Is dit een geldige ISO-datum (ook echt bestaand: geen 31 april of 29 februari 2027)? */
export function isIsoDatum(s: string | null | undefined): s is string {
  const m = s ? ISO.exec(s) : null;
  if (!m) return false;
  const [j, mnd, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mnd >= 1 && mnd <= 12 && d >= 1 && d <= dagenInMaand(j, mnd);
}

const schrikkel = (j: number) => (j % 4 === 0 && j % 100 !== 0) || j % 400 === 0;
function dagenInMaand(j: number, m: number) {
  return [31, schrikkel(j) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
}
const tweecijfer = (n: number) => String(n).padStart(2, "0");

/**
 * Datum plus (of min) een aantal maanden. Bestaat de dag niet in de doelmaand, dan de laatste
 * dag van die maand: 31 augustus + 3 maanden = 30 november, 29 februari 2016 + 10 jaar =
 * 28 februari 2026.
 */
export function plusMaanden(iso: string, n: number): string {
  const m = ISO.exec(iso);
  if (!m) throw new Error("ongeldige datum: " + iso);
  const totaal = Number(m[1]) * 12 + (Number(m[2]) - 1) + n;
  const j = Math.floor(totaal / 12);
  const mnd = totaal - j * 12 + 1;
  const d = Math.min(Number(m[3]), dagenInMaand(j, mnd));
  return j + "-" + tweecijfer(mnd) + "-" + tweecijfer(d);
}

export const plusJaren = (iso: string, n: number) => plusMaanden(iso, n * 12);

/** Vandaag als ISO-datum (lokale kalenderdag) */
export function vandaag(nu = new Date()): string {
  return nu.getFullYear() + "-" + tweecijfer(nu.getMonth() + 1) + "-" + tweecijfer(nu.getDate());
}

/** "2026-10-15" → "15-10-2026" */
export const nlDatum = (iso: string | null | undefined) =>
  iso && ISO.test(iso) ? iso.slice(8, 10) + "-" + iso.slice(5, 7) + "-" + iso.slice(0, 4) : "";

/** "2029-01-01" → "1 januari 2029" */
export function langeDatum(iso: string): string {
  const m = ISO.exec(iso);
  if (!m) return iso;
  const maanden = [
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "augustus",
    "september",
    "oktober",
    "november",
    "december",
  ];
  return Number(m[3]) + " " + maanden[Number(m[2]) - 1] + " " + m[1];
}
