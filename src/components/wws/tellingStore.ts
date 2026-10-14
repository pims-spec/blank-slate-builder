import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_NORMEN, type Normen } from "@/lib/wws";
import { maakTellingStore } from "@/lib/wws/opslag";

/** De normen waarmee de app rekent (nog niet instelbaar in deze fase) */
export const NORMEN = DEFAULT_NORMEN as unknown as Normen;

export const tellingStore = maakTellingStore(supabase, NORMEN);

export const tellingenQuery = () =>
  queryOptions({
    queryKey: ["tellingen"],
    queryFn: () => tellingStore.lijst(),
  });
