-- Fase 2b-1, migratie B: delen, eigenaren, instellingen en de kijkrol in de RLS-regels.
-- Uitvoeren NA migratie A (alter type public.app_role add value 'viewer').
--
-- Schrijfrechten (insert/update/delete) lopen in ALLE policies hieronder via
-- heeft_schrijfrol(): member of admin, en géén viewer. De kijkrol kan dus nergens schrijven:
--   tellingen        insert/update/delete  -> heeft_schrijfrol
--   telling_versies  insert/update/delete  -> mag_telling_bewerken -> heeft_schrijfrol
--   telling_shares   insert/delete         -> mag_telling_bewerken -> heeft_schrijfrol
--   klanten          insert/update/delete  -> heeft_schrijfrol (+ admin voor update/delete)
--   instellingen     insert/update         -> heeft_schrijfrol + admin
-- Een gedeelde telling is voor de ontvanger alleen-lezen: lezen gaat via mag_telling_zien,
-- schrijven alleen voor eigenaar of admin.

-- ---------- hulpfuncties ----------
create or replace function public.heeft_een_rol(_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id) $$;

create or replace function public.heeft_schrijfrol(_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select (public.has_role(_user_id, 'member') or public.has_role(_user_id, 'admin'))
     and not public.has_role(_user_id, 'viewer')
$$;

-- ---------- de kijkrol sluit andere rollen uit ----------
create or replace function public.user_roles_exclusief()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.role = 'viewer'
     and exists (select 1 from public.user_roles where user_id = new.user_id and role <> 'viewer') then
    raise exception 'De kijkrol kan niet samen met een andere rol: haal eerst de andere rollen weg.';
  end if;
  if new.role <> 'viewer'
     and exists (select 1 from public.user_roles where user_id = new.user_id and role = 'viewer') then
    raise exception 'Deze gebruiker heeft de kijkrol: haal die eerst weg.';
  end if;
  return new;
end; $$;

create trigger user_roles_exclusief
before insert on public.user_roles
for each row execute function public.user_roles_exclusief();

-- Een admin kan zichzelf niet de kijkrol geven. (Eigen rollen intrekken kon al niet:
-- "Admins revoke roles" vereist user_id <> auth.uid(), dus ook de eigen admin-rol blijft.)
drop policy "Admins grant roles" on public.user_roles;
create policy "Admins grant roles" on public.user_roles
  for insert to authenticated
  with check (
    public.has_role(auth.uid(), 'admin')
    and not (role = 'viewer' and user_id = auth.uid())
  );

-- ---------- profielen: collega's met een rol zien elkaar ----------
-- Wie nog op toegang wacht, ziet geen collega's en verschijnt zelf ook niet (behalve voor
-- admins, via "Admins read all profiles").
create policy "Collega's lezen profielen" on public.profiles
  for select to authenticated
  using (public.heeft_een_rol(auth.uid()) and public.heeft_een_rol(id));

-- ---------- delen ----------
create table public.telling_shares (
  telling_id text not null references public.tellingen(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  gedeeld_door uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (telling_id, user_id)
);
create index telling_shares_user_idx on public.telling_shares (user_id);

grant select, insert, delete on public.telling_shares to authenticated;
grant all on public.telling_shares to service_role;
alter table public.telling_shares enable row level security;

-- Is deze telling met de huidige gebruiker gedeeld? (security definer: geen RLS-lus
-- tussen tellingen en telling_shares)
create or replace function public.is_gedeeld_met_mij(_telling_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.telling_shares s
    where s.telling_id = _telling_id and s.user_id = auth.uid()
  )
$$;

-- Bewerken: eigenaar of admin, en geen kijkrol (vervangt de versie uit 0001)
create or replace function public.mag_telling_bewerken(_telling_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.heeft_schrijfrol(auth.uid()) and exists (
    select 1 from public.tellingen t
    where t.id = _telling_id
      and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  )
$$;

-- Zien: eigenaar, admin, kijkrol, of gedeeld met mij (en ik heb nog een rol)
create or replace function public.mag_telling_zien(_telling_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tellingen t
    where t.id = _telling_id
      and (
        t.owner_id = auth.uid()
        or public.has_role(auth.uid(), 'admin')
        or public.has_role(auth.uid(), 'viewer')
        or (public.heeft_een_rol(auth.uid()) and public.is_gedeeld_met_mij(t.id))
      )
  )
$$;

create policy "Delen zien" on public.telling_shares
  for select to authenticated
  using (user_id = auth.uid() or public.mag_telling_bewerken(telling_id));

-- Alleen eigenaar/admin deelt, alleen met iemand die een rol heeft, niet met zichzelf,
-- en "gedeeld door" is altijd de gebruiker zelf
create policy "Delen toevoegen" on public.telling_shares
  for insert to authenticated
  with check (
    public.mag_telling_bewerken(telling_id)
    and public.heeft_een_rol(user_id)
    and user_id <> auth.uid()
    and gedeeld_door = auth.uid()
  );

create policy "Delen intrekken" on public.telling_shares
  for delete to authenticated
  using (public.mag_telling_bewerken(telling_id));

-- ---------- tellingen: lezen incl. kijkrol en gedeeld; schrijven nooit voor de kijkrol ----------
drop policy "Eigen tellingen of admin: lezen" on public.tellingen;
create policy "Tellingen lezen" on public.tellingen
  for select to authenticated
  using (
    owner_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'viewer')
    or (public.heeft_een_rol(auth.uid()) and public.is_gedeeld_met_mij(id))
  );

drop policy "Leden maken eigen tellingen" on public.tellingen;
create policy "Leden maken eigen tellingen" on public.tellingen
  for insert to authenticated
  with check (owner_id = auth.uid() and public.heeft_schrijfrol(auth.uid()));

drop policy "Eigen tellingen of admin: bewerken" on public.tellingen;
create policy "Eigen tellingen of admin: bewerken" on public.tellingen
  for update to authenticated
  using (
    public.heeft_schrijfrol(auth.uid())
    and (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  )
  with check (
    public.heeft_schrijfrol(auth.uid())
    and (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  );

drop policy "Eigen tellingen of admin: verwijderen" on public.tellingen;
create policy "Eigen tellingen of admin: verwijderen" on public.tellingen
  for delete to authenticated
  using (
    public.heeft_schrijfrol(auth.uid())
    and (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  );

-- telling_versies: lezen zoals de telling; schrijven via mag_telling_bewerken (hierboven
-- aangescherpt), de bestaande insert/update/delete-policies blijven daarom ongewijzigd.
drop policy "Versies lezen" on public.telling_versies;
create policy "Versies lezen" on public.telling_versies
  for select to authenticated
  using (public.mag_telling_zien(telling_id));

-- ---------- eigenaren (klanten) ----------
create table public.klanten (
  id text primary key default gen_random_uuid()::text,
  naam text not null check (btrim(naam) <> ''),
  pve jsonb not null default '[]'::jsonb,            -- lijst van genaamde PvE's (fase 2b-2)
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index klanten_naam_uniek on public.klanten (lower(btrim(naam)));

create or replace function public.klanten_set_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at = now(); return new; end; $$;
create trigger klanten_set_updated_at
before update on public.klanten
for each row execute function public.klanten_set_updated_at();

grant select, insert, update, delete on public.klanten to authenticated;
grant all on public.klanten to service_role;
alter table public.klanten enable row level security;

create policy "Eigenaren lezen" on public.klanten
  for select to authenticated using (public.heeft_een_rol(auth.uid()));
create policy "Eigenaren toevoegen" on public.klanten
  for insert to authenticated
  with check (public.heeft_schrijfrol(auth.uid()) and created_by = auth.uid());
create policy "Eigenaren bewerken (admin)" on public.klanten
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin') and public.heeft_schrijfrol(auth.uid()))
  with check (public.has_role(auth.uid(), 'admin') and public.heeft_schrijfrol(auth.uid()));
create policy "Eigenaren verwijderen (admin)" on public.klanten
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin') and public.heeft_schrijfrol(auth.uid()));

-- ---------- instellingen (normen en standaardkosten) ----------
create table public.instellingen (
  key text primary key,                              -- 'normen'
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null
);

create or replace function public.instellingen_set_gewijzigd()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end; $$;
create trigger instellingen_set_gewijzigd
before update on public.instellingen
for each row execute function public.instellingen_set_gewijzigd();

grant select, insert, update on public.instellingen to authenticated;
grant all on public.instellingen to service_role;
alter table public.instellingen enable row level security;

create policy "Instellingen lezen" on public.instellingen
  for select to authenticated using (public.heeft_een_rol(auth.uid()));
create policy "Instellingen toevoegen (admin)" on public.instellingen
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin') and public.heeft_schrijfrol(auth.uid()));
create policy "Instellingen bewerken (admin)" on public.instellingen
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin') and public.heeft_schrijfrol(auth.uid()))
  with check (public.has_role(auth.uid(), 'admin') and public.heeft_schrijfrol(auth.uid()));