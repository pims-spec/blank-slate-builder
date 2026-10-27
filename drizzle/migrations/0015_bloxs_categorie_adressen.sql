alter table public.portefeuille_adressen

  add column bloxs_categorie text check (char_length(bloxs_categorie) <= 100);