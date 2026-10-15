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

## PDF's en Excel-export (fase 4b)

```
src/lib/wws/pdf/stijl.ts      kleuren, pdfTxt, wozCapNoteText, facSummary, voettekst
src/lib/wws/pdf/delen.ts      bouwstenen (pdfGaugeCard, pdfTellingBody, pdfBanner, …)
src/lib/wws/pdf/rapporten.ts  maakTellingPdf / maakRoutePdf / maakAdviesPdf / maakDashboardPdf
src/lib/wws/pdf/laden.ts      jsPDF en SheetJS pas laden bij een download; bewaarBestand()
src/lib/wws/excel.ts          maakArchiefExcel (exporteerArchiefExcel)
reference/wws-site-pdf.cjs    letterlijke uitsnede van de PDF- en Excel-code, alleen voor de tests
```

**Bibliotheken.** De bron laadt jsPDF 2.5.1, jspdf-autotable 3.8.2 en xlsx 0.18.5 via een CDN.

- `jspdf` **4.2.1** (gepind): de oudste versie zonder bekende kwetsbaarheden. Alle versies
  t/m 4.2.0 hebben advisories, waaronder PDF- en HTML-injectie en DoS.
- `jspdf-autotable` **5.0.8**: past bij jsPDF 4 (peer `^2 || ^3 || ^4`). Gebruikt als
  `autoTable(doc, …)` in plaats van `doc.autoTable(…)`.
- `xlsx` **0.20.3** van de officiële SheetJS-CDN (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`).
  - Waarom niet npm: `xlsx` op npm staat stil op 0.18.5, met de bekende prototype-pollution
    (CVE-2023-30533) en ReDoS (CVE-2024-22363).
  - Waarom 0.20.3: daarin zijn beide verholpen, en de API is gelijk aan die van de bron
    (`json_to_sheet`, `!cols`), zodat de export één-op-één te vergelijken is.
  - Waarom geen ExcelJS: 4.4.0 is sinds 2023 niet bijgewerkt en heeft verouderde afhankelijkheden.
- `pdfjs-dist` 6.3.289: alleen als devDependency, om in de tests tekst uit de PDF's te halen.

**Verificatie.**

- `pdf/pdf.vergelijk.test.ts` draait de letterlijke bronfuncties en de nieuwe code op dezelfde
  willekeurige tellingen: 120 puntentellingen (werkversie en versies), 40 routes,
  30 adviesrapporten en 40 dashboards. Van elke PDF wordt per pagina de tekst uitgelezen; die
  moet exact gelijk zijn, net als het aantal pagina's en de bestandsnaam.
- `excel.vergelijk.test.ts` doet hetzelfde voor 60 archieven: alle cellen, celtypes en
  kolombreedtes.
- Beide kanten draaien op dezelfde, actuele jsPDF en SheetJS; de oude code via `applyPlugin`.
  De kwetsbare oude versies komen zo nergens in het project.

**Verder** (de bewuste afwijkingen in de PDF's staan hieronder, bij "Bewuste afwijkingen"):

- **`pdfSamenvattingPagina`** wijst in de bron toe aan een `const` als de plattegrond niet
  gelezen kan worden; dat zou gooien. Hier is dat een `let`. Dit is de enige aanpassing in de
  uitsnede, daar gemarkeerd.
- **`makePdf(…, opts)`** (routeInfo, labelOverride, …) wordt door de bron nergens gebruikt en is
  niet overgezet.
- **Plattegrond.** Die komt in fase 4c uit Storage. De PDF-functies nemen hem al als parameter
  (`plattegrond`, een JPEG-data-URL).

## Bewuste afwijkingen van wws-site.html

Dit zijn de plekken waar de app opzettelijk iets anders doet dan de bron. De vergelijkingstests
vergelijken steeds de kern zónder deze afwijkingen (`berekenVariantenKern`, enz.); de afwijkingen
hebben eigen tests.

### Indelingsadvies (`indeling.ts`)

- **Toiletvangnet** (`toiletVangnet`, getest in `indeling.test.ts`). De bron kan een variant zonder
  enig toilet opleveren: bij "geen aparte toiletruimte" krijgt alleen een *nieuw* voorgestelde
  badkamer een toilet, niet een behouden badkamer zonder toilet; en bij "auto" komt er geen losse
  toiletruimte bij zodra er een behouden badkamer is — vervalt de bestaande toiletruimte, dan blijft
  er niets over. Na `bouwVariant` controleert de app daarom of de variant ergens een toilet heeft
  (toiletruimte met toilet, of badkamer met staand/hangend toilet). Zo niet, dan krijgt de eerste
  badkamer (behouden of nieuw) `toiletStaand = 1`, zoals de bron al doet voor een nieuwe badkamer,
  en meldt de variantkaart "toilet toegevoegd aan de badkamer". Is er ook geen badkamer, dan toont
  de kaart een waarschuwing. De punten van de variant worden ná het vangnet berekend.
- **Toepassen**: de bron zet een getekend blokkenschema als `plattegrondImg`; de app verwijdert een
  bestaande `plattegrondImg` (en de `bbox`'en) omdat die niet meer bij de nieuwe indeling past, en
  toont het schema live.
- **Eigenaar en PvE pas bij toepassen**: de bron zet `meta.klantId` al bij stap 1 → 2 en legt geen
  `meta.pveId` vast. De app koppelt eigenaar én gebruikt PvE pas bij "Toepassen", zodat annuleren
  geen bijwerking heeft en later stil invullen hetzelfde PvE gebruikt.

### PDF's (`pdf/`)

De vergelijkingstest (`pdf.vergelijk.test.ts`) maakt de PDF's met `bronGetrouw: true`, precies als
de bron. De app laat die optie weg, en dan gelden de afwijkingen hieronder. Ze hebben eigen tests
in `pdf.afwijkingen.test.ts`.

- **"≤" wordt "<="** (`pdfTxt` in `stijl.ts`).
  - Het probleem: de ingebouwde Helvetica van jsPDF kent geen "≤". In de bron werd een tekst
    met "≤" als losse, gespatieerde letters getekend. Het gaat om de energie-indexklassen,
    zoals "1,4 < EI ≤ 1,8", in de telling-PDF bij elke telling met een energie-index en in de
    adviesroutes.
  - Fase 5: als het huisstijl-lettertype wordt ingesloten, kan "≤" terug.
- **Route-PDF ("Route als PDF"): de beginsituatie** (`routeAanvullen` in `rapporten.ts`).
  - Het probleem: de bron gaf de route geen begin-soort mee. Met een labelstap toonde de
    energiekaart daardoor "Van undefined naar nieuw energielabel …".
  - Nu: de kaart toont "Van label C naar …", of bij een energie-index of bouwjaar
    "Van energie-index … naar nieuw energielabel …".
- **Route-PDF: het eindlabel.**
  - Het probleem: het adviesdialoog houdt geen eindlabel per stap bij, dus de bron toonde "?".
  - Nu: het label na de gekozen stappen tot en met de labelstap wordt ingevuld, net als
    berekenRoute() dat voor het adviesrapport al doet.
