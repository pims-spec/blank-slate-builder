// Automatisch geëxtraheerd uit reference/wws-site.html — alleen voor de vergelijkingstest
// src/lib/wws/indeling.vergelijk.test.ts. Letterlijke regels (niet bewerken):
//   1729–1736  INDELING_VERWARMD_AUTO_OVERIG_JA, indelingAutoVerwarmd, indelingVerwarmdWens
//   4728–4732  platBboxOk
//   5050–5069  openIndeling
//   5205–5217  INDELING_HOEKEN, indelingLegeNotches, indelingNotchLeeg, indelingNormaliseerNotch
//   5454–5631  indelingGenFacRow, indelingSplitsCirculatie, indelingBouwVariant
//   5640–5644  indelingVariantBlokjes
//   5694–5725  genereerIndelingVarianten
//   5734–5760  indelingVloerplanLayout
//   5822–5827  indelingBuitenrand
//   5835–5841  indelingUnieBbox
//   5930–5949  indelingToepassen
// De globals van de pagina (cur, klanten, indelingState, N) en de DOM/canvas-functies komen
// binnen als parameters/stubs van maakIndeling(); calc en hulpfuncties komen uit
// wws-site-calc.cjs (fase 1), pasPveOpFac en klantActievePves uit wws-site-pve.cjs (2b-2).
const { calc, clone, num, r2, fmt, typeOf, facDefault, facKind } = require("./wws-site-calc.cjs");

function maakIndeling(staat, N, pve, stubs) {
  const { pasPveOpFac, klantActievePves } = pve;
  const { document, indelingSchemaDataUrl, toonIndelingScreen, renderIndeling, verlaatIndeling, renderMain, setDirty, toast } = stubs;
  let cur = staat.cur, klanten = staat.klanten, indelingState = staat.indelingState;
// ---- regels 1729–1736 ----
const INDELING_VERWARMD_AUTO_OVERIG_JA=new Set(["wasruimte"]);
function indelingAutoVerwarmd(key,type){return key==="vertrekken"?true:INDELING_VERWARMD_AUTO_OVERIG_JA.has(type);}
function indelingVerwarmdWens(key,type,pve){
  const w=pve&&pve.indeling&&pve.indeling.verwarmd;
  const k=key+":"+type;
  if(w&&Object.prototype.hasOwnProperty.call(w,k))return !!w[k];
  return indelingAutoVerwarmd(key,type);
}
// ---- regels 4728–4732 ----
function platBboxOk(b){
  if(!b||typeof b!=="object")return false;
  const {x,y,w,h}=b;
  return [x,y,w,h].every(v=>typeof v==="number"&&isFinite(v))&&w>0&&h>0&&x>=-0.02&&y>=-0.02&&x+w<=1.02&&y+h<=1.02;
}
// ---- regels 5050–5069 ----
function openIndeling(viaBlanco){
  if(!cur)return;
  const rooms=[];
  ["vertrekken","overig"].forEach(key=>{
    (cur.input[key]||[]).forEach((r,i)=>{
      const kind=facKind(key,r.type);
      const notch=indelingNormaliseerNotch(r.notch);
      rooms.push({key,idx:i,naam:r.naam,type:r.type,m2:num(r.m2),kind,status:kind?"vast":"vrij",bbox:platBboxOk(r.bbox)?r.bbox:null,notch});
    });
  });
  const k=cur.meta&&cur.meta.klantId?klanten.find(x=>x.id===cur.meta.klantId):null;
  const actief=k?klantActievePves(k):[];
  // 'viaBlanco' onthoudt dat deze telling net is aangemaakt vanuit de 'Blanco'-start (zie
  // btnIndelingStartBlanco): dan toont stap 'eigenaar' een extra knop om terug te gaan naar de
  // plattegrond-stap, zodat een verkeerd ingelezen of -gekozen ruimte alsnog aan te passen is
  // zonder helemaal opnieuw te beginnen.
  indelingState={rooms,pveId:actief.length===1?actief[0].id:"",klantId:k?k.id:null,varianten:[],extraSlaap:"",step:"eigenaar",viaBlanco:!!viaBlanco};
  toonIndelingScreen();
  renderIndeling();
}
// ---- regels 5205–5217 ----
const INDELING_HOEKEN=["tl","tr","bl","br"];
function indelingLegeNotches(){return {tl:null,tr:null,bl:null,br:null};}
function indelingNotchLeeg(n){return !n||INDELING_HOEKEN.every(h=>!n[h]);}
function indelingNormaliseerNotch(n){
  const out=indelingLegeNotches();
  if(!n||typeof n!=="object")return out;
  if(INDELING_HOEKEN.some(h=>n[h]!==undefined)){
    INDELING_HOEKEN.forEach(h=>{const v=n[h];if(v&&v.w>0.01&&v.h>0.01)out[h]={w:v.w,h:v.h};});
    return out;
  }
  if(n.w>0.01&&n.h>0.01)out.tl={w:n.w,h:n.h}; // oud formaat: een los {w,h} was altijd linksboven
  return out;
}
// ---- regels 5454–5631 ----
function indelingGenFacRow(key,type,naam,m2,kind,pve){
  const row={type,naam,m2:String(r2(m2)).replace(".",","),maten:[],verwarmd:indelingVerwarmdWens(key,type,pve),_indNieuw:true};
  const fac=facDefault(kind,false);
  if(pve)pasPveOpFac(fac,pve);
  row.fac=fac;
  return row;
}
// Bouwt voor een gekozen aantal slaapkamers een kandidaat-ruimtelijst: vaste ruimten blijven
// precies zoals ze zijn; vrije ruimten (incl. eventueel vrij gezette keuken/badkamer/toilet/was)
// gaan in één gezamenlijke pot m² die wordt verdeeld over een woonkamer en de slaapkamers.
// Een hal/overloop die 'vrij' staat, wordt niet in zijn geheel opgelost in de pot: in de praktijk
// verdwijnt een looproute zelden helemaal, maar kan hij vaak wel flink kleiner worden doordat een
// deel bij een aangrenzend vertrek (bijv. de woonkamer) wordt getrokken. Daarom houden we
// automatisch een kleiner restant hal/overloop aan (circa 30%, met een minimum) en gaat alleen de
// rest de pot in — dat levert precies het 'hal deels bij de woonkamer trekken' op zonder dat de
// gebruiker dit apart hoeft aan te geven. Wil je een hal volledig ongemoeid laten, zet 'm op 'Vast
// houden'; wil je 'm volledig laten vervallen (bijv. een nieuwe route elders), zet 'm op 'Vervalt'.
function indelingSplitsCirculatie(rooms){
  const gewoneVrij=[],verkeerVrij=[],behoudenCirculatie=[];
  let poolUitVerkeer=0;
  rooms.forEach(r=>{
    if(typeOf(r.key,r.type).verkeer){
      const behoud=Math.min(r.m2,Math.max(2,r2(r.m2*0.3)));
      poolUitVerkeer+=r2(r.m2-behoud);
      if(behoud>0){
        const bron=(cur.input[r.key]||[])[r.idx];
        const row=bron?clone(bron):{type:r.type,naam:r.naam,maten:[]};
        row.m2=String(behoud).replace(".",",");row.maten=[];row._indVast=true;
        // Bewaar een verkleinde versie van de echte, uit de plattegrond ingelezen positie, zodat het
        // overblijvende stukje hal/gang nog steeds op de werkelijke plek wordt getekend (bijv. bij de
        // voordeur) in plaats van willekeurig ergens in de vrije ruimte te worden neergezet door het
        // generieke indelingVloerplanLayout-algoritme (zie feedback: "ingang zit daar helemaal niet").
        if(r.bbox&&r.m2>0){
          const f=Math.sqrt(Math.max(0,Math.min(1,behoud/r.m2)));
          row.bbox={x:r.bbox.x,y:r.bbox.y,w:Math.max(0.02,r.bbox.w*f),h:Math.max(0.02,r.bbox.h*f)};
        }else delete row.bbox;
        behoudenCirculatie.push({key:r.key,row});
      }
      verkeerVrij.push(r);
    }else gewoneVrij.push(r);
  });
  return {poolBasis:gewoneVrij.reduce((s,r)=>s+r.m2,0)+poolUitVerkeer,behoudenCirculatie};
}
function indelingBouwVariant(nSlaap,pve){
  const rooms=indelingState.rooms;
  const vast=rooms.filter(r=>r.status==="vast");
  const vrij=rooms.filter(r=>r.status==="vrij");
  const circulatie=indelingSplitsCirculatie(vrij);
  let pool=circulatie.poolBasis;
  const nieuweFac=[];
  // Een 'vaste' ruimte zonder bruikbaar oppervlak (bijv. een door de AI herkende badkamer waar geen
  // m² bij kon worden bepaald, dus m2=0) telt hieronder NIET als 'er is al een badkamer': anders
  // blijft zo'n voorziening onzichtbaar (een 0 m²-blok wordt nergens getoond) zonder dat er alsnog
  // een bruikbare badkamer wordt voorgesteld. Zo'n ruimte wordt dus gewoon herkend als ontbrekend en
  // met een redelijk oppervlak opnieuw voorgesteld, in plaats van als (onzichtbaar) 'vast' te gelden.
  const heeftVasteWoonkamer=vast.some(r=>["woonkamer","woonkamer_ok","woonslaap","woonslaap_ok"].includes(r.type)&&r.m2>0);
  // Of er al een behouden ('vaste') badkamer is -- gebruikt hieronder om te voorkomen dat er bij de
  // standaardwens ONNODIG een tweede, losse toiletruimte bij komt terwijl de bestaande badkamer al
  // een volwaardige sanitaire ruimte is (feedback: "twee toiletten" in de voorgestelde indeling,
  // waarbij de nieuwe toiletruimte ook nog eens vloeroppervlak wegkaapte dat beter naar de
  // woonkamer/slaapkamer had gekund). We gaan er daarbij vanuit dat een bestaande, behouden
  // "badkamer" al een toilet bevat, ongeacht of de eerder (bijv. automatisch van een foto)
  // ingelezen voorzieningen dat exact zo hebben vastgelegd -- dat is uit een plattegrond-foto vaak
  // toch niet betrouwbaar te herkennen.
  const vastBadkamer=vast.find(r=>r.kind==="badkamer"&&r.m2>0);
  // Een geselecteerd PvE kan naast de uitrusting (inductie, meerpersoonswastafel...) ook
  // indelingswensen bevatten die bepalen WELKE ruimten worden voorgesteld: wel/geen aparte
  // toiletruimte (dan telt het toilet mee als onderdeel van de badkamer) en wel/geen/altijd een
  // aparte wasruimte. Zie leegPve()/renderKlantPve() voor de invoer hiervan.
  const wens=(pve&&pve.indeling)||{};
  let badkamerFacVoorIntegratie=null;
  let nieuwToiletToegevoegd=false;
  // Indelingswens 'open keuken': in plaats van een losse keuken-ruimte gaat de keuken-uitrusting
  // direct bij de (nieuw voorgestelde) woonkamer, die dan als 'Woonkamer met open keuken' wordt
  // voorgesteld. Dit kan alleen als er nog geen vaste (behouden) woonkamer is om de keuken aan toe
  // te voegen — is die er al (bijv. een bestaande, vastgehouden woonkamer), dan wordt gewoon een
  // losse keuken voorgesteld, net als bij de standaardwens.
  const keukenOpenGewenst=wens.keuken==="open"&&!heeftVasteWoonkamer&&!vast.some(r=>r.kind==="keuken"&&r.m2>0);
  let keukenOpenM2=0;
  ["keuken","badkamer","toilet","was"].forEach(kind=>{
    const heeftVrije=vrij.some(r=>r.kind===kind);
    const heeftVaste=vast.some(r=>r.kind===kind&&r.m2>0);
    // Keuken/badkamer/toilet zijn in de praktijk altijd nodig, ook als er (nog) helemaal geen
    // ruimte van dat type bestaat — bijv. bij een 'blanco' start zonder ingelezen plattegrond, of
    // een plattegrond waar de AI geen badkamer in herkende. Zonder deze regel werd zo'n voorziening
    // alleen 'geregenereerd' als er al een vrije ruimte van dat type bestond, en bleef een
    // voorgestelde indeling een badkamer/keuken volledig missen. Een aparte wasruimte is optioneel
    // en wordt daarom standaard alleen toegevoegd als er al één bestond, tenzij de indelingswens
    // dit expliciet afdwingt of juist uitsluit.
    if(kind==="toilet"){
      if(wens.apartToilet==="nee")return; // toilet komt zo in de badkamer terecht i.p.v. als losse ruimte
      // Bij de standaardwens ('auto') alléén een aparte toiletruimte voorstellen als er nog geen
      // bestaande, behouden badkamer is die al als volwaardige sanitaire ruimte dient -- anders
      // ontstaat een woning met per saldo twee toiletten. Kiest de eigenaar expliciet 'altijd een
      // aparte toiletruimte' (wens.apartToilet==="ja"), dan komt hij er hoe dan ook bij, maar wordt
      // het toilet in de bestaande badkamer verderop losgelaten zodat het er nog steeds maar één is.
      if(wens.apartToilet!=="ja"&&vastBadkamer)return;
    }
    if(kind==="was"&&wens.wasruimte==="nee")return; // nooit een aparte wasruimte, ook niet als die er al was
    if(kind==="keuken"&&keukenOpenGewenst){
      // Geen losse keuken-ruimte: reserveer wel de m² uit de pot, maar die gaat straks naar de
      // woonkamer (zie 'woon' hieronder) in plaats van naar een eigen ruimte.
      keukenOpenM2=Math.min(8,Math.max(2,pool*0.12));
      pool-=keukenOpenM2;
      return;
    }
    let verplicht=kind!=="was";
    if(kind==="was"&&wens.wasruimte==="ja")verplicht=true;
    if(!heeftVaste&&(heeftVrije||verplicht)){
      const standaardM2={keuken:8,badkamer:5,toilet:2,was:3}[kind];
      const m2=Math.min(standaardM2,Math.max(2,pool*0.12));
      pool-=m2;
      const type=kind==="keuken"?"keuken":kind==="badkamer"?"badkamer":kind==="toilet"?"toilet":"wasruimte";
      const naam=kind==="keuken"?"Keuken":kind==="badkamer"?"Badkamer":kind==="toilet"?"Toilet":"Wasruimte";
      const key=(kind==="toilet"||kind==="was")?"overig":"vertrekken";
      const genRow=indelingGenFacRow(key,type,naam,m2,kind,pve);
      nieuweFac.push({key,row:genRow});
      if(kind==="badkamer")badkamerFacVoorIntegratie=genRow.fac;
      if(kind==="toilet")nieuwToiletToegevoegd=true;
    }
  });
  // Geen aparte toiletruimte gewenst: zorg dat de (nieuw voorgestelde) badkamer zelf een toilet
  // telt, zodat de WWS-punten voor een toilet niet gewoon verdwijnen.
  if(wens.apartToilet==="nee"&&badkamerFacVoorIntegratie&&badkamerFacVoorIntegratie.san&&!badkamerFacVoorIntegratie.san.toiletStaand&&!badkamerFacVoorIntegratie.san.toiletHang){
    badkamerFacVoorIntegratie.san.toiletStaand=1;
  }
  let woon=null;
  if(!heeftVasteWoonkamer){
    // Woonkamer en slaapkamers verdelen de pot voortaan naar een vaste verhouding (de woonkamer
    // weegt 1,35x een slaapkamer) in plaats van de woonkamer eerst een vast percentage (40%, met een
    // plafond van 28 m²) te geven en de slaapkamers domweg de rest te laten delen -- bij een ruime
    // pot en weinig slaapkamers kon dat laatste een slaapkamer GROTER dan de woonkamer opleveren
    // (feedback: "slaapkamer groter dan woonkamer is een gekke keuze"), wat geen enkele echte
    // woningindeling zo zou doen. Met een vaste verhouding blijft de woonkamer, ongeacht het aantal
    // slaapkamers of de grootte van de pot, altijd het grootste vertrek -- en gaat nog steeds de
    // volle pot (dus alle punten) naar bruikbare vertrekken, er wordt geen oppervlak "weggegooid".
    const GEWICHT_WOON=1.35;
    let woonBasisM2=nSlaap>0?pool*GEWICHT_WOON/(GEWICHT_WOON+nSlaap):pool;
    woonBasisM2=Math.max(12,woonBasisM2);
    pool-=woonBasisM2;
    const woonM2=woonBasisM2+keukenOpenM2;
    woon={type:keukenOpenM2>0?"woonkamer_ok":"woonkamer",naam:keukenOpenM2>0?"Woonkamer met open keuken":"Woonkamer",m2:String(r2(woonM2)).replace(".",","),maten:[],verwarmd:indelingVerwarmdWens("vertrekken","woonkamer",pve),_indNieuw:true};
    if(keukenOpenM2>0){const fac=facDefault("keuken",false);if(pve)pasPveOpFac(fac,pve);woon.fac=fac;}
  }
  const perSlaap=nSlaap>0?pool/nSlaap:0;
  if(nSlaap>0&&perSlaap<6)return null;
  const slaapkamers=[];
  for(let i=0;i<nSlaap;i++)slaapkamers.push({type:"slaapkamer",naam:"Slaapkamer "+(i+1),m2:String(r2(perSlaap)).replace(".",","),maten:[],verwarmd:indelingVerwarmdWens("vertrekken","slaapkamer",pve),_indNieuw:true});
  const vertrekken=[],overig=[];
  // '_indVast'/'_indNieuw' zijn alleen bedoeld om in het blokkenschema (indelingSchemaDataUrl/
  // indelingVariantKaartHtml) zichtbaar onderscheid te maken tussen ruimten die letterlijk uit de
  // bestaande plattegrond zijn behouden ('vast gehouden') en ruimten die de tool nieuw heeft
  // voorgesteld — dat was precies de klacht dat het schema "totaal niet op de eerste plattegrond
  // lijkt" en geen rekening leek te houden met vastgehouden ruimten. Ze worden hieronder (vóór het
  // opslaan bij de telling, in indelingToepassen) weer verwijderd: het zijn geen echte veldwaarden.
  vast.forEach(r=>{
    if(r.kind&&!(r.m2>0))return; // zie hierboven: een voorziening zonder bruikbaar oppervlak wordt hierboven al als ontbrekend behandeld en dus met een echt oppervlak opnieuw voorgesteld — dan niet óók nog als leeg/0 m² blok meenemen
    const bron=((cur.input[r.key]||[])[r.idx]);if(!bron)return;
    const row=clone(bron);
    // Een 'vast gehouden' keuken/badkamer/toilet behoudt zijn plek en afmeting, maar de
    // uitrusting (kranen, wastafels, aanrecht...) volgt alsnog het PvE van de gekozen eigenaar,
    // zolang die ruimte nog op onbewerkte standaardwaarden staat (pasPveOpFac doet die check) —
    // anders werd een PvE alleen toegepast op nieuw voorgestelde ruimten en nooit op ruimten die
    // al van de plattegrond kwamen, wat in de praktijk de meeste gevallen zijn.
    if(r.kind&&pve&&row.fac)pasPveOpFac(row.fac,pve);
    // Komt er (alleen mogelijk bij de wens 'altijd een aparte toiletruimte') ernaast ook nog een
    // gloednieuwe, losse toiletruimte bij, dan vervalt het toilet in déze behouden badkamer: anders
    // telt de woning per saldo twee toiletten terwijl er maar één hoort te zijn.
    if(r.kind==="badkamer"&&nieuwToiletToegevoegd&&row.fac&&row.fac.san){row.fac.san.toiletStaand=0;row.fac.san.toiletHang=0;}
    row._indVast=true;
    (r.key==="vertrekken"?vertrekken:overig).push(row);
  });
  circulatie.behoudenCirculatie.forEach(c=>(c.key==="vertrekken"?vertrekken:overig).push(c.row));
  nieuweFac.forEach(n=>(n.key==="vertrekken"?vertrekken:overig).push(n.row));
  if(woon)vertrekken.push(woon);
  slaapkamers.forEach(s=>vertrekken.push(s));
  return {vertrekken,overig,nSlaap};
}
// ---- regels 5640–5644 ----
function indelingVariantBlokjes(v){
  return v.vertrekken.map(r=>({label:r.naam||typeOf("vertrekken",r.type).l,m2:num(r.m2),vast:!!r._indVast,nieuw:!!r._indNieuw})).concat(
    v.overig.map(r=>({label:r.naam||typeOf("overig",r.type).l,m2:num(r.m2),vast:!!r._indVast,nieuw:!!r._indNieuw}))
  ).filter(b=>b.m2>0);
}
// ---- regels 5694–5725 ----
function genereerIndelingVarianten(){
  if(!cur)return;
  const k=indelingState.klantId?klanten.find(x=>x.id===indelingState.klantId):null;
  const pve=(k&&indelingState.pveId)?(k.pves||[]).find(p=>p.id===indelingState.pveId):null;
  const huidigSlaap=indelingState.rooms.filter(r=>r.type==="slaapkamer"||r.type==="slaap_san").length;
  const extraEl=document.querySelector("#indelingExtraSlaap");
  const extraRaw=extraEl?extraEl.value:"";
  indelingState.extraSlaap=extraRaw;
  const extra=extraRaw?Math.round(num(extraRaw)):0;
  // Naast de automatisch voorgestelde aantallen (huidig -1/0/+1/+2) kan de gebruiker hier zelf een
  // specifiek aantal slaapkamers opgeven — bijvoorbeeld om expliciet een extra (tweede) slaapkamer
  // te laten voorstellen, ook als die niet toevallig in de automatische reeks zit. Een geselecteerd
  // PvE met een eigen 'gewenst aantal slaapkamers' telt hier ook als kandidaat mee, zodat die
  // eigenaarswens niet elke keer opnieuw hoeft te worden ingetypt.
  const pveSlaap=pve&&pve.indeling&&pve.indeling.slaapkamers?Math.round(num(pve.indeling.slaapkamers)):0;
  const kandidatenSet=new Set([Math.max(1,huidigSlaap-1),Math.max(1,huidigSlaap),huidigSlaap+1,huidigSlaap+2]);
  if(extra>0)kandidatenSet.add(extra);
  if(pveSlaap>0)kandidatenSet.add(pveSlaap);
  const kandidaten=Array.from(kandidatenSet).sort((a,b)=>a-b);
  const varianten=[];
  kandidaten.forEach(n=>{
    const v=indelingBouwVariant(n,pve);
    if(!v)return;
    const genInput=clone(cur.input);genInput.vertrekken=v.vertrekken;genInput.overig=v.overig;
    v.R=calc(genInput,N);v.input=genInput;
    v.schemaUrl=indelingSchemaDataUrl(v.vertrekken,v.overig,indelingState.rooms);
    varianten.push(v);
  });
  indelingState.varianten=varianten;
  indelingState.step="resultaten";
  renderIndeling();
}
// ---- regels 5734–5760 ----
function indelingVloerplanLayout(items,W,H){
  const n=items.length;
  if(!n)return [];
  const totaal=items.reduce((s,it)=>s+it.m2,0)||1;
  const nRijen=Math.max(1,Math.min(n,Math.round(Math.sqrt(n*(H/W)))||1));
  const volgorde=items.map((it,i)=>({it,i})).sort((a,b)=>b.it.m2-a.it.m2);
  const rijen=Array.from({length:nRijen},()=>({items:[],totaal:0}));
  volgorde.forEach(({it,i})=>{
    let doel=rijen[0];
    rijen.forEach(r=>{if(r.totaal<doel.totaal)doel=r;});
    doel.items.push({it,i});doel.totaal+=it.m2;
  });
  const nietLeeg=rijen.filter(r=>r.items.length);
  const out=new Array(n);
  let y=0;
  nietLeeg.forEach(r=>{
    const h=Math.max(1,(r.totaal/totaal)*H);
    let x=0;
    r.items.forEach(({it,i})=>{
      const w=Math.max(1,(it.m2/r.totaal)*W);
      out[i]={x,y,w,h};
      x+=w;
    });
    y+=h;
  });
  return out;
}
// ---- regels 5822–5827 ----
function indelingBuitenrand(x,y,w,h,W,H,PAD){
  const marge=14;
  const afstanden=[["links",x-PAD],["rechts",(W-PAD)-(x+w)],["boven",y-PAD],["onder",(H-PAD)-(y+h)]];
  const dichtstbij=afstanden.reduce((a,b)=>b[1]<a[1]?b:a);
  return dichtstbij[1]<=marge?dichtstbij[0]:null;
}
// ---- regels 5835–5841 ----
function indelingUnieBbox(rooms){
  const geldig=(rooms||[]).filter(r=>platBboxOk(r.bbox));
  if(!geldig.length)return null;
  const x0=Math.min(...geldig.map(r=>r.bbox.x)),y0=Math.min(...geldig.map(r=>r.bbox.y));
  const x1=Math.max(...geldig.map(r=>r.bbox.x+r.bbox.w)),y1=Math.max(...geldig.map(r=>r.bbox.y+r.bbox.h));
  return {x:x0,y:y0,w:Math.max(0.02,x1-x0),h:Math.max(0.02,y1-y0)};
}
// ---- regels 5930–5949 ----
function indelingToepassen(i){
  const v=indelingState.varianten[i];if(!v||!cur)return;
  cur.input.vertrekken=v.vertrekken;cur.input.overig=v.overig;
  // '_indVast'/'_indNieuw' zijn alleen bedoeld om in het Indelingsadvies-scherm zelf (schema +
  // legenda) vast/nieuw te onderscheiden (zie indelingBouwVariant); dat is geen echte veldwaarde
  // van de telling en hoort dus niet mee te worden opgeslagen.
  cur.input.vertrekken.forEach(r=>{delete r._indVast;delete r._indNieuw;});
  cur.input.overig.forEach(r=>{delete r._indVast;delete r._indNieuw;});
  // Is er voor deze variant een AI-gegenereerde afbeelding gemaakt (zie indelingGenereerAIAfbeelding),
  // gebruik die dan als nieuwe plattegrond-afbeelding in plaats van het eenvoudige blokkenschema --
  // die bewerkt immers de echte foto, in plaats van er een losse blokjestekening van te maken.
  const schema=v.aiImg||indelingSchemaDataUrl(v.vertrekken,v.overig,indelingState.rooms);
  // De bbox-coördinaten horen bij de oude, ingelezen plattegrond-afbeelding; zodra die vervangen
  // wordt door een nieuwe afbeelding met de aangepaste indeling, kloppen ze nergens meer en zouden
  // ze bij een volgende keer Indelingsadvies een onzinnig geplaatst klikvlak opleveren. Strip ze
  // dan, zodat de tool netjes terugvalt op de lijst.
  if(schema){cur.input.vertrekken.forEach(r=>delete r.bbox);cur.input.overig.forEach(r=>delete r.bbox);cur.input.plattegrondImg=schema;}
  setDirty(true);verlaatIndeling();renderMain();
  toast("Indeling met "+v.nSlaap+" slaapkamer"+(v.nSlaap===1?"":"s")+" toegepast ("+v.R.totaal+" punten)."+(v.aiImg?" De AI-gegenereerde afbeelding is als plattegrond-afbeelding bij deze telling opgeslagen.":schema?" Het blokkenschema is als plattegrond-afbeelding bij deze telling opgeslagen (geen bouwkundige tekening).":"")+" Sla dit op als nieuwe versie.");
}
return {
  openIndeling, genereerIndelingVarianten, indelingBouwVariant, indelingSplitsCirculatie,
  indelingVariantBlokjes, indelingVloerplanLayout, indelingBuitenrand, indelingUnieBbox,
  indelingToepassen, indelingVerwarmdWens,
  get indelingState() { return indelingState; },
};
}
module.exports = { maakIndeling };
