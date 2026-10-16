// De onderdelen van het zijmenu (.sidemenu in wws-site.html), per rol. Eén lijst: een nieuw
// onderdeel (bijv. later "Portefeuille-analyse") is één regel erbij, met een rechtencheck.

export type MenuIcoon =
  | "home"
  | "telling"
  | "archief"
  | "indeling"
  | "dashboard"
  | "analyse"
  | "eigenaren"
  | "normen"
  | "gebruikers";

export interface MenuOnderdeel {
  to:
    | "/dashboard"
    | "/wws"
    | "/archief"
    | "/indeling"
    | "/portefeuille"
    | "/eigenaren"
    | "/portefeuille-analyse"
    | "/normen"
    | "/admin";
  label: string;
  icoon: MenuIcoon;
}

export interface MenuRechten {
  isAdmin?: boolean | undefined;
  heeftToegang?: boolean | undefined;
  zietAlles?: boolean | undefined;
  magSchrijven?: boolean | undefined;
}

/** Hoofdmenu, in de volgorde van de bron; beheer (Normen, Gebruikers) onderaan bij admins */
export function menuOnderdelen(r: MenuRechten): {
  hoofd: MenuOnderdeel[];
  beheer: MenuOnderdeel[];
} {
  const hoofd: MenuOnderdeel[] = [{ to: "/dashboard", label: "Overzicht", icoon: "home" }];
  if (r.heeftToegang !== false) {
    hoofd.push({ to: "/wws", label: "Puntentelling", icoon: "telling" });
    if (r.magSchrijven)
      hoofd.push({ to: "/indeling", label: "Indelingsadvies", icoon: "indeling" });
    hoofd.push({ to: "/archief", label: "Archief", icoon: "archief" });
    if (r.zietAlles || r.isAdmin)
      hoofd.push({ to: "/portefeuille", label: "Dashboard", icoon: "dashboard" });
    // portefeuille-analyse: bekijken voor iedereen met een rol (ook de kijkrol)
    hoofd.push({ to: "/portefeuille-analyse", label: "Portefeuille-analyse", icoon: "analyse" });
    hoofd.push({ to: "/eigenaren", label: "Eigenaren", icoon: "eigenaren" });
  }
  const beheer: MenuOnderdeel[] = r.isAdmin
    ? [
        { to: "/normen", label: "Normen", icoon: "normen" },
        { to: "/admin", label: "Gebruikers", icoon: "gebruikers" },
      ]
    : [];
  return { hoofd, beheer };
}
