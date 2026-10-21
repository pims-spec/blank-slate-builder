import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  BadgeEuro,
  ChartNoAxesColumn,
  Gauge,
  House,
  LayoutPanelTop,
  LogOut,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { menuOnderdelen, type MenuIcoon, type MenuOnderdeel, type MenuRechten } from "@/lib/menu";
import { Woordmerk } from "./Woordmerk";

const ICONEN: Record<MenuIcoon, LucideIcon> = {
  home: House,
  telling: Plus,
  archief: Archive,
  dashboard: ChartNoAxesColumn,
  indeling: LayoutPanelTop,
  eigenaren: Users,
  analyse: Gauge,
  huur: BadgeEuro,
  normen: SlidersHorizontal,
  gebruikers: UserCog,
  beveiliging: ShieldCheck,
};

// Navigatie zoals in GoHome UI: stille grijze items, het actieve item in Frost; op telefoon
// (≤ 720px) alleen het icoon
const itemCls =
  "gh-press group flex min-h-9 items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] font-medium whitespace-nowrap text-stil hover:bg-foreground/[0.05] hover:text-foreground max-[720px]:justify-center max-[720px]:px-0";
const actiefCls = "bg-secondary font-semibold text-foreground hover:bg-secondary";
const icoonCls =
  "grid size-6 flex-none place-items-center text-stil group-data-[status=active]:text-primary";
const labelCls = "max-[720px]:sr-only";

function Item({ o }: { o: MenuOnderdeel }) {
  const Icoon = ICONEN[o.icoon];
  return (
    <Link
      to={o.to}
      className={itemCls}
      activeProps={{ className: actiefCls, "aria-current": "page" }}
      title={o.label}
    >
      <span className={icoonCls} aria-hidden="true">
        <Icoon className="size-5" strokeWidth={1.75} />
      </span>
      <span className={labelCls}>{o.label}</span>
    </Link>
  );
}

/**
 * Zijmenu van de app: een zwevend glaspaneel (GoHome UI → Materials), breed (212px) op een
 * computer, een icoonbalk (56px) op een telefoon. De pagina zelf schuift op met `zijmenuRuimte`.
 */
export function Zijmenu(r: MenuRechten) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { hoofd, beheer } = menuOnderdelen(r);
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <nav
      aria-label="Hoofdmenu"
      className="gh-glass fixed top-2.5 bottom-2.5 left-2.5 z-40 flex w-[212px] flex-col overflow-y-auto rounded-xl px-2 py-3 max-[720px]:w-14 max-[720px]:px-1.5"
    >
      <Link
        to="/dashboard"
        className="mb-2 rounded-lg px-2 pt-1 pb-3 max-[720px]:px-0 max-[720px]:text-center"
        aria-label="GoHome advice, naar het overzicht"
      >
        <span className="max-[720px]:hidden">
          <Woordmerk className="text-base" />
        </span>
        <span className="hidden max-[720px]:inline">
          <Woordmerk className="text-base" alleenG />
        </span>
      </Link>
      <div className="flex flex-col gap-0.5">
        {hoofd.map((o) => (
          <Item key={o.to} o={o} />
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-1.5">
        {beheer.map((o) => (
          <Item key={o.to} o={o} />
        ))}
        <button type="button" className={itemCls} onClick={signOut} title="Uitloggen">
          <span className={icoonCls} aria-hidden="true">
            <LogOut className="size-5" strokeWidth={1.75} />
          </span>
          <span className={labelCls}>Uitloggen</span>
        </button>
      </div>
    </nav>
  );
}

/** Ruimte voor het zijmenu (op elke pagina met het menu) */
export const zijmenuRuimte = "pl-[222px] max-[720px]:pl-[66px]";
