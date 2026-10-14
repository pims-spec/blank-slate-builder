import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_NORMEN, type Normen } from "@/lib/wws";
import {
  maakDelenStore,
  maakInstellingenStore,
  maakKlantenStore,
  maakTellingStore,
} from "@/lib/wws/opslag";

/** Terugval voor versies zonder vastgelegde normen; de app rekent met normenQuery() */
const STANDAARD_NORMEN = DEFAULT_NORMEN as unknown as Normen;

export const tellingStore = maakTellingStore(supabase, STANDAARD_NORMEN);
export const instellingenStore = maakInstellingenStore(supabase);
export const klantenStore = maakKlantenStore(supabase);
export const delenStore = maakDelenStore(supabase);

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
