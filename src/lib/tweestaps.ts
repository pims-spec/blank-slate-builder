// Tweestapsverificatie (TOTP met een code-app), verplicht voor iedereen. De stap na het inloggen
// volgt uit het niveau van de sessie (Supabase: aal1 = alleen wachtwoord of Google, aal2 = ook de
// code) en of er al een geverifieerde code-app is.

export type TweestapsStap = "ok" | "instellen" | "code";

export function tweestapsStap(aal: {
  currentLevel: string | null;
  nextLevel: string | null;
}): TweestapsStap {
  if (aal.currentLevel === "aal2") return "ok";
  // er is een geverifieerde code-app: code invoeren; anders eerst een code-app koppelen
  return aal.nextLevel === "aal2" ? "code" : "instellen";
}

/** Alleen een pad binnen de app als terugkeeradres ("/archief?tab=…"), nooit een andere site */
export function veiligPad(redirect: string | undefined, standaard = "/dashboard"): string {
  if (!redirect) return standaard;
  try {
    const u = new URL(redirect, "https://app.invalid");
    if (u.origin !== "https://app.invalid" && u.origin !== globalThis.location?.origin)
      return standaard;
    const pad = u.pathname + u.search + u.hash;
    return pad.startsWith("/") && !pad.startsWith("//") && !pad.startsWith("/tweestaps")
      ? pad
      : standaard;
  } catch {
    return standaard;
  }
}

/** Een code uit een code-app: 6 cijfers (spaties en streepjes mogen) */
export function schoneCode(invoer: string): string | null {
  const c = invoer.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(c) ? c : null;
}
