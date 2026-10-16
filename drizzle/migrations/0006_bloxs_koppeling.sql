-- 0006_bloxs_koppeling.sql
-- Bloxs-koppeling portefeuille-analyse. Volledig additief: niets hernoemd, verwijderd of vervangen.
-- Rechten zoals 0005: lezen met een rol, schrijven met een schrijfrol.
--
-- VEROUDERD: portefeuilles.bloks_id en portefeuille_adressen.bloks_object_id zijn leeg en worden
-- niet meer door de code gebruikt (de nieuwe kolommen en bloxs_objecten vervangen ze).
-- Bron 'bloks' in portefeuilles.bron betekent Bloxs (oude spelling; de bestaande check-constraint
-- blijft ongewijzigd). De code noemt dit 'bloxs'.

-- 1. Portefeuilles: selectie in Bloxs
alter table public.portefeuilles
  add column bloxs_eigenaar_ref        text check (char_length(bloxs_eigenaar_ref) between 1 and 100),
  add column bloxs_complex_ref         text check (char_length(bloxs_complex_ref) between 1 and 100),
  add column bloxs_gesynchroniseerd_op timestamptz;

alter table public.portefeuilles
  add constraint portefeuilles_bloxs_selectie
  check (bron <> 'bloks' or bloxs_eigenaar_ref is not null or bloxs_complex_ref is not null);

-- 2. Adressen: volledig adres voor lijsten en PDF, en markering i.p.v. verwijderen
alter table public.portefeuille_adressen
  add column straat               text check (char_length(straat) <= 200),
  add column woonplaats           text check (char_length(woonplaats) <= 100),
  add column niet_in_bloxs_sinds  timestamptz;

-- 3. Objecten uit Bloxs (meerdere objecten kunnen één adres delen)
create table public.bloxs_objecten (
  id                uuid primary key default gen_random_uuid(),
  portefeuille_id   uuid not null references public.portefeuilles(id) on delete cascade,
  soort             text not null check (soort in ('unit', 'building')),
  bloxs_ref         text not null check (char_length(bloxs_ref) between 1 and 100),
  adres_id          uuid,
  sync_id           uuid not null,
  laatst_gezien_op  timestamptz not null default now(),
  unique (portefeuille_id, soort, bloxs_ref),
  foreign key (adres_id, portefeuille_id)
    references public.portefeuille_adressen (id, portefeuille_id) on delete set null (adres_id)
);
create index bloxs_objecten_adres_idx on public.bloxs_objecten (adres_id);

revoke all on table public.bloxs_objecten from anon;
grant select, insert, update, delete on table public.bloxs_objecten to authenticated;
grant all on table public.bloxs_objecten to service_role;
alter table public.bloxs_objecten enable row level security;

create policy "Bloxs-objecten lezen" on public.bloxs_objecten
  for select to authenticated using (public.heeft_een_rol(auth.uid()));
create policy "Bloxs-objecten toevoegen" on public.bloxs_objecten
  for insert to authenticated with check (public.heeft_schrijfrol(auth.uid()));
create policy "Bloxs-objecten bijwerken" on public.bloxs_objecten
  for update to authenticated
  using (public.heeft_schrijfrol(auth.uid())) with check (public.heeft_schrijfrol(auth.uid()));
create policy "Bloxs-objecten verwijderen" on public.bloxs_objecten
  for delete to authenticated using (public.heeft_schrijfrol(auth.uid()));

-- 4. Sync afronden: alleen na een volledige sync. Security invoker, dus RLS geldt.
create or replace function public.bloxs_sync_afronden(p_portefeuille uuid, p_sync uuid)
returns table (vervallen_objecten integer, gemarkeerd integer, teruggekeerd integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_obj integer; v_mark integer; v_terug integer;
begin
  if not public.heeft_schrijfrol(auth.uid()) then
    raise exception 'Geen schrijfrol' using errcode = '42501';
  end if;

  delete from public.bloxs_objecten
   where portefeuille_id = p_portefeuille and sync_id <> p_sync;
  get diagnostics v_obj = row_count;

  update public.portefeuille_adressen a set niet_in_bloxs_sinds = null
   where a.portefeuille_id = p_portefeuille and a.niet_in_bloxs_sinds is not null
     and exists (select 1 from public.bloxs_objecten o where o.adres_id = a.id);
  get diagnostics v_terug = row_count;

  update public.portefeuille_adressen a set niet_in_bloxs_sinds = now()
   where a.portefeuille_id = p_portefeuille and a.niet_in_bloxs_sinds is null
     and not exists (select 1 from public.bloxs_objecten o where o.adres_id = a.id);
  get diagnostics v_mark = row_count;

  update public.portefeuilles set bloxs_gesynchroniseerd_op = now() where id = p_portefeuille;

  return query select v_obj, v_mark, v_terug;
end;
$$;

revoke all on function public.bloxs_sync_afronden(uuid, uuid) from public, anon;
grant execute on function public.bloxs_sync_afronden(uuid, uuid) to authenticated;