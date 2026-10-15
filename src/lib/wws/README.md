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
  enig toilet opleveren: bij "geen aparte toiletruimte" krijgt alleen een *nieuw* voorgestelde
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
- **Geen foutmelding van Google of Anthropic in beeld.**
  - De bron toonde Googles letterlijke foutmelding.
  - Nu: alleen een eigen, Nederlandse melding per foutcode.
- **Daglimiet per gebruiker.** Deze bestaat niet in de bron.
