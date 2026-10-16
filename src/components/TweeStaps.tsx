import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { schoneCode } from "@/lib/tweestaps";

const APP_NAAM = "GoHome advice";

/** Het invoerveld voor de 6-cijferige code */
function CodeVeld({
  id,
  waarde,
  zet,
  disabled,
}: {
  id: string;
  waarde: string;
  zet: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Code uit je app (6 cijfers)</Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={9}
        className="max-w-40 text-lg tracking-widest tabular-nums"
        value={waarde}
        disabled={disabled}
        onChange={(e) => zet(e.target.value)}
      />
    </div>
  );
}

/**
 * Een code-app koppelen: QR-code scannen (of de sleutel overtypen) en bevestigen met een code.
 * Oude, nooit bevestigde koppelpogingen worden eerst opgeruimd.
 */
export function KoppelCodeApp({ onKlaar }: { onKlaar: () => void }) {
  const [factor, setFactor] = useState<{ id: string; qr: string; sleutel: string } | null>(null);
  const [fout, setFout] = useState("");
  const [code, setCode] = useState("");
  const [bezig, setBezig] = useState(false);
  const gestart = useRef(false);

  useEffect(() => {
    if (gestart.current) return;
    gestart.current = true;
    void (async () => {
      try {
        const { data: lijst } = await supabase.auth.mfa.listFactors();
        for (const f of lijst?.all ?? [])
          if (f.factor_type === "totp" && f.status === "unverified")
            await supabase.auth.mfa.unenroll({ factorId: f.id });
        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          issuer: APP_NAAM,
          friendlyName: "Code-app " + new Date().toLocaleString("nl-NL"),
        });
        if (error || !data) throw new Error();
        setFactor({ id: data.id, qr: data.totp.qr_code, sleutel: data.totp.secret });
      } catch {
        setFout("Instellen lukte niet. Probeer het opnieuw, of neem contact op met een beheerder.");
      }
    })();
  }, []);

  async function bevestig(e: FormEvent) {
    e.preventDefault();
    const c = schoneCode(code);
    if (!factor || !c) return setFout("Vul de 6 cijfers uit je app in.");
    setBezig(true);
    setFout("");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: c });
    setBezig(false);
    if (error) return setFout("Deze code klopt niet of is verlopen. Probeer de volgende code.");
    onKlaar();
  }

  return (
    <form onSubmit={(e) => void bevestig(e)} className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          Open een code-app op je telefoon (bijv. Google Authenticator, Microsoft Authenticator of
          1Password).
        </li>
        <li>Scan de QR-code, of voer de sleutel eronder handmatig in.</li>
        <li>Vul de code van 6 cijfers in die de app toont.</li>
      </ol>
      {factor ? (
        <div className="space-y-2">
          <img
            src={factor.qr}
            alt="QR-code om de code-app te koppelen"
            className="size-44 rounded-lg border border-border bg-white p-2"
          />
          <p className="text-xs text-muted-foreground">
            Sleutel: <code className="break-all select-all">{factor.sleutel}</code>
          </p>
        </div>
      ) : (
        !fout && <p className="text-sm text-muted-foreground">QR-code maken…</p>
      )}
      <CodeVeld id="code-koppelen" waarde={code} zet={setCode} disabled={!factor || bezig} />
      {fout && (
        <p role="alert" className="text-sm text-destructive">
          {fout}
        </p>
      )}
      <Button type="submit" disabled={!factor || bezig}>
        {bezig ? "Controleren…" : "Bevestigen"}
      </Button>
    </form>
  );
}

/** Code invoeren bij het inloggen (er is al een gekoppelde code-app) */
export function CodeInvoeren({ onKlaar }: { onKlaar: () => void }) {
  const [factoren, setFactoren] = useState<{ id: string; naam: string }[]>([]);
  const [gekozen, setGekozen] = useState("");
  const [code, setCode] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    void supabase.auth.mfa.listFactors().then(({ data }) => {
      const lijst = (data?.totp ?? []).map((f) => ({
        id: f.id,
        naam: f.friendly_name || "Code-app",
      }));
      setFactoren(lijst);
      setGekozen(lijst[0]?.id ?? "");
    });
  }, []);

  async function controleer(e: FormEvent) {
    e.preventDefault();
    const c = schoneCode(code);
    if (!gekozen || !c) return setFout("Vul de 6 cijfers uit je app in.");
    setBezig(true);
    setFout("");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: gekozen, code: c });
    setBezig(false);
    if (error) return setFout("Deze code klopt niet of is verlopen. Probeer de volgende code.");
    onKlaar();
  }

  return (
    <form onSubmit={(e) => void controleer(e)} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Open je code-app en vul de code van 6 cijfers in voor {APP_NAAM}.
      </p>
      {factoren.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor="factor">Apparaat</Label>
          <select
            id="factor"
            className="h-9 max-w-full rounded-xl border border-input bg-background px-2 text-sm"
            value={gekozen}
            onChange={(e) => setGekozen(e.target.value)}
          >
            {factoren.map((f) => (
              <option key={f.id} value={f.id}>
                {f.naam}
              </option>
            ))}
          </select>
        </div>
      )}
      <CodeVeld id="code-invoeren" waarde={code} zet={setCode} disabled={bezig} />
      {fout && (
        <p role="alert" className="text-sm text-destructive">
          {fout}
        </p>
      )}
      <Button type="submit" disabled={bezig || !gekozen}>
        {bezig ? "Controleren…" : "Doorgaan"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Telefoon kwijt? Vraag een beheerder om je tweestapsverificatie te resetten.
      </p>
    </form>
  );
}
