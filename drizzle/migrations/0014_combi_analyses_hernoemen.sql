-- 0014: de naam (titel) van een gecombineerde portefeuille-analyse achteraf aanpassen.
-- Alleen de kolom titel mag worden gewijzigd (kolomrecht), en alleen door de maker of een
-- beheerder met een schrijfrol: dezelfde mensen die de analyse mogen verwijderen.
-- De bestaande check (titel 1-200 tekens) en de restrictieve leesregel uit 0008 blijven gelden.

grant update (titel) on table public.portefeuille_combi_analyses to authenticated;

create policy "Combi-analyses hernoemen" on public.portefeuille_combi_analyses
  for update to authenticated
  using (public.heeft_schrijfrol(auth.uid())
         and (gemaakt_door = auth.uid() or public.has_role(auth.uid(), 'admin')))
  with check (public.heeft_schrijfrol(auth.uid())
         and (gemaakt_door = auth.uid() or public.has_role(auth.uid(), 'admin')));
