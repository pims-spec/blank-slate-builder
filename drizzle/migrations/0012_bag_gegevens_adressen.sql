alter table public.portefeuille_adressen

  add column bag_status        text check (bag_status in ('gevonden', 'niet_gevonden', 'meerdere', 'fout')),

  add column bag_oppervlakte   integer check (bag_oppervlakte between 1 and 100000),

  add column bag_bouwjaar      smallint check (bag_bouwjaar between 1000 and 2100),

  add column bag_gebruiksdoel  text check (char_length(bag_gebruiksdoel) <= 200),

  add column bag_opgehaald_op  timestamptz;