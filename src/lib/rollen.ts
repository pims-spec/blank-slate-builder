import type { Database } from "@/integrations/supabase/types";

/** Rol in user_roles */
export type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * Effectieve rol van een gebruiker. De kijkrol sluit andere rollen uit (de database
 * dwingt dat af); mocht er toch een combinatie zijn, dan wint de kijkrol, net als
 * heeft_schrijfrol() in de database.
 */
export type Rol = "admin" | "member" | "viewer" | null;

export const ROL_LABEL: Record<Exclude<Rol, null>, string> = {
  admin: "Beheerder",
  member: "Collega",
  viewer: "Lezer",
};

export function effectieveRol(roles: readonly AppRole[]): Rol {
  if (roles.includes("viewer")) return "viewer";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("member")) return "member";
  return null;
}

export interface Rechten {
  rol: Rol;
  /** Heeft een rol: mag de app gebruiken */
  heeftToegang: boolean;
  /** Mag tellingen maken en wijzigen (member of admin, geen kijkrol) — heeft_schrijfrol() */
  magSchrijven: boolean;
  isAdmin: boolean;
  isViewer: boolean;
  /** Ziet alle tellingen van alle collega's (admin en kijkrol) */
  zietAlles: boolean;
}

export function rechtenVan(roles: readonly AppRole[]): Rechten {
  const rol = effectieveRol(roles);
  return {
    rol,
    heeftToegang: rol !== null,
    magSchrijven: rol === "admin" || rol === "member",
    isAdmin: rol === "admin",
    isViewer: rol === "viewer",
    zietAlles: rol === "admin" || rol === "viewer",
  };
}

/** Mag deze gebruiker deze telling wijzigen, delen en verwijderen? — mag_telling_bewerken() */
export function magTellingBewerken(r: Rechten, ownerId: string, userId: string): boolean {
  return r.magSchrijven && (ownerId === userId || r.isAdmin);
}

const ROLLEN_VOOR: Record<Exclude<Rol, null>, AppRole[]> = {
  admin: ["admin", "member"],
  member: ["member"],
  viewer: ["viewer"],
};

/**
 * Welke rollen weg en welke erbij om van `huidig` naar `doel` te gaan. Eerst verwijderen,
 * dan toevoegen: de database weigert de kijkrol naast een andere rol.
 */
export function rolWijzigingen(
  huidig: readonly AppRole[],
  doel: Rol,
): { verwijder: AppRole[]; voegToe: AppRole[] } {
  const nieuw = doel ? ROLLEN_VOOR[doel] : [];
  return {
    verwijder: huidig.filter((r) => !nieuw.includes(r)),
    voegToe: nieuw.filter((r) => !huidig.includes(r)),
  };
}
