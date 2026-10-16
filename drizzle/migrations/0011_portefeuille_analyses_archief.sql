create table public.portefeuille_analyses_archief (
  id                 uuid primary key,
  portefeuille_id    uuid not null,
  portefeuille_naam  text not null check (char_length(portefeuille_naam) between 1 and 200),
  klant_id           text,
  analyse_datum      date not null,
  venster_maanden    smallint not null,
  instellingen       jsonb not null,
  ep_opgehaald_van   timestamptz,
  ep_opgehaald_tot   timestamptz,
  aantal_adressen    integer not null,
  resultaat          jsonb not null,
  gemaakt_door       uuid references public.profiles(id) on delete set null,
  gemaakt_op         timestamptz not null,
  gearchiveerd_op    timestamptz not null default now()
);
create index portefeuille_analyses_archief_gemaakt_idx
  on public.portefeuille_analyses_archief (gemaakt_op desc);

revoke all on table public.portefeuille_analyses_archief from anon;
grant select, delete on table public.portefeuille_analyses_archief to authenticated;
grant all on table public.portefeuille_analyses_archief to service_role;
alter table public.portefeuille_analyses_archief enable row level security;

create policy "Archief-analyses lezen" on public.portefeuille_analyses_archief
  for select to authenticated
  using (
    public.heeft_een_rol(auth.uid())
    and (gemaakt_door = auth.uid()
         or public.has_role(auth.uid(), 'admin')
         or public.has_role(auth.uid(), 'viewer'))
  );
create policy "Archief-analyses verwijderen" on public.portefeuille_analyses_archief
  for delete to authenticated
  using (
    public.heeft_schrijfrol(auth.uid())
    and (gemaakt_door = auth.uid() or public.has_role(auth.uid(), 'admin'))
  );
create policy "Alleen met tweestapsverificatie" on public.portefeuille_analyses_archief
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create or replace function public.portefeuille_analyses_bewaren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.portefeuille_analyses_archief (
    id, portefeuille_id, portefeuille_naam, klant_id, analyse_datum, venster_maanden,
    instellingen, ep_opgehaald_van, ep_opgehaald_tot, aantal_adressen, resultaat,
    gemaakt_door, gemaakt_op
  )
  select a.id, old.id, left(old.naam, 200), old.klant_id::text, a.analyse_datum, a.venster_maanden,
         a.instellingen, a.ep_opgehaald_van, a.ep_opgehaald_tot, a.aantal_adressen, a.resultaat,
         a.gemaakt_door, a.gemaakt_op
    from public.portefeuille_analyses a
   where a.portefeuille_id = old.id
  on conflict (id) do nothing;
  return old;
end;
$$;
revoke all on function public.portefeuille_analyses_bewaren() from public, anon, authenticated;

create trigger portefeuille_analyses_bewaren
  before delete on public.portefeuilles
  for each row execute function public.portefeuille_analyses_bewaren();