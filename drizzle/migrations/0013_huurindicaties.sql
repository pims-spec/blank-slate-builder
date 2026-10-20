-- 0013_huurindicaties.sql
-- Huurprijsindicator: opgeslagen indicaties. Volledig additief: een nieuwe tabel met eigen policies.
-- Geen persoonsgegevens: alleen het adres van de woning, de antwoorden en de uitkomst.
-- `data` bevat ook een snapshot van de gebruikte bronregel en factoren, zodat een oude indicatie
-- uitlegbaar blijft als de referentietabel later verandert.

create table public.huurindicaties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  postcode text not null check (postcode ~ '^[1-9][0-9]{3}[A-Z]{2}$'),
  huisnummer text not null check (char_length(huisnummer) between 1 and 20),
  straat text not null default '' check (char_length(straat) <= 200),
  plaats text not null default '' check (char_length(plaats) <= 200),
  klant_id text references public.klanten(id) on delete set null,
  telling_id text references public.tellingen(id) on delete set null,
  data jsonb not null check (octet_length(data::text) <= 200000),
  created_at timestamptz not null default now()
);
create index huurindicaties_owner_created_idx on public.huurindicaties (owner_id, created_at desc);
create index huurindicaties_adres_idx on public.huurindicaties (postcode, huisnummer);

grant select, insert, update, delete on public.huurindicaties to authenticated;
grant all on public.huurindicaties to service_role;

alter table public.huurindicaties enable row level security;

-- lezen: eigen indicaties, admin en de kijkrol (zoals tellingen)
create policy "Huurindicaties lezen" on public.huurindicaties
  for select to authenticated
  using (
    owner_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'viewer')
  );

-- maken: alleen met de schrijfrol, altijd als eigenaar
create policy "Huurindicaties maken" on public.huurindicaties
  for insert to authenticated
  with check (owner_id = auth.uid() and public.heeft_schrijfrol(auth.uid()));

-- bijwerken (bijv. een telling koppelen) en verwijderen: eigenaar of admin, met de schrijfrol
create policy "Huurindicaties bijwerken" on public.huurindicaties
  for update to authenticated
  using (
    public.heeft_schrijfrol(auth.uid())
    and (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  )
  with check (
    public.heeft_schrijfrol(auth.uid())
    and (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  );

create policy "Huurindicaties verwijderen" on public.huurindicaties
  for delete to authenticated
  using (
    public.heeft_schrijfrol(auth.uid())
    and (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  );

-- tweestapsverificatie verplicht, zoals op alle andere tabellen (0009)
create policy "Alleen met tweestapsverificatie" on public.huurindicaties
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');
