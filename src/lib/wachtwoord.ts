// Nederlandse melding bij een mislukt wachtwoord instellen (uitnodiging of nieuw wachtwoord). We
// geven nooit de ruwe melding van Supabase door, alleen een eigen tekst per foutcode.

interface AuthFout {
  code?: string | undefined;
  status?: number | undefined;
  /** Bij "weak_password": welke regels niet gehaald zijn (length, characters, pwned) */
  reasons?: readonly string[] | undefined;
}

export function wachtwoordFout(fout: AuthFout | null | undefined): string {
  const code = fout?.code ?? "";
  if (code === "weak_password") {
    const r = fout?.reasons ?? [];
    if (r.includes("pwned"))
      return "Dit wachtwoord komt voor in bekende datalekken. Kies een ander wachtwoord.";
    if (r.includes("length")) return "Het wachtwoord is te kort. Kies een langer wachtwoord.";
    if (r.includes("characters"))
      return "Het wachtwoord is te eenvoudig. Gebruik kleine letters, hoofdletters, cijfers en een symbool.";
    return "Het wachtwoord is niet sterk genoeg. Kies een langer of ingewikkelder wachtwoord.";
  }
  if (code === "same_password") return "Kies een ander wachtwoord dan je huidige.";
  if (code === "insufficient_aal")
    return "Vul eerst de code uit je code-app in; daarna kun je het wachtwoord instellen.";
  if (code === "reauthentication_needed")
    return "Log opnieuw in via de link in je e-mail en probeer het nog eens.";
  if (code === "session_not_found" || code === "session_expired" || fout?.status === 401)
    return "De link is verlopen. Vraag een nieuwe uitnodiging of een nieuwe resetlink aan.";
  if (code === "over_request_rate_limit")
    return "Te veel pogingen. Wacht een paar minuten en probeer het opnieuw.";
  return "Het wachtwoord kon niet worden ingesteld. Probeer het opnieuw.";
}
