// Nep-Supabase voor tests van de opslag: legt elke querybouwer-aanroep vast en geeft
// per query een antwoord. Alleen voor tests.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface Aanroep {
  tabel: string;
  stappen: [string, unknown[]][];
}
export interface Antwoord {
  data?: unknown;
  error?: unknown;
}

export function nepDb(antwoord: (a: Aanroep) => Antwoord = () => ({})) {
  const log: Aanroep[] = [];
  const db = {
    from(tabel: string) {
      const a: Aanroep = { tabel, stappen: [] };
      log.push(a);
      const bouwer: object = new Proxy(
        {},
        {
          get(_doel, prop) {
            if (prop === "then") {
              const res = { data: null, error: null, ...antwoord(a) };
              return (ok: (r: unknown) => unknown, fout: (e: unknown) => unknown) =>
                Promise.resolve(res).then(ok, fout);
            }
            return (...args: unknown[]) => {
              a.stappen.push([String(prop), args]);
              return bouwer;
            };
          },
        },
      );
      return bouwer;
    },
  };
  return { db: db as unknown as SupabaseClient<Database>, log };
}

export const stap = (a: Aanroep | undefined, naam: string) =>
  a?.stappen.find(([s]) => s === naam)?.[1];
