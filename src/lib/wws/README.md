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

Route `/indeling` (`IndelingStart.tsx`) is het startscherm van het indelingsadvies
(toonIndelingStart), alleen voor wie mag schrijven:

- **Bestaande telling kiezen** gaat naar `/archief?indeling=true`. Openen gaat dan naar
  `/wws?id=…&indeling=true`, en de editor opent na het laden het indelingsadvies.
- **Blanco** gaat naar `/wws?blanco=true`. Eerst komt het venster Nieuwe telling, ook bij Overslaan.
  Daarna opent het indelingsadvies met de plattegrondstap (renderIndelingPlattegrondStap); die
  vervangt altijd. Stap 1 heeft dan een knop "← Terug naar plattegrond".
- Beide vlaggen gaan na gebruik uit de adresbalk, zodat verversen ze niet opnieuw uitvoert.

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

## AI en plattegronden (fase 4c)

```
src/lib/wws/plattegrond/opslag.ts    Storage-bucket "plattegronden": magic bytes, paden, opruimen
src/lib/wws/plattegrond/bewaren.ts   opslaan met een nieuwe afbeelding; vorige opruimen
src/lib/wws/plattegrond/beeld.ts     bestand/PDF → JPEG (pdf.js pas geladen bij een PDF)
src/lib/wws/plattegrond/toepassen.ts applyPlat() zonder DOM
src/lib/wws/ai/                      prompts, privacy, zod-schema's, Claude/Gemini, server functions
src/lib/wws/tekenen.ts               tekenen op de plattegrond (verplaatsen, vergroten, inkepingen)
src/lib/wws/schemaTekening.ts        het blokkenschema als PNG (indelingSchemaDataUrl)
reference/wws-site-{ai,plattegrond,schema}.cjs   letterlijke uitsneden voor de vergelijkingstests
```

**Afbeeldingen.**

- Nieuwe afbeeldingen gaan altijd naar de privé bucket `plattegronden`, onder
  `<telling-id>/<uuid>.<jpg|png|webp>`. De telling bewaart alleen
  `input.plattegrond = { pad, breedte, hoogte }`.
- Oude `plattegrondImg`-data-URL's blijven leesbaar: alleen jpeg, png en webp worden getoond en
  in de PDF gezet.
- De bucket beperkt de bestandstypen niet. Daarom controleert de app vóór elke upload de echte
  inhoud (magic bytes) en geeft het contentType expliciet mee.
- Een nieuwe afbeelding staat in de werkversie tot Opslaan.
- Telling verwijderen: eerst de bestanden onder `<id>/`, dan de telling. Lukt het opruimen niet,
  dan blijft de telling staan.
- Vervangen: de vorige afbeelding verdwijnt, tenzij een vastgelegde versie hem gebruikt.

**AI.**

- **Server functions:** schrijfrol vereist; invoer via zod, ook de echte inhoud van afbeeldingen.
- **Daglimiet:** `ai_gebruik_boeken()`, met het eigen token. De limiet staat in `normen.aiLimiet`,
  standaard 30 keer inlezen en 10 afbeeldingen per dag. Ook een mislukte aanroep telt mee.
- **Modellen:** via `CLAUDE_MODEL` en `GEMINI_IMAGE_MODEL`, standaard `claude-sonnet-5-5` en
  `gemini-3.1-flash-image`.
- **Instructies:** de server bouwt ze zelf op. Ze zijn letterlijk gelijk aan de bron, met een
  vergelijkingstest.
- **Privacy:**
  - Claude krijgt alleen de afbeelding of tekst plus de instructie.
  - Uit de tekst gaan eerst de eigen gegevens van de telling, postcodes, e-mail, telefoon en IBAN.
  - Gemini krijgt de plattegrond plus ruimtetypen en m², met `store: false`.
- **Antwoorden:** gecontroleerd met zod. Alleen eigen foutcodes; nooit de foutmelding van de
  dienst, in de browser noch in de log.

## Huisstijl (fase 5b)

- **Tokens** (`src/styles.css`): de kleuren uit de bron staan in de bestaande
  shadcn/Tailwind-variabelen, met de hexwaarde van de bron erachter. Het gaat om
  `--bg`/`--panel`/`--ink`/`--muted`/`--line` en `--accent` #5B41FF/`--soft`/`--orange`
  #FF7C3A/`--field`, plus de segmentkleuren.
  - **Donker:** de donkere set van de bron schakelt automatisch mee met de apparaatinstelling
    (`prefers-color-scheme`).
  - **Lettertypes:** Inter voor alles, Instrument Sans schuin voor taglines (`.tagline`).
  - **Vormen:** knoppen als pil met paarse gloed, en een zachte gloed achter de pagina.
- **Contrast (WCAG AA):** `src/test/contrast.test.ts` rekent de tokens na, licht en donker.
  - Op oranje en op de segmentkleuren staat donkere inkt; wit haalt daar geen 4,5:1.
  - Oranje tekst gebruikt `orange-ink`: #B4521A licht, #FF9A62 donker.
- **Naam en merk:** "GoHome WWS" (`lib/merk.ts`), het woordmerk "GoHome" + "WWS"
  (`Woordmerk.tsx`) en een favicon (paars vlak met witte G).
- **Zijmenu** (`Zijmenu.tsx`, onderdelen in `lib/menu.ts`): breed op een computer, een
  icoonbalk tot 720px. Een nieuw onderdeel is één regel in `menuOnderdelen`.
- **Startscherm:** de homehero met groet en de statistieken van `berekenHomeStats`
  (`home.ts`, met een vergelijkingstest tegen `reference/wws-site-home.cjs`).
- **PDF's:** Inter ingesloten; zie hieronder.

## Portefeuille-analyse energielabels (nieuw, niet in de bron)

```
src/lib/wws/portefeuille/analyse.ts     risicocategorieën, verloopdatum, EFG, percentages (puur)
src/lib/wws/portefeuille/datum.ts       datumrekenen op ISO-datums (maandeinde, schrikkeljaren)
src/lib/wws/portefeuille/adres.ts       adressen normaliseren, dubbele herkennen, EP-Online-vraag
src/lib/wws/portefeuille/importeren.ts  Excel/CSV-import (postcode, huisnummer, toevoeging)
src/lib/wws/portefeuille/ophalen.ts     EP-Online-antwoord → resultaat; wanneer stoppen
src/lib/wws/portefeuille/portefeuille.functions.ts  server function haalLabelsOp (porties van 10)
src/lib/wws/portefeuille/opslag.ts      tabellen portefeuilles, portefeuille_adressen,
                                        label_resultaten, portefeuille_analyses (RLS)
src/lib/wws/pdf/portefeuille.ts         PDF in de huisstijl
src/components/wws/portefeuille/        scherm /portefeuille-analyse
```

**Risicocategorieën.** Elke woning valt in precies één categorie, van boven naar beneden; de
percentages zijn van de beoordeelde woningen (gevonden of niet gevonden).

1. **Geen geregistreerd label:** niet gevonden bij EP-Online, of gevonden zonder labelklasse.
2. **Verlopen:** de verloopdatum ligt vóór de analysedatum.
3. **Verloopt binnen N maanden:** analysedatum ≤ verloopdatum ≤ analysedatum + N maanden.
   Precies N maanden telt mee. N is per analyse in te stellen (standaard 3).
4. **Verouderd:** nog geldig, maar geregistreerd vóór de grens (standaard 1 januari 2021). Dat is
   een oud energielabel of een energie-index, nog niet volgens NTA 8800.
5. **In orde:** een geldig label volgens NTA 8800.

**Verloopdatum.** "Geldig tot" van EP-Online, anders de registratiedatum + 10 jaar. Bestaat die
dag niet, dan de laatste dag van de maand: 29 februari + 10 jaar = 28 februari.

**Verlooplijst.** Woningen waarvan het label binnen N maanden verloopt, of in de afgelopen N
maanden al verlopen is, gesorteerd op verloopdatum.

**EFG-regels.** Instelbaar in Normen (`normen.portefeuille`): de ingangsdatum, de labels die
eronder vallen, en hoe "geen label" meetelt (apart, meetellen of niet vermelden). De analyse en
de PDF tonen alleen een neutrale omschrijving uit die instellingen; er staat geen wettekst in.

**Te controleren.** Apart getoond, en niet meegeteld in de percentages:

- niet eenduidig: meerdere verschillende labels voor één adres;
- ophalen mislukt;
- nog niet opgehaald.

"Niet gevonden" staat er ook bij, maar telt in het risicoprofiel als "geen geregistreerd label".

**EP-Online.**

- **Aanvragen:** per adres via de bestaande kern uit fase 4a (`zoekEnergielabelsBijEpOnline`), in
  porties van 10 met maximaal 2 aanvragen per seconde. De limiet staat in Normen en de server
  dwingt hem af.
- **Stoppen:** bij te veel verzoeken of een fout met de dienst of de sleutel stopt het ophalen,
  zonder iets op te slaan. "Hervatten" gaat verder met de adressen zonder resultaat.
- **Opslag:** per adres alleen het laatste resultaat, met het moment van opvragen.
- **Analyses:** een opgeslagen analyse is een vaste momentopname.
- **Totaalbestand:** het maandelijkse totaalbestand kan later; het is te groot om in een server
  function te verwerken.

**Rechten (migratie 0008).**
- **Zien:** een portefeuille en de analyses ervan zie je als maker, als hij met je gedeeld is, als
  beheerder of met de kijkrol. Een gecombineerde analyse zie je als je alle portefeuilles ervan mag
  zien (of als maker, beheerder of kijkrol).
- **Bijwerken:** labels ophalen, adressen toevoegen, opnieuw inladen uit Bloxs en analyses opslaan
  doen de maker, de collega's met wie hij gedeeld is, en beheerders (met een schrijfrol).
- **Delen en verwijderen:** alleen de maker of een beheerder. Delen kan op de pagina zelf en in
  Archief → Portefeuille-analyses (deelt de onderliggende portefeuille(s)).
- **In de database:** extra RESTRICTIVE policies bovenop de bestaande, met
  `mag_portefeuille_zien/_bewerken/_delen`. De bestaande policies zijn niet gewijzigd.

**Straat en woonplaats.** Optioneel uit de import (kolommen `straat`/`straatnaam` en
`woonplaats`/`plaats`); anders direct na de import aangevuld via PDOK. Dat gaat met een schrijfrol,
per portie van 10 en met één vraag per postcode en huisnummer (ongeveer 4 per seconde). Lijsten en
PDF tonen dan "Kinkerstraat 49A-2, 1053 ZD Amsterdam"; zonder straat alleen postcode en huisnummer.

**PDF.** Begint met een voorblad "Label-analyse" in dezelfde vormgeving als de voorpagina van de
WWS-rapporten (`pdfVoorblad`, gedeeld met `pdfCoverPage`). Het voorblad heeft geen voettekst; de
paginanummers lopen vanaf 2, net als bij de WWS-rapporten.

**Meerdere portefeuilles.** Met "Meerdere portefeuilles" draai je één analyse over gekozen
portefeuilles; "Alle portefeuilles van eigenaar" voegt die van een GoHome-eigenaar toe.
- **Dubbele adressen:** een adres in meer portefeuilles telt één keer (de versie met het nieuwste
  labelresultaat); adressen die niet meer in Bloxs staan tellen niet mee (`combi.ts`).
- **Labels ophalen** blijft per portefeuille; de gecombineerde analyse toont wat nog ontbreekt.
- **Opslaan:** in `portefeuille_combi_analyses` (migratie 0007), een vaste momentopname met de
  namen van de portefeuilles en de eigenaren; blijft bestaan als een portefeuille later weg is.

**Archief.** Tabblad "Portefeuille-analyses" (`/archief?tab=analyses`): alle opgeslagen analyses,
enkel en gecombineerd, met zoeken, bekijken, PDF en verwijderen (maker of admin). De kijkrol kan
bekijken en de PDF downloaden.

**Verduurzamingsraming (migratie 0012, nieuw, niet in de bron).** Bij de EFG-regels een grove
kostenindicatie om woningen naar minimaal label D en naar C te brengen.
- **BAG:** "BAG-gegevens ophalen" haalt alleen gegevens op voor woningen met een label onder de
  EFG-regels en woningen zonder geregistreerd label (`inRaming`); alleen die staan ook in de
  raming. Per woning drie korte vragen bij PDOK (geen sleutel), elk ca. 0,1 s: de Locatieserver
  geeft het BAG-id van het verblijfsobject, de BAG OGC API dat verblijfsobject op id (oppervlakte,
  gebruiksdoel, pand) en het pand (bouwjaar, één keer per pand). Zoeken op postcode + huisnummer in
  de BAG OGC API zelf duurt 5–11 s per vraag en is daarom niet gebruikt. Server function
  `haalBagGegevens` (2FA en schrijfrol, zod op invoer en antwoord, alleen BAG-ids van 16 cijfers en
  pand-links naar dezelfde API, eigen foutcodes, porties van 10, pauze 0,1 s, stopt bij 429 of
  storing). Opgeslagen in `portefeuille_adressen.bag_*`; de Bloxs-sync raakt die niet.
- **Berekening** (`verduurzaming.ts`): labelstappen × m² × € per m² per stap × factor per
  bouwjaarklasse, met een lage en hoge prijs (bandbreedte), afgerond op € 100. Alleen woningen
  slechter dan C. Zonder geregistreerd label: een aangenomen label per bouwjaarklasse (gemarkeerd
  met *). Zonder oppervlakte of bouwjaar: in de lijst, zonder bedrag.
- **Normen → Verduurzamingsraming:** bedragen (laag/hoog), factor en aangenomen label per
  bouwjaarklasse. Standaard € 7.500 per labelstap per woning (keuze GoHome), omgerekend naar
  € 107 per m² per stap bij ca. 70 m² (laag en hoog gelijk), en factoren 1,3 / 1,15 / 1,0 / 0,9
  (eigen aanname: oudere woningen duurder).
- **Uitkomst:** `AnalyseUitkomst.raming`, dus ook in opgeslagen en gecombineerde analyses en in de
  PDF (na de lijst met EFG-woningen). Analyses van vóór deze functie hebben geen raming.

**Analyses bewaren bij verwijderen (migratie 0011).** Een opgeslagen analyse hing aan zijn
portefeuille en verdween mee bij verwijderen. Nu kopieert een trigger (`before delete` op
`portefeuilles`) de analyses eerst naar `portefeuille_analyses_archief`, met de naam en eigenaar
van dat moment. Het archief toont ze met "Portefeuille verwijderd" (soort `verwijderd`): bekijken
en PDF; verwijderen door de maker of een admin; zien door de maker, admins en de kijkrol. Eerder
verwijderde analyses zijn niet terug te halen.

**Adres uit de analyse halen (migratie 0010).** Bij "Te controleren" staat per adres een kruisje
(alleen in de actuele analyse, met schrijfrechten). Het adres krijgt `uitgesloten_op`/
`uitgesloten_door`, blijft in de portefeuille (ook na opnieuw inladen uit Bloxs: de sync raakt die
kolommen niet), telt nergens meer mee (`analyseer`, `combineerAdressen`) en wordt niet meer
opgehaald. "Uit de analyse gehaald" bij het ophalen toont ze, met "Terugzetten". Opgeslagen
analyses blijven zoals ze waren.

**Eigenaar in GoHome bij Bloxs.** Bij het kiezen van een Bloxs-eigenaar stelt het venster de
GoHome-eigenaar voor (`bloxs/eigenaarKoppeling.ts`):
1. die van een eerdere portefeuille van dezelfde Bloxs-eigenaar;
2. anders die met dezelfde naam;
3. anders "+ Nieuw in GoHome", die bij het inladen wordt aangemaakt.

Altijd aan te passen. De koppeling loopt via de portefeuille (`klant_id` + Bloxs-eigenaar).

Ook bij een bestaande portefeuille (ingelezen of uit Bloxs) is de GoHome-eigenaar te kiezen of te
wijzigen, naast de portefeuillekeuze. Het archief toont die eigenaar bij de losse analyses; een
gecombineerde analyse bewaart de eigenaren van het moment van opslaan.

**Bloxs (OData-feed).** Bloxs (met x) via de OData-feed (`[klantomgeving].bloxs.io/odatafeed`),
niet de REST-API.

- **Secrets:** `BLOXS_ODATA_URL`, `BLOXS_ODATA_GEBRUIKER`, `BLOXS_ODATA_WACHTWOORD`.
- **Inloggen:** Basic auth, alleen op de server (`bloxs/bron.ts`). De inloggegevens gaan nooit naar
  de browser of de logs. Alleen https-adressen van `*.bloxs.io`/`*.bloxs.com`, en geen
  doorverwijzingen volgen.
- **Fouten:** vaste codes (`bloxs/fouten.ts`); een antwoord van Bloxs wordt nooit doorgegeven.
- **Stap 1 (gebouwd):** op /admin → Serverinstellingen kan een beheerder de verbinding testen en
  de structuur ophalen. Dat zijn alleen de namen van entiteiten, velden, sleutels en navigatie uit
  `$metadata` (`bloxs/metadata.ts`), nooit rijen of waarden.
- **Stap 2 (gebouwd): de sync.**
  - **Allowlist (`bloxs/odata.ts`):** de inlog van de feed ziet alles (127 entiteiten, ook
    personen, contracten en financiën). De code kan daarom alleen deze velden opvragen, met
    filters die ze zelf opbouwt:
    - `owners`: OwnerId, Reference, DisplayName, ArchiveDate;
    - `Units`: RealEstateObjectId, Reference, OwnerId, ComplexId, ComplexName, AddressId,
      SalesDate;
    - `Buildings`: RealEstateObjectId, Reference, OwnerId, AddressId, SalesDate;
    - `Addresses`: AddressId, PostalCode, HouseNumber, Street, City.
  - **Eerst een test:** een vraag met `$top=0` (geen rijen). Werken `$select`/`$filter` niet, dan
    stopt alles en worden er nooit hele tabellen opgehaald.
  - **Controle per antwoord:** staan er andere velden in dan gevraagd, of rijen buiten het
    filter, dan stopt de sync zonder iets te bewaren. Een `@odata.nextLink` wordt alleen gevolgd
    als hij naar dezelfde feed en entiteit wijst.
  - **Adressen:** alleen per AddressId van onze eigen objecten, in porties van 50; de tabel bevat
    ook adressen van personen. Het huisnummer wordt gesplitst met `normaliseerAdres`; lukt dat
    niet, dan staat het object bij "zonder bruikbaar adres".
  - **Tempo:** standaard 1 aanvraag per seconde (Normen, max. 5), afgedwongen op de server. Elke
    stap meldt het aantal aanvragen; het dialoogvenster toont het totaal.
  - **Opslaan (`bloxsSyncOpslaan`):** alleen na een volledige sync. Adressen worden toegevoegd of
    bijgewerkt (straat en woonplaats uit Bloxs, geen PDOK), objecten gekoppeld met een sync-id, en
    daarna rondt `bloxs_sync_afronden` af. Verdwenen adressen worden gemarkeerd
    (`niet_in_bloxs_sinds`) en tellen niet mee in de analyse, maar worden niet verwijderd;
    labelresultaten blijven staan. Een sync zonder objecten wordt nooit opgeslagen. Verkochte
    objecten (verkoopdatum vandaag of eerder) tellen niet mee.
- **Database:** de oude kolommen `bloks_id` en `bloks_object_id` zijn leeg en worden niet gebruikt
  (migratie 0006 is additief). Bron `'bloks'` in de database betekent Bloxs; in de code heet het
  `bloxs`.

## Tweestapsverificatie (nieuw, niet in de bron)

Verplicht voor iedereen: na het wachtwoord (of Google) een code uit een code-app (TOTP, Supabase
Auth MFA).
- **Afdwingen in de app:** de route `/_authenticated` stuurt elke sessie zonder code (`aal1`) naar
  `/tweestaps`. Wie nog geen code-app heeft, koppelt er daar eerst één (QR-code plus bevestiging);
  anders vul je de code in (`src/lib/tweestaps.ts`, `src/components/TweeStaps.tsx`).
- **Beveiliging** (zijmenu, iedereen): gekoppelde code-apps bekijken, een tweede koppelen, of er
  één verwijderen. De laatste kun je niet verwijderen.
- **Resetten** (telefoon kwijt): op /admin "2FA resetten" per collega.
  - `resetTweestaps` is alleen voor admins en nooit voor het eigen account.
  - Het gebruikt de service role (op verzoek), omdat alleen de Auth-admin-API factoren van een
    ander account kan verwijderen.
  - Geen ids of e-mailadressen in de log.
- **Server functions:** `vereisTweestaps` (`src/lib/wws/rollenMiddleware.ts`) weigert een token
  zonder `aal2`; `vereisSchrijfrol`, `vereisAdmin` en het uitnodigen van een collega bouwen erop.
- **In de database (migratie 0009):** een restrictieve voorwaarde `aal2` op alle tabellen en op de
  bucket `plattegronden`, zodat ook de database zonder code niets geeft. Security-definer-functies
  vallen buiten RLS: `ai_gebruik_boeken` telt dan alleen het eigen AI-gebruik op (de AI zelf loopt
  via een server function met `aal2`).

## Bewuste afwijkingen van wws-site.html

Dit zijn de plekken waar de app opzettelijk iets anders doet dan de bron. De vergelijkingstests
vergelijken steeds de kern zónder deze afwijkingen (`berekenVariantenKern`, enz.); de afwijkingen
hebben eigen tests.

### Ruimte zonder soort (`ruimteInvoer.ts`, formulier)

Een nieuwe ruimte heeft, net als in de bron, nog geen soort ("Kies soort ruimte…"). Een nieuw
vertrek is verwarmd, een nieuwe overige ruimte niet. `calc()` blijft gelijk aan de bron: een
ruimte zonder soort telt mee als overig vertrek of overige ruimte, ook voor de verwarming. Een
vergelijkingstest legt dat vast.

Afwijking: de bron toont zo'n ruimte alleen met een gestippeld veld. De app laat hem duidelijker
opvallen, zodat hij niet ongemerkt meetelt:

- een rode rand om de ruimte;
- de tekst "Kies het soort ruimte. Tot dan telt deze ruimte mee als …";
- een melding in het samenvattingspaneel met het aantal ruimten zonder soort.

### Ruimten en voorzieningen in de puntentelling (formulier)

- **Duidelijkere rand om elke ruimte.** 2px in de kleur `--ruimte-rand` (licht en donker
  minstens 3:1 tegen kaart en achtergrond, `contrast.test.ts`). Een ruimte zonder soort houdt
  een rode, gestippelde rand.
- **Voorzieningen in- en uitklappen** (bron: altijd uitgeklapt).
  - Ingeklapt staat er een korte samenvatting (`voorzSamenvatting.ts`), bijv. "Keuken: aanrecht
    1–2 m, 5 voorzieningen". De PvE-markering blijft zichtbaar.
  - Een ruimte die je toevoegt of van soort wisselt opent uitgeklapt; een geladen telling opent
    ingeklapt. "Alles uitklappen / Alles inklappen" boven de ruimten.
  - Alleen-lezen: alles uitgeklapt, zonder knoppen. De stand wordt niet opgeslagen.

### Automatisch een versie vóór "Toepassen" (`opslag/uitgangssituatie.ts`)

In de bron gaat de situatie vóór een advies verloren als je na "Toepassen op telling" opslaat
zonder eerst zelf een versie vast te leggen. De app legt die situatie nu eerst vast:

- **Wanneer:** bij "Toepassen op telling" (verbeteradvies) en bij het toepassen van een
  indelingsvariant. De kijkrol kan niet toepassen.
- **Versienaam:** "Vóór advies vrije sector – 15 okt 2026" of "Vóór indelingsadvies – 15 okt
  2026". De telling houdt haar eigen naam (`legVersieVast(..., { hernoem: false })`).
- **Nog nooit opgeslagen:** eerst de telling opslaan, dan de versie.
- **Niets gewijzigd sinds de laatste versie** (adres, eigenaar en invoer gelijk): geen dubbele
  versie; de melding noemt de versie die als uitgangssituatie geldt.
- **Opslaan mislukt:** het advies wordt niet toegepast, met een duidelijke foutmelding.
- **Niet meer "gebaseerd op" een versie:** na toepassen werkt Opslaan alleen de werkversie bij,
  nooit de versie waarop de telling gebaseerd was (anders zou de bewaarde uitgangssituatie met
  het advies worden overschreven).
- **Daarna:** het advies staat, zoals in de bron, in een niet-opgeslagen werkversie. Een melding
  zegt "Uitgangssituatie bewaard als versie '…'". Met Versies vergelijken zie je vóór en na.
- Tests: `uitgangssituatie.test.ts` en `TellingEditor.test.tsx` (eerste keer opslaan, ongewijzigd,
  opslaan mislukt, kijkrol).

### Verbeteradvies: eenvoudigste maatregel eerst (`advies/niveaus.ts`, `advies.ts`)

De bron kiest de maatregel met de laagste kosten per punt, gewogen met de haalbaarheid
(`H_FACTOR`). Alle extra sanitaire en keukenvoorzieningen zijn daar samen "eenvoudig" en kosten
per punt hetzelfde, dus koos het advies de eerste uit de lijst: een handdoekradiator vóór een
kastje, stopcontacten vóór een wastafel met kastje.

- **Niveau per voorziening.** Elke maatregel én elke extra voorziening heeft een niveau:
  eenvoudig, gemiddeld of lastig (`NIVEAU_STANDAARD`). De maatregelen houden het niveau uit de
  bron. Voorzieningen:
  - eenvoudig: wastafel met ingebouwd kastje, kastruimte 40 × 40, mengkranen, douche-afscheiding,
    keukenkast, losse inbouwapparaten;
  - gemiddeld: handdoekradiator, stopcontact, bubbelbad, kookplaten, gasoven, afzuiging,
    kokendwaterkraan.
- **Instelbaar in Normen** (alleen admin), sectie "Eenvoud van maatregelen". Alleen afwijkingen
  van de standaard worden bewaard (`normen.adviesNiveaus`). Het energielabel (3 of meer stappen:
  lastig) en een extra toilet volgen een vaste regel.
- **Volgorde.** Eerst het laagste niveau, daarbinnen de kosten per punt. Een lastigere maatregel
  komt alleen als er geen eenvoudigere meer is die punten oplevert. Bij het schrappen van
  overbodige stappen gaan de lastigste (dan de duurste) eerst. Alle aftoppingen blijven, want de
  punten komen uit `calc()`.
- **Weergave.** Het niveau staat in de route en "Alle maatregelen" (zoals de bron) en nu ook per
  maatregel in de PDF ("Ingebouwd kastje … (eenvoudig)").
- **Brongetrouwe modus.** `berekenAdvies`/`berekenRoute` met `{ brongetrouw: true }` rekent precies
  als de bron; de vergelijkingstests en `maakAdviesPdf({ bronGetrouw: true })` gebruiken die.
- Tests: `niveaus.test.ts` (kastje vóór stopcontacten, kastruimte vóór handdoekradiator, lastiger
  alleen als het moet, aftopping), `NormenBeheer.test.tsx`, `pdf.afwijkingen.test.ts`.

### Energieadvies: afwijkend beginlabel en opties vergelijken (`advies/energieAdvies.ts`)

**Wat de bron doet.** De bron leest het label uit het advies wel uit (`huidig.label`), maar toont
het alleen in de PDF ("Huidige energiestatus"). Het verbeteradvies gebruikt een labelstap uit het
advies alleen als het beginlabel van die stap precies gelijk is aan het label in de telling. Wijkt
het af, dan worden de opties zonder melding genegeerd en rekent de bron met de standaardkosten per
stap. Ook kiest de bron zelf tussen de opties; je ziet ze niet naast elkaar.

**Inlezen.** De prompt vraagt elke optie apart, het beginlabel en de datum van het advies
(`ENERGIEADVIES_EXTRA_REGELS`, het voorbeeld-JSON krijgt `datum`). Zod neemt de datum alleen over
als geldige yyyy-mm-dd, en het beginlabel alleen als geldig label.

**Afwijkend beginlabel (1a).**
- `vergelijkBeginlabel` vergelijkt klasse, soort (een label van vóór 2015 telt als verschil) en
  datum. Het voorstel is het advies als dat recenter is dan de registratie, anders EP-Online.
- **Controlevraag**: "Het energieadvies van [datum] gaat uit van label E. In EP-Online staat label
  C, geregistreerd op [datum]. Wil je het verbeteradvies baseren op label E uit het advies? De
  WWS-punten van de huidige situatie blijven gebaseerd op label C." Knoppen "Ja, ga uit van het
  advies" en "Nee, gebruik EP-Online"; het voorstel is voorgeselecteerd.
- **Pas na bevestiging.** Tot die tijd rekent het verbeteradvies met het geregistreerde label. De
  keuze staat in `energieAdvies.uitgangspunt` met wie en wanneer, en geldt alleen voor dat
  advieslabel (een nieuw advies vraagt opnieuw). Wijzigen kan altijd, opnieuw met bevestiging.
- **Punten.** De WWS-punten van de huidige situatie blijven op het geregistreerde label; het label
  in de telling wordt nooit automatisch gewijzigd ("Een nieuw label telt pas mee … na registratie
  in EP-Online"). Het eindlabel van een optie bepaalt de punten in de route. Het gekozen beginlabel
  bepaalt alleen het aantal stappen, het niveau (3 of meer: lastig) en de standaardkosten.
- **Waar te zien:** in de telling (rubriek energie), het tabblad Energieadvies van het
  verbeteradvies (met een melding in de route zolang het niet bevestigd is) en beide advies-PDF's.

**Opties vergelijken (1b).**
- `vergelijkOpties` rekent per optie met `calc()`: labelsprong vanaf het beginlabel, kosten,
  maatregelen, besparing, punten erbij, nieuw totaal, segment, maximale huur, extra huur per maand
  en een terugverdientijd als indicatie (gemiddelde kosten ÷ extra huur per jaar).
- In het tabblad Energieadvies staan de opties naast elkaar (op telefoon onder elkaar). "Kies deze
  optie" legt `energieAdvies.gekozenOptie` vast; bij de andere opties staat het verschil. "Keuze
  opheffen" laat het verbeteradvies weer zelf kiezen. Bij één optie geen vergelijking.
- De gekozen optie is de enige labelmaatregel en gaat altijd mee in de route (ook bij "1
  labelsprong"); er komen geen labelstappen bovenop.
- De advies-PDF's tonen het uitgangspunt, de tabel met alle opties en de gekozen optie.

**Brongetrouw.** Met `brongetrouw: true` (vergelijkingstests) en `bronGetrouw: true` (PDF) wordt
het advieslabel nooit gebruikt en is er geen gekozen optie. Tests: `energieAdvies.test.ts`
(zonder bevestiging, na "Nee", na "Ja"; punten huidige situatie gelijk), `EnergieAdviesKeuze.test.tsx`,
`ai.test.ts`, `pdf.afwijkingen.test.ts`.

### Archief: versie kiezen (`archief.ts`, `Archief.tsx`)

De bron toont per telling alleen het aantal versies ("geen versies", "1 versie", "3 versies").
Dat staat nu in de kolom Versies.

Aanvulling op de bron:

- Heeft een telling meerdere versies, dan staat er een keuzelijst bij: eerst de werkversie, dan
  de versies van nieuw naar oud ("v2 — Na renovatie").
- "Openen" opent de gekozen versie (`/wws?id=…&versie=2`). Dat werkt zoals "Openen" in de
  versielijst: de werkversie wordt daarop gebaseerd, en Opslaan werkt die versie bij.
- De namen komen uit dezelfde lichte versie-query als het dashboard, die daarvoor ook
  `notitie` ophaalt.

### Indelingsadvies (`indeling.ts`)

- **Toiletvangnet** (`toiletVangnet`, getest in `indeling.test.ts`). De bron kan een variant zonder
  enig toilet opleveren: bij "geen aparte toiletruimte" krijgt alleen een _nieuw_ voorgestelde
  badkamer een toilet, niet een behouden badkamer zonder toilet; en bij "auto" komt er geen losse
  toiletruimte bij zodra er een behouden badkamer is — vervalt de bestaande toiletruimte, dan blijft
  er niets over. Na `bouwVariant` controleert de app daarom of de variant ergens een toilet heeft
  (toiletruimte met toilet, of badkamer met staand/hangend toilet). Zo niet, dan krijgt de eerste
  badkamer (behouden of nieuw) `toiletStaand = 1`, zoals de bron al doet voor een nieuwe badkamer,
  en meldt de variantkaart "toilet toegevoegd aan de badkamer". Is er ook geen badkamer, dan toont
  de kaart een waarschuwing. De punten van de variant worden ná het vangnet berekend.
- **Slaapkamers doornummeren** (`slaapkamersDoornummeren`, getest in `indeling.test.ts`).
  - Het probleem: de bron noemt nieuw voorgestelde slaapkamers altijd "Slaapkamer 1",
    "Slaapkamer 2", …. Bij een vaste "Slaapkamer 1" staan er dan twee met dezelfde naam.
  - Nu: na het vangnet krijgen de nieuwe slaapkamers de nummers na het hoogste nummer van de
    bestaande ruimten (vaste "Slaapkamer 1" → nieuw "Slaapkamer 2", "Slaapkamer 3").
  - Alleen de namen die `bouwVariant` zelf gaf veranderen; de punten blijven gelijk.
  - De vergelijkingstest gebruikt `berekenVariantenKern`, zonder deze stap.
- **Toepassen** (sinds fase 4c weer zoals de bron): de AI-afbeelding van de variant, of anders
  het getekende blokkenschema, wordt de nieuwe plattegrond van de telling. De oude afbeelding
  (`plattegrondImg` of de verwijzing naar Storage) en de `bbox`'en gaan eruit, want die passen
  niet meer bij de nieuwe indeling. De nieuwe afbeelding gaat bij Opslaan naar Storage.
- **Stap 1 met adres, WOZ en energielabel** (sinds fase 5a weer zoals de bron,
  `renderIndelingEigenaar`).
  - **Wat terugkomt:** boven "Eigenaar" staan weer de blokken "Adres en WOZ" en "Energielabel".
    Het eerste blok heeft postcode, huisnummer en plaats, de EP-Online-link met "Energielabel
    automatisch ophalen", de WOZ-waarde en de WOZ-link. Het tweede heeft de tegels en velden van
    rubriek 4 (`EnergieVelden`). De knop heet "Volgende stap: ruimten →".
  - **Teruggedraaid:** in fase 3b was gekozen voor "geen dubbele velden". Stap 1 had toen alleen
    een waarschuwing ("Vul het in bij de telling zelf"). Die keuze is teruggedraaid vanwege de
    Blanco-start: daar is de telling nog leeg en is er geen editor om het label in te vullen.
  - **Geen kopie:** de editor maakt de velden (`indelingStap1` in `TellingEditor`) met zijn eigen
    `MetaVeld`, opzoekfuncties (PDOK, EP-Online), vergrendeling en `setInput`. Ze bewerken dus de
    meta en input van de werkversie zelf. Het venster rekent verder met de invoer van de editor.
  - **Kijkrol:** de velden staan uit en "ophalen" ontbreekt.
- **Eigenaar en PvE pas bij toepassen**: de bron zet `meta.klantId` al bij stap 1 → 2 en legt geen
  `meta.pveId` vast. De app koppelt eigenaar én gebruikt PvE pas bij "Toepassen", zodat annuleren
  geen bijwerking heeft en later stil invullen hetzelfde PvE gebruikt.

### PDF's (`pdf/`)

De vergelijkingstest (`pdf.vergelijk.test.ts`) maakt de PDF's met `bronGetrouw: true`, precies als
de bron. De app laat die optie weg, en dan gelden de afwijkingen hieronder. Ze hebben eigen tests
in `pdf.afwijkingen.test.ts`.

- **Huisstijl-lettertype Inter, en "≤" weer gewoon "≤"** (fase 5b; `nieuwDoc` en `pdfTxt` in
  `stijl.ts`, laden in `laden.ts`). Dit vervangt de vroegere afwijking "≤ wordt <=".
  - **Het probleem:** de ingebouwde Helvetica van jsPDF kent geen "≤". In de bron werd een tekst
    met "≤" als losse letters getekend. Het gaat om de energie-indexklassen, zoals
    "1,4 < EI ≤ 1,8", in de telling-PDF en in de adviesroutes.
  - **Nu:** de app sluit Inter Regular en Bold in en gebruikt die voor alle tekst, ook in de
    tabellen. Daarmee blijft "≤" gewoon staan. Elke keuze voor "helvetica" wordt Inter. Schuin
    zit niet in de ingesloten set, dus die tekst wordt gewoon.
  - **Gevolg:** Inter is iets breder dan Helvetica, waardoor een lange regel soms op een andere
    plek afbreekt dan in de oude tool. De tekst zelf blijft gelijk. Gemeten op 40 willekeurige
    woningen: 37 telling-PDF's hebben exact dezelfde tekst, 2 verschillen alleen in "≤" en 1
    breekt één woord anders af. Het aantal pagina's is overal gelijk.
  - **Terugval:** lukt het laden van het lettertype niet, dan wordt de PDF met Helvetica gemaakt
    en wordt "≤" weer "<=", zodat een download niet mislukt.
  - **Herkomst lettertype:** Inter 4.1 van de officiële release (github.com/rsms/inter), met het
    licentiebestand (SIL Open Font License) in `vendor/fonts/inter-4.1/`. De release publiceert
    geen eigen checksum. Daarom is de zip twee keer apart gedownload; beide downloads waren
    gelijk en de zip-CRC klopte. De SHA-256 van zip en bestanden staat in `SHA256SUMS`.
- **Route-PDF ("Route als PDF"): de beginsituatie** (`routeAanvullen` in `rapporten.ts`).
  - Het probleem: de bron gaf de route geen begin-soort mee. Met een labelstap toonde de
    energiekaart daardoor "Van undefined naar nieuw energielabel …".
  - Nu: de kaart toont "Van label C naar …", of bij een energie-index of bouwjaar
    "Van energie-index … naar nieuw energielabel …".
- **Route-PDF: het eindlabel.**
  - Het probleem: het adviesdialoog houdt geen eindlabel per stap bij, dus de bron toonde "?".
  - Nu: het label na de gekozen stappen tot en met de labelstap wordt ingevuld, net als
    berekenRoute() dat voor het adviesrapport al doet.

### AI (`ai/`)

- **De AI-afbeelding krijgt geen vrije ruimtenamen.**
  - Hoe: `indelingAIPrompt` noemt de standaardnaam van het ruimtetype, met m², in plaats van wat
    een gebruiker heeft ingetypt. Zo gaat er geen vrije tekst naar Gemini.
  - Test: de vergelijkingstest gebruikt in de bron lege namen; dan zijn beide gelijk.
- **Extra regels voor de AI-afbeelding** (`INDELING_EXTRA_REGELS`, vóór de slotzin).
  - Waarom: Gemini tekende een algemeen trappenhuis als slaapkamer, liet een badkamer weg en zette
    een raam in een woningscheidende wand.
  - Regels: alleen binnen de woning tekenen (trappenhuis, portiek, galerij, lift en buren blijven
    ongemoeid); geen nieuwe ramen of buitendeuren, nooit een raam in een woningscheidende wand;
    elke genoemde ruimte (ook badkamer en toilet) precies één keer met bijschrift.
  - Test: de vergelijkingstest zet dezelfde regels in de bron-uitkomst vóór "Nogmaals:".
- **Geen foutmelding van Google of Anthropic in beeld.**
  - De bron toonde Googles letterlijke foutmelding.
  - Nu: alleen een eigen, Nederlandse melding per foutcode.
- **Daglimiet per gebruiker.** Deze bestaat niet in de bron.
