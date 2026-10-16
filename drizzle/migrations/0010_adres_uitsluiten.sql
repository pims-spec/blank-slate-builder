-- 0010_adres_uitsluiten.sql
alter table public.portefeuille_adressen
  add column uitgesloten_op   timestamptz,
  add column uitgesloten_door uuid references public.profiles(id) on delete set null;