-- 0009_tweestaps_verplicht.sql
-- Tweestapsverificatie ook in de database afdwingen: elke tabel (en de bucket 'plattegronden') is
-- voor ingelogde gebruikers alleen bereikbaar met een token van niveau aal2 (wachtwoord + code uit
-- de code-app). Zonder code (aal1) geeft lezen niets en mislukt schrijven.
-- Volledig additief: alleen nieuwe RESTRICTIVE policies, die een extra voorwaarde toevoegen aan de
-- bestaande. De service role (2FA resetten, collega uitnodigen) valt buiten RLS.

create policy "Alleen met tweestapsverificatie" on public.ai_gebruik
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "Alleen met tweestapsverificatie" on public.bloxs_objecten
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "Alleen met tweestapsverificatie" on public.instellingen
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "Alleen met tweestapsverificatie" on public.klanten
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "Alleen met tweestapsverificatie" on public.label_resultaten
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "Alleen met tweestapsverificatie" on public.portefeuille_adressen
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "Alleen met tweestapsverificatie" on public.portefeuille_analyses
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "Alleen met tweestapsverificatie" on public.portefeuille_combi_analyses
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "Alleen met tweestapsverificatie" on public.portefeuille_shares
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "Alleen met tweestapsverificatie" on public.portefeuilles
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "Alleen met tweestapsverificatie" on public.profiles
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "Alleen met tweestapsverificatie" on public.telling_shares
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "Alleen met tweestapsverificatie" on public.telling_versies
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "Alleen met tweestapsverificatie" on public.tellingen
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create policy "Alleen met tweestapsverificatie" on public.user_roles
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- Plattegronden: alleen deze bucket; andere buckets blijven ongemoeid
create policy "Plattegronden alleen met tweestapsverificatie" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'plattegronden' or (select auth.jwt() ->> 'aal') = 'aal2')
  with check (bucket_id <> 'plattegronden' or (select auth.jwt() ->> 'aal') = 'aal2');
