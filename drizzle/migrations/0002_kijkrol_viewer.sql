-- Fase 2b-1, migratie A: de kijkrol. Apart uitvoeren vóór migratie B

-- (een nieuwe enum-waarde mag pas na een commit gebruikt worden).

alter type public.app_role add value if not exists 'viewer';