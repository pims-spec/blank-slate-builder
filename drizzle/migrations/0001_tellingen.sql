create table public.tellingen (
  id text primary key default gen_random_uuid()::text,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tellingen_owner_updated_idx on public.tellingen (owner_id, updated_at desc);
create index tellingen_updated_idx on public.tellingen (updated_at desc);

create table public.telling_versies (
  telling_id text not null references public.tellingen(id) on delete cascade,
  id text not null,
  nr integer not null check (nr > 0),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (telling_id, id),
  unique (telling_id, nr)
);

create or replace function public.tellingen_set_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at = now(); return new; end; $$;

create trigger tellingen_set_updated_at
before update on public.tellingen
for each row execute function public.tellingen_set_updated_at();

create or replace function public.mag_telling_bewerken(_telling_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tellingen t
    where t.id = _telling_id
      and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  )
$$;

grant select, insert, update, delete on public.tellingen to authenticated;
grant select, insert, update, delete on public.telling_versies to authenticated;
grant all on public.tellingen to service_role;
grant all on public.telling_versies to service_role;

alter table public.tellingen enable row level security;
alter table public.telling_versies enable row level security;

create policy "Eigen tellingen of admin: lezen" on public.tellingen
  for select to authenticated
  using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Leden maken eigen tellingen" on public.tellingen
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (public.has_role(auth.uid(), 'member') or public.has_role(auth.uid(), 'admin'))
  );

create policy "Eigen tellingen of admin: bewerken" on public.tellingen
  for update to authenticated
  using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Eigen tellingen of admin: verwijderen" on public.tellingen
  for delete to authenticated
  using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Versies lezen" on public.telling_versies
  for select to authenticated using (public.mag_telling_bewerken(telling_id));
create policy "Versies toevoegen" on public.telling_versies
  for insert to authenticated with check (public.mag_telling_bewerken(telling_id));
create policy "Versies bewerken" on public.telling_versies
  for update to authenticated
  using (public.mag_telling_bewerken(telling_id))
  with check (public.mag_telling_bewerken(telling_id));
create policy "Versies verwijderen" on public.telling_versies
  for delete to authenticated using (public.mag_telling_bewerken(telling_id));