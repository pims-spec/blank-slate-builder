import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChartNoAxesColumn,
  House,
  LayoutPanelTop,
  LogOut,
  Plus,
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
  normen: SlidersHorizontal,
  gebruikers: UserCog,
};

// .smitem in wws-site.html; op telefoon (≤ 720px) alleen het icoon
const itemCls =
  "group flex items-center gap-2.5 rounded-xl p-2.5 text-[13.5px] font-semibold whitespace-nowrap text-foreground hover:bg-secondary max-[720px]:justify-center max-[720px]:px-0";
const actiefCls = "bg-primary text-primary-foreground hover:bg-primary";
const icoonCls =
  "grid size-7 flex-none place-items-center rounded-[9px] bg-secondary text-primary group-data-[status=active]:bg-primary-foreground/20 group-data-[status=active]:text-primary-foreground";
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
        <Icoon className="size-[18px]" strokeWidth={2} />
      </span>
      <span className={labelCls}>{o.label}</span>
    </Link>
  );
}

/**
 * Zijmenu van de app — .sidemenu in wws-site.html: breed (212px) op een computer, een
 * icoonbalk (64px) op een telefoon. De pagina zelf schuift op met `zijmenuRuimte`.
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
      className="fixed inset-y-0 left-0 z-40 flex w-[212px] flex-col overflow-y-auto border-r border-border bg-card px-2.5 py-4 max-[720px]:w-16"
    >
      <Link
        to="/dashboard"
        className="mb-1.5 border-b border-border px-2 pt-1 pb-4 max-[720px]:px-0 max-[720px]:text-center"
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
            <LogOut className="size-[18px]" strokeWidth={2} />
          </span>
          <span className={labelCls}>Uitloggen</span>
        </button>
      </div>
    </nav>
  );
}

/** Ruimte voor het zijmenu (op elke pagina met het menu) */
export const zijmenuRuimte = "pl-[212px] max-[720px]:pl-16";
