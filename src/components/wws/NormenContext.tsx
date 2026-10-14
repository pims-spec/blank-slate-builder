import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_NORMEN, type Normen } from "@/lib/wws";

/** De normen waarmee de app rekent: uit de database (instellingen), anders de standaard. */
const NormenContext = createContext<Normen>(DEFAULT_NORMEN as unknown as Normen);

export function NormenProvider({ normen, children }: { normen: Normen; children: ReactNode }) {
  return <NormenContext.Provider value={normen}>{children}</NormenContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useNormen = () => useContext(NormenContext);
