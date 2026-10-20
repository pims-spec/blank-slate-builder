import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_NORMEN, type Normen } from "@/lib/wws";
import {
  haalDashboardVersies,
  maakDelenStore,
  maakInstellingenStore,
  maakKlantenStore,
  maakTellingStore,
} from "@/lib/wws/opslag";
import { maakHuurStore } from "@/lib/wws/huur/opslag";
import { maakPortefeuilleStore } from "@/lib/wws/portefeuille/opslag";

/** Terugval voor versies zonder vastgelegde normen; de app rekent met normenQuery() */
const STANDAARD_NORMEN = DEFAULT_NORMEN as unknown as Normen;

export const tellingStore = maakTellingStore(supabase, STANDAARD_NORMEN);
export const instellingenStore = maakInstellingenStore(supabase);
export const klantenStore = maakKlantenStore(supabase);
export const delenStore = maakDelenStore(supabase);
export const huurStore = maakHuurStore(supabase);

/** Opgeslagen huurprijsindicaties (de nieuwste 200) */
export const huurIndicatiesQuery = () =>
  queryOptions({
    queryKey: ["huurindicaties"],
    queryFn: () => huurStore.lijst(),
  });

export const tellingenQuery = () =>
  queryOptions({
    queryKey: ["tellingen"],
    queryFn: () => tellingStore.lijst(),
  });

/** Normen uit de database (instellingen), aangevuld met de standaard */
export const normenQuery = () =>
  queryOptions({
    queryKey: ["normen"],
    queryFn: () => instellingenStore.haalNormen(),
    staleTime: 5 * 60_000,
  });

/** Eigenaren (tabel klanten) */
export const klantenQuery = () =>
  queryOptions({
    queryKey: ["klanten"],
    queryFn: () => klantenStore.lijst(),
  });

/** Versies voor het dashboard (alleen wat het nodig heeft, limiet 5000) */
export const dashboardVersiesQuery = () =>
  queryOptions({
    queryKey: ["dashboard-versies"],
    queryFn: () => haalDashboardVersies(supabase),
  });

// ---------- portefeuille-analyse ----------
export const portefeuilleStore = maakPortefeuilleStore(supabase);

export const portefeuillesQuery = () =>
  queryOptions({ queryKey: ["portefeuilles"], queryFn: () => portefeuilleStore.lijst() });

export const portefeuilleAdressenQuery = (id: string) =>
  queryOptions({
    queryKey: ["portefeuille-adressen", id],
    queryFn: () => portefeuilleStore.adressen(id),
  });

/** Alle opgeslagen portefeuille-analyses (ook gecombineerde), voor het archief */
export const archiefAnalysesQuery = () =>
  queryOptions({
    queryKey: ["archief-analyses"],
    queryFn: () => portefeuilleStore.archiefAnalyses(),
  });

export const portefeuilleAnalysesQuery = (id: string) =>
  queryOptions({
    queryKey: ["portefeuille-analyses", id],
    queryFn: () => portefeuilleStore.analyses(id),
  });
