# WWS-rekenkern — fase 1 (overgezet uit wws-site.html)

## Wat erin zit

```
src/lib/wws/
  types.ts                 datamodel, gelijk aan `input` in wws-site.html (voorzieningen per ruimte)
  normen.ts                DEFAULT_NORMEN + huurprijstabel 2026, letterlijk uit wws-site.html; mergeNormen()
  basis.ts                 num/q/m2r/fmt/eur, ruimtetypen, buitensoorten, ensureFac(), matenM2()
  calc.ts                  calc(input, normen?, {peildatum?}) — regel voor regel overgezet; huurVoorPunten()
  legeInput.ts             lege telling (= emptyTelling().input)
  index.ts                 exports
  calc.test.ts             leesbare, met de hand nagerekende voorbeelden
  calc.vergelijk.test.ts   5.000 willekeurige tellingen: uitkomst moet exact gelijk zijn aan de originele calc()
reference/wws-site-calc.cjs  letterlijke uitsnede (regels 771–1216) van wws-site.html, alleen voor de vergelijkingstest
src/components/wws/WwsCalculator.tsx       formulier + live resultaat (+ WwsCalculator.test.tsx)
src/routes/_authenticated/wws.tsx          pagina /wws
```

## Waar het zit in de app

Route `/wws` (`src/routes/_authenticated/wws.tsx`): alleen voor ingelogde gebruikers met de rol
member of admin, net als het overzicht. Bereikbaar via "Puntentelling" in de kopbalk en een knop
op het overzicht. Tests draaien met `bun run test` (of `npm test`).

## Verificatie

`calc.vergelijk.test.ts` draait de originele calc() uit wws-site.html en deze TypeScript-versie
op 5.000 willekeurige tellingen en eist exact dezelfde rubrieken, toelichtingen, waarschuwingen,
totalen, segmenten en huurprijzen. De steekproef raakt aantoonbaar ook de zeldzame paden
(WOZ-cap, cap-ondergrens 186, zorgwoning, rijksmonument, nieuwbouw-minimum).
Een bewust ingebrachte afwijking van 0,25 punt in de zorgwoningberekening werd direct gevonden.

## Waar wws-site.html afwijkt van lovable-fase1-rekenkern.md

De code volgt wws-site.html (bron van waarheid). Verschillen met de tekstspecificatie:

- WOZ-punten worden in de bron wél op kwarten afgerond (spec: niet afronden).
- Een vertrek < 4 m² telt in de bron gewoon mee als vertrek, met een waarschuwing.
- Geen labelklasse gekozen → 0 punten energie met waarschuwing (geen terugval op bouwjaar).
- Energie-index wordt als klasse (0–8 of EPV) gekozen, niet als waarde.
- Verwarming: "woonkamer/woon-slaapkamer met open keuken" telt als 2 vertrekken; verkoeling telt
  alleen bij een vertrek dat ook verwarmd is; elke verwarmde overige ruimte telt (max 4).
- Buitenruimte: de basis van 2 punten geldt alleen bij privé-buitenruimte.
- WOZ-kengetallen per beschikkingsjaar (2023–2026), niet alleen 2026.
- Zorgwoning: 35% over rubriek 1–10 plus de WOZ-punten vóór nieuwbouwminimum en cap.
- WOZ-cap: niet bij minimum-WOZ én niet als het nieuwbouwminimum van 40 is toegepast.
  Max = floor(overige punten × 33/67), waarbij overige punten zorg- en monumentpunten bevatten.
- Cap-ondergrens 186: zo werkt de live versie ook.
- Keuken: calc() telt alle aangevinkte voorzieningen op, ook twee kookplaten. Het nieuwe formulier
  laat per groep (kookplaat, oven, kraan) maar één keuze toe; de rekenregel zelf is ongewijzigd.

## Opvallend in de bron (overgenomen, niet "verbeterd")

- De 10-jaarsgeldigheid van label/index wordt getoetst tegen _vandaag_, niet tegen de peildatum
  van de telling (`meta.peildatum`). Een oude telling kan dus later anders uitkomen.
  In TypeScript kan de peildatum worden meegegeven (`calc(input, N, { peildatum })`); het formulier
  gebruikt nu nog vandaag, net als de bron.
- De migratie van zeer oude tellingen (zonder `facV`) is niet overgezet: de database is vers.
