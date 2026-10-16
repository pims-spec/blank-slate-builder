-- Portefeuille-analyse over meerdere portefeuilles (gecombineerd). Vaste momentopname: de namen
-- van de portefeuilles worden meebewaard; geen foreign key op de lijst, zodat de analyse blijft
-- bestaan als een portefeuille later wordt verwijderd.
-- Rechten zoals portefeuille_analyses: lezen met een rol, opslaan met een schrijfrol,
-- verwijderen door de maker of een admin, geen update.

create table public.portefeuille_combi_analyses (
  id                  uuid primary key default gen_random_uuid(),
  titel               text not null check (char_length(titel) between 1 and 200),
  portefeuille_ids    uuid[] not null check (cardinality(portefeuille_ids) between 2 and 200),
  portefeuille_namen  text[] not null check (cardinality(portefeuille_namen) between 2 and 200),
  klant_ids           text[] not null default '{}' check (cardinality(klant_ids) <= 200),
  analyse_datum       date not null,
  venster_maanden     smallint not null default 3 check (venster_maanden between 1 and 24),
  instellingen        jsonb not null,
  ep_opgehaald_van    timestamptz,
  ep_opgehaald_tot    timestamptz,
  aantal_adressen     integer not null check (aantal_adressen >= 0),
  resultaat           jsonb not null check (octet_length(resultaat::text) <= 2000000),
  gemaakt_door        uuid default auth.uid() references public.profiles(id) on delete set null,
  gemaakt_op          timestamptz not null default now()
);
create index portefeuille_combi_analyses_gemaakt_idx
  on public.portefeuille_combi_analyses (gemaakt_op desc);

revoke all on table public.portefeuille_combi_analyses from anon;
grant select, insert, delete on table public.portefeuille_combi_analyses to authenticated;
grant all on table public.portefeuille_combi_analyses to service_role;
alter table public.portefeuille_combi_analyses enable row level security;

create policy "Combi-analyses lezen" on public.portefeuille_combi_analyses
  for select to authenticated using (public.heeft_een_rol(auth.uid()));
create policy "Combi-analyses opslaan" on public.portefeuille_combi_analyses
  for insert to authenticated
  with check (public.heeft_schrijfrol(auth.uid()) and gemaakt_door = auth.uid());
create policy "Combi-analyses verwijderen" on public.portefeuille_combi_analyses
  for delete to authenticated
  using (public.heeft_schrijfrol(auth.uid())
         and (gemaakt_door = auth.uid() or public.has_role(auth.uid(), 'admin')));
