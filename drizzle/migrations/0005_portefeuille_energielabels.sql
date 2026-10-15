-- Portefeuille-analyse energielabels
-- Lezen: iedereen met een rol (ook de kijkrol). Schrijven en analyses: alleen met een schrijfrol.
-- Portefeuilles en analyses verwijderen: alleen de maker of een admin.

-- updated_at bijhouden; created_by en created_at kunnen bij een update niet veranderen
create or replace function public.portefeuille_bijgewerkt()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

-- 1. Portefeuilles (later ook uit Bloks: bron + bloks_id)
create table public.portefeuilles (
  id          uuid primary key default gen_random_uuid(),
  naam        text not null check (char_length(naam) between 1 and 200),
  klant_id    text references public.klanten(id) on delete set null,
  bron        text not null default 'import' check (bron in ('import', 'bloks')),
  bloks_id    text check (char_length(bloks_id) <= 100),
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger portefeuilles_bijgewerkt
  before update on public.portefeuilles
  for each row execute function public.portefeuille_bijgewerkt();

-- 2. Adressen per portefeuille (genormaliseerd: postcode zonder spatie in hoofdletters,
--    huisletter en toevoeging leeg of ingevuld; dubbele adressen per portefeuille kunnen niet)
create table public.portefeuille_adressen (
  id               uuid primary key default gen_random_uuid(),
  portefeuille_id  uuid not null references public.portefeuilles(id) on delete cascade,
  postcode         text not null check (postcode ~ '^[1-9][0-9]{3}[A-Z]{2}$'),
  huisnummer       integer not null check (huisnummer between 1 and 99999),
  huisletter       text not null default '' check (huisletter ~ '^[A-Z]?$'),
  toevoeging       text not null default '' check (toevoeging ~ '^[A-Z0-9]{0,10}$'),
  bloks_object_id  text check (char_length(bloks_object_id) <= 100),
  bag_id           text check (bag_id ~ '^[0-9]{16}$'),
  created_at       timestamptz not null default now(),
  unique (portefeuille_id, postcode, huisnummer, huisletter, toevoeging),
  unique (id, portefeuille_id)
);
create index portefeuille_adressen_portefeuille on public.portefeuille_adressen (portefeuille_id);

-- 3. Laatste EP-Online-resultaat per adres (bijgewerkt door "opnieuw ophalen").
--    portefeuille_id staat erbij voor snel opvragen; de samengestelde sleutel dwingt af dat
--    die bij het adres hoort.
create table public.label_resultaten (
  adres_id          uuid primary key,
  portefeuille_id   uuid not null,
  status            text not null check (status in ('gevonden', 'niet_gevonden', 'meerdere', 'fout')),
  energieklasse     text check (char_length(energieklasse) <= 10),
  registratiedatum  date,
  geldig_tot        date,
  opnamedatum       date,
  energie_index     numeric(6, 3),
  gebouwtype        text check (char_length(gebouwtype) <= 100),
  opgehaald_op      timestamptz not null default now(),
  opgehaald_door    uuid default auth.uid() references public.profiles(id) on delete set null,
  foreign key (adres_id, portefeuille_id)
    references public.portefeuille_adressen (id, portefeuille_id) on delete cascade
);
create index label_resultaten_portefeuille on public.label_resultaten (portefeuille_id);

-- 4. Opgeslagen analyses: een vastgelegde momentopname (instellingen + uitkomst),
--    zodat een analyse later precies zo terug te zien is. Niet te wijzigen, wel te verwijderen.
create table public.portefeuille_analyses (
  id                uuid primary key default gen_random_uuid(),
  portefeuille_id   uuid not null references public.portefeuilles(id) on delete cascade,
  analyse_datum     date not null,
  venster_maanden   smallint not null default 3 check (venster_maanden between 1 and 24),
  instellingen      jsonb not null,  -- EFG-regels en grens 'verouderd' zoals gebruikt
  ep_opgehaald_van  timestamptz,     -- oudste opgehaald_op in de analyse
  ep_opgehaald_tot  timestamptz,     -- nieuwste opgehaald_op
  aantal_adressen   integer not null check (aantal_adressen >= 0),
  resultaat         jsonb not null check (octet_length(resultaat::text) <= 2000000),
  gemaakt_door      uuid default auth.uid() references public.profiles(id) on delete set null,
  gemaakt_op        timestamptz not null default now()
);
create index portefeuille_analyses_portefeuille
  on public.portefeuille_analyses (portefeuille_id, gemaakt_op desc);

-- Rechten
revoke all on table public.portefeuilles, public.portefeuille_adressen,
  public.label_resultaten, public.portefeuille_analyses from anon;
grant select, insert, update, delete on table public.portefeuilles,
  public.portefeuille_adressen, public.label_resultaten to authenticated;
grant select, insert, delete on table public.portefeuille_analyses to authenticated;
grant all on table public.portefeuilles, public.portefeuille_adressen,
  public.label_resultaten, public.portefeuille_analyses to service_role;

-- RLS
alter table public.portefeuilles          enable row level security;
alter table public.portefeuille_adressen  enable row level security;
alter table public.label_resultaten       enable row level security;
alter table public.portefeuille_analyses  enable row level security;

-- portefeuilles
create policy "Portefeuilles lezen" on public.portefeuilles
  for select to authenticated using (public.heeft_een_rol(auth.uid()));
create policy "Portefeuilles toevoegen" on public.portefeuilles
  for insert to authenticated
  with check (public.heeft_schrijfrol(auth.uid()) and created_by = auth.uid());
create policy "Portefeuilles bewerken" on public.portefeuilles
  for update to authenticated
  using (public.heeft_schrijfrol(auth.uid())) with check (public.heeft_schrijfrol(auth.uid()));
create policy "Portefeuilles verwijderen" on public.portefeuilles
  for delete to authenticated
  using (public.heeft_schrijfrol(auth.uid())
         and (created_by = auth.uid() or public.has_role(auth.uid(), 'admin')));

-- adressen
create policy "Portefeuille-adressen lezen" on public.portefeuille_adressen
  for select to authenticated using (public.heeft_een_rol(auth.uid()));
create policy "Portefeuille-adressen toevoegen" on public.portefeuille_adressen
  for insert to authenticated with check (public.heeft_schrijfrol(auth.uid()));
create policy "Portefeuille-adressen bewerken" on public.portefeuille_adressen
  for update to authenticated
  using (public.heeft_schrijfrol(auth.uid())) with check (public.heeft_schrijfrol(auth.uid()));
create policy "Portefeuille-adressen verwijderen" on public.portefeuille_adressen
  for delete to authenticated using (public.heeft_schrijfrol(auth.uid()));

-- labelresultaten
create policy "Labelresultaten lezen" on public.label_resultaten
  for select to authenticated using (public.heeft_een_rol(auth.uid()));
create policy "Labelresultaten toevoegen" on public.label_resultaten
  for insert to authenticated
  with check (public.heeft_schrijfrol(auth.uid()) and opgehaald_door = auth.uid());
create policy "Labelresultaten bijwerken" on public.label_resultaten
  for update to authenticated
  using (public.heeft_schrijfrol(auth.uid()))
  with check (public.heeft_schrijfrol(auth.uid()) and opgehaald_door = auth.uid());
create policy "Labelresultaten verwijderen" on public.label_resultaten
  for delete to authenticated using (public.heeft_schrijfrol(auth.uid()));

-- analyses (geen update: een opgeslagen analyse blijft zoals hij was)
create policy "Analyses lezen" on public.portefeuille_analyses
  for select to authenticated using (public.heeft_een_rol(auth.uid()));
create policy "Analyses opslaan" on public.portefeuille_analyses
  for insert to authenticated
  with check (public.heeft_schrijfrol(auth.uid()) and gemaakt_door = auth.uid());
create policy "Analyses verwijderen" on public.portefeuille_analyses
  for delete to authenticated
  using (public.heeft_schrijfrol(auth.uid())
         and (gemaakt_door = auth.uid() or public.has_role(auth.uid(), 'admin')));
