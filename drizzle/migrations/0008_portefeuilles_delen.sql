-- 0008_portefeuilles_delen.sql
-- Portefeuilles en alles eronder: ZIEN door de maker, met wie hij gedeeld is, een beheerder of de
-- kijkrol; BIJWERKEN (labels, adressen, Bloxs-sync, analyse opslaan) door de maker, met wie hij
-- gedeeld is, of een beheerder. Verwijderen blijft maker of beheerder (bestaande policies).
-- Delen beheren: maker of beheerder. Volledig additief: nieuwe tabel, functies en RESTRICTIVE
-- policies (die alleen extra voorwaarden toevoegen aan de bestaande).

-- 1. Delen
create table public.portefeuille_shares (
  portefeuille_id  uuid not null references public.portefeuilles(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  gedeeld_door     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  primary key (portefeuille_id, user_id)
);
create index portefeuille_shares_user_idx on public.portefeuille_shares (user_id);

revoke all on table public.portefeuille_shares from anon;
grant select, insert, delete on table public.portefeuille_shares to authenticated;
grant all on table public.portefeuille_shares to service_role;
alter table public.portefeuille_shares enable row level security;

-- 2. Hulpfuncties (security definer: geen RLS-lus tussen portefeuilles en shares)
create or replace function public.portefeuille_gedeeld_met_mij(_p uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.portefeuille_shares s
    where s.portefeuille_id = _p and s.user_id = auth.uid()
  )
$$;

create or replace function public.mag_portefeuille_zien(_p uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.heeft_een_rol(auth.uid()) and exists (
    select 1 from public.portefeuilles p
    where p.id = _p
      and (
        p.created_by = auth.uid()
        or public.has_role(auth.uid(), 'admin')
        or public.has_role(auth.uid(), 'viewer')
        or public.portefeuille_gedeeld_met_mij(p.id)
      )
  )
$$;

create or replace function public.mag_portefeuille_bewerken(_p uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.heeft_schrijfrol(auth.uid()) and exists (
    select 1 from public.portefeuilles p
    where p.id = _p
      and (
        p.created_by = auth.uid()
        or public.has_role(auth.uid(), 'admin')
        or public.portefeuille_gedeeld_met_mij(p.id)
      )
  )
$$;

create or replace function public.mag_portefeuille_delen(_p uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.heeft_schrijfrol(auth.uid()) and exists (
    select 1 from public.portefeuilles p
    where p.id = _p
      and (p.created_by = auth.uid() or public.has_role(auth.uid(), 'admin'))
  )
$$;

-- Gecombineerde analyse: zichtbaar als je alle (nog bestaande) portefeuilles mag zien
create or replace function public.mag_portefeuilles_zien(_ids uuid[])
returns boolean language sql stable security definer set search_path = public
as $$
  select public.heeft_een_rol(auth.uid())
    and exists (
      select 1 from unnest(_ids) x join public.portefeuilles p on p.id = x
    )
    and not exists (
      select 1 from unnest(_ids) x join public.portefeuilles p on p.id = x
      where not public.mag_portefeuille_zien(x)
    )
$$;

revoke all on function public.portefeuille_gedeeld_met_mij(uuid) from public, anon;
revoke all on function public.mag_portefeuille_zien(uuid) from public, anon;
revoke all on function public.mag_portefeuille_bewerken(uuid) from public, anon;
revoke all on function public.mag_portefeuille_delen(uuid) from public, anon;
revoke all on function public.mag_portefeuilles_zien(uuid[]) from public, anon;
grant execute on function public.portefeuille_gedeeld_met_mij(uuid) to authenticated;
grant execute on function public.mag_portefeuille_zien(uuid) to authenticated;
grant execute on function public.mag_portefeuille_bewerken(uuid) to authenticated;
grant execute on function public.mag_portefeuille_delen(uuid) to authenticated;
grant execute on function public.mag_portefeuilles_zien(uuid[]) to authenticated;

-- 3. Delen: zien (de gedeelde zelf, of wie mag delen), toevoegen en intrekken (maker of beheerder)
create policy "Portefeuille-delen zien" on public.portefeuille_shares
  for select to authenticated
  using (user_id = auth.uid() or public.mag_portefeuille_delen(portefeuille_id));
create policy "Portefeuille delen" on public.portefeuille_shares
  for insert to authenticated
  with check (
    public.mag_portefeuille_delen(portefeuille_id)
    and public.heeft_een_rol(user_id)
    and user_id <> auth.uid()
    and gedeeld_door = auth.uid()
  );
create policy "Portefeuille-delen intrekken" on public.portefeuille_shares
  for delete to authenticated
  using (public.mag_portefeuille_delen(portefeuille_id));

-- 4. Extra voorwaarden (RESTRICTIVE) op de bestaande tabellen
-- portefeuilles (maker inline, zodat insert ... returning van een nieuwe portefeuille werkt)
create policy "Portefeuille zien: maker, gedeeld, beheer" on public.portefeuilles
  as restrictive for select to authenticated
  using (created_by = auth.uid() or public.mag_portefeuille_zien(id));
create policy "Portefeuille bijwerken: maker, gedeeld, beheer" on public.portefeuilles
  as restrictive for update to authenticated
  using (public.mag_portefeuille_bewerken(id))
  with check (public.mag_portefeuille_bewerken(id));

-- adressen
create policy "Adressen zien: portefeuille zichtbaar" on public.portefeuille_adressen
  as restrictive for select to authenticated
  using (public.mag_portefeuille_zien(portefeuille_id));
create policy "Adressen toevoegen: portefeuille bewerkbaar" on public.portefeuille_adressen
  as restrictive for insert to authenticated
  with check (public.mag_portefeuille_bewerken(portefeuille_id));
create policy "Adressen bijwerken: portefeuille bewerkbaar" on public.portefeuille_adressen
  as restrictive for update to authenticated
  using (public.mag_portefeuille_bewerken(portefeuille_id))
  with check (public.mag_portefeuille_bewerken(portefeuille_id));
create policy "Adressen verwijderen: portefeuille bewerkbaar" on public.portefeuille_adressen
  as restrictive for delete to authenticated
  using (public.mag_portefeuille_bewerken(portefeuille_id));

-- labelresultaten
create policy "Labels zien: portefeuille zichtbaar" on public.label_resultaten
  as restrictive for select to authenticated
  using (public.mag_portefeuille_zien(portefeuille_id));
create policy "Labels toevoegen: portefeuille bewerkbaar" on public.label_resultaten
  as restrictive for insert to authenticated
  with check (public.mag_portefeuille_bewerken(portefeuille_id));
create policy "Labels bijwerken: portefeuille bewerkbaar" on public.label_resultaten
  as restrictive for update to authenticated
  using (public.mag_portefeuille_bewerken(portefeuille_id))
  with check (public.mag_portefeuille_bewerken(portefeuille_id));
create policy "Labels verwijderen: portefeuille bewerkbaar" on public.label_resultaten
  as restrictive for delete to authenticated
  using (public.mag_portefeuille_bewerken(portefeuille_id));

-- Bloxs-objecten (ook bloxs_sync_afronden, die als de gebruiker draait)
create policy "Bloxs-objecten zien: portefeuille zichtbaar" on public.bloxs_objecten
  as restrictive for select to authenticated
  using (public.mag_portefeuille_zien(portefeuille_id));
create policy "Bloxs-objecten toevoegen: portefeuille bewerkbaar" on public.bloxs_objecten
  as restrictive for insert to authenticated
  with check (public.mag_portefeuille_bewerken(portefeuille_id));
create policy "Bloxs-objecten bijwerken: portefeuille bewerkbaar" on public.bloxs_objecten
  as restrictive for update to authenticated
  using (public.mag_portefeuille_bewerken(portefeuille_id))
  with check (public.mag_portefeuille_bewerken(portefeuille_id));
create policy "Bloxs-objecten verwijderen: portefeuille bewerkbaar" on public.bloxs_objecten
  as restrictive for delete to authenticated
  using (public.mag_portefeuille_bewerken(portefeuille_id));

-- analyses van één portefeuille
create policy "Analyses zien: portefeuille zichtbaar" on public.portefeuille_analyses
  as restrictive for select to authenticated
  using (public.mag_portefeuille_zien(portefeuille_id));
create policy "Analyses opslaan: portefeuille bewerkbaar" on public.portefeuille_analyses
  as restrictive for insert to authenticated
  with check (public.mag_portefeuille_bewerken(portefeuille_id));

-- gecombineerde analyses
create policy "Combi zien: maker, beheer of alle portefeuilles zichtbaar"
  on public.portefeuille_combi_analyses
  as restrictive for select to authenticated
  using (
    gemaakt_door = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'viewer')
    or public.mag_portefeuilles_zien(portefeuille_ids)
  );
create policy "Combi opslaan: alle portefeuilles zichtbaar"
  on public.portefeuille_combi_analyses
  as restrictive for insert to authenticated
  with check (public.mag_portefeuilles_zien(portefeuille_ids));