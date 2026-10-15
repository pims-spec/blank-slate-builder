-- Telling-id uit een pad "<telling-id>/<uuid>.<jpg|png|webp>"; null bij elk ander pad
create or replace function public.telling_id_uit_pad(_naam text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when _naam ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    then split_part(_naam, '/', 1)
  end
$$;

create policy "plattegronden: lezen wie de telling mag zien"
  on storage.objects for select to authenticated
  using (bucket_id = 'plattegronden'
         and public.mag_telling_zien(public.telling_id_uit_pad(name)));

create policy "plattegronden: uploaden wie de telling mag bewerken"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'plattegronden'
              and public.mag_telling_bewerken(public.telling_id_uit_pad(name)));

create policy "plattegronden: wijzigen wie de telling mag bewerken"
  on storage.objects for update to authenticated
  using (bucket_id = 'plattegronden'
         and public.mag_telling_bewerken(public.telling_id_uit_pad(name)))
  with check (bucket_id = 'plattegronden'
              and public.mag_telling_bewerken(public.telling_id_uit_pad(name)));

create policy "plattegronden: verwijderen wie de telling mag bewerken"
  on storage.objects for delete to authenticated
  using (bucket_id = 'plattegronden'
         and public.mag_telling_bewerken(public.telling_id_uit_pad(name)));

-- 2. AI-gebruik per gebruiker per dag
create table public.ai_gebruik (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  soort text not null check (soort in ('lezen', 'afbeelding')),
  dag date not null default (now() at time zone 'Europe/Amsterdam')::date,
  created_at timestamptz not null default now()
);
create index ai_gebruik_user_soort_dag on public.ai_gebruik (user_id, soort, dag);

alter table public.ai_gebruik enable row level security;

-- Alleen lezen (eigen rijen; admins alles). Schrijven gaat uitsluitend via ai_gebruik_boeken.
create policy "ai_gebruik: eigen rijen of admin"
  on public.ai_gebruik for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Boekt één AI-aanroep als de daglimiet dat toelaat. Limiet uit instellingen 'normen'
-- (data.aiLimiet.lezen / .afbeelding), anders 30 / 10. Atomair per gebruiker en soort.
-- Ook een mislukte AI-aanroep telt mee (er is bewust geen terugboeken).
create or replace function public.ai_gebruik_boeken(_soort text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _dag date := (now() at time zone 'Europe/Amsterdam')::date;
  _standaard int := case _soort when 'lezen' then 30 when 'afbeelding' then 10 end;
  _ingesteld text;
  _limiet int;
  _gebruikt int;
  _id bigint;
begin
  if _uid is null or not public.heeft_schrijfrol(_uid) then
    raise exception 'geen_toegang' using errcode = '42501';
  end if;
  if _standaard is null then
    raise exception 'ongeldige_soort' using errcode = '22023';
  end if;

  select data -> 'aiLimiet' ->> _soort into _ingesteld
    from public.instellingen where key = 'normen';
  _limiet := case when _ingesteld ~ '^\d{1,4}$' then _ingesteld::int else _standaard end;

  perform pg_advisory_xact_lock(hashtext(_uid::text || ':' || _soort));
  select count(*) into _gebruikt
    from public.ai_gebruik
   where user_id = _uid and soort = _soort and dag = _dag;

  if _gebruikt >= _limiet then
    return jsonb_build_object('toegestaan', false, 'gebruikt', _gebruikt, 'limiet', _limiet);
  end if;

  insert into public.ai_gebruik (user_id, soort, dag)
  values (_uid, _soort, _dag)
  returning id into _id;
  return jsonb_build_object('toegestaan', true, 'id', _id,
                            'gebruikt', _gebruikt + 1, 'limiet', _limiet);
end
$$;

revoke all on function public.ai_gebruik_boeken(text) from public, anon;
grant execute on function public.ai_gebruik_boeken(text) to authenticated;