// Automatisch geëxtraheerd uit wws-site.html (regels 771–1216 + getPath) — alleen voor vergelijkingstests.

/* ---------------- Normen (Beleidsboek Huurcommissie, per 1 juli 2026) ---------------- */
const NORMEN_VERSIE="HC-2026-07";
const LABELS=["A++++","A+++","A++","A+","A","B","C","D","E","F","G"];
const INDEX_KLASSEN=["EI ≤ 0,6","0,6 < EI ≤ 0,8","0,8 < EI ≤ 1,2","1,2 < EI ≤ 1,4","1,4 < EI ≤ 1,8","1,8 < EI ≤ 2,1","2,1 < EI ≤ 2,4","2,4 < EI ≤ 2,7","EI > 2,7"];
const HUURTABEL_2026="25026,25653,26275,26902,27527,28150,28778,29403,30029,30654,31280,31902,32530,33154,33780,34405,35035,35653,36279,36909,37532,38155,38783,39406,40032,40658,41285,41910,42533,43156,43781,44409,45036,45657,46286,46909,47536,48160,48789,49410,50038,50722,51408,52096,52781,53470,54156,54841,55529,56213,56903,57587,58271,58961,59645,60332,61019,61708,62394,63082,63767,64453,65136,65824,66512,67195,67885,68570,69256,69944,70632,71320,72005,72695,73379,74066,74751,75437,76121,76808,77494,78185,78871,79556,80244,80930,81614,82302,82994,83674,84362,85049,85733,86424,87106,87797,88479,89167,89856,90539,91226,91914,92598,93293,93973,94661,95345,96033,96718,97405,98091,98778,99463,100150,100835,101522,102207,102900,103581,104273,104957,105642,106332,107014,107700,108388,109076,109761,110446,111139,111823,112508,113194,113885,114569,115255,115940,116627,117315,118001,118684,119376,120061,120746,121431,122121,122807,123492,124181,124865,125553,126240,126925,127612,128300,128986,129670,130357,131046,131728,132418,133103,133789,134475,135163,135850,136534,137224,137909,138595,139284,139969,140656,141343,142028,142715,143399,144086,144771,145460,146149,146831,147519,148205,148895,149577,150267,150953,151640,152328,153012,153698,154385,155071,155756,156446,157131,157817,158501,159191,159876,160564,161252,161936,162624,163310,163996,164678,165370,166054,166740";
const DEFAULT_NORMEN={
  versie:NORMEN_VERSIE,
  naam:"Beleidsboek WWS zelfstandige woonruimte Huurcommissie (per 1 juli 2026), huurprijstabel per 1 januari 2026",
  oppVertrek:1, oppOverig:0.75, minVertrek:4, minOverig:2, zolderZonderTrap:5,
  verwVertrek:2, verwOverig:1, verwOverigMax:4, verkoelVertrek:1, verkoelMax:2,
  energie:{"A++++":[62,58],"A+++":[57,53],"A++":[52,48],"A+":[47,43],"A":[41,37],"B":[34,30],"C":[22,15],"D":[14,11],"E":[-4,-4],"F":[-9,-9],"G":[-15,-15]},
  energieIndex:[[0.6,52,48],[0.8,47,43],[1.2,41,37],[1.4,34,30],[1.8,22,15],[2.1,14,11],[2.4,-4,-4],[2.7,-9,-9],[999,-15,-15]],
  energieBouwjaar:[[2002,41,37],[2000,34,30],[1992,22,15],[1984,14,11],[1979,-4,-4],[1977,-9,-9],[0,-15,-15]],
  epv:[32,28],
  keukenKort:4, keukenLang:7,
  voorzKeuken:[
    {k:"afzuig",l:"Inbouw afzuiginstallatie",p:0.75},
    {k:"kook_ind",g:"kook",l:"Inbouw kookplaat inductie",p:1.75},
    {k:"kook_kera",g:"kook",l:"Inbouw kookplaat keramisch",p:1},
    {k:"kook_gas",g:"kook",l:"Inbouw kookplaat gas",p:0.5},
    {k:"koelkast",l:"Inbouw koelkast",p:1},
    {k:"vriezer",l:"Inbouw vrieskast",p:0.75},
    {k:"oven",g:"oven",l:"Inbouw oven elektrisch",p:1},
    {k:"oven_gas",g:"oven",l:"Inbouw oven gas",p:0.5},
    {k:"magnetron",l:"Inbouw magnetron",p:1},
    {k:"vaatwasser",l:"Inbouw vaatwasmachine",p:1.5},
    {k:"kast",l:"Extra kastruimte boven het minimum, per 60 cm breed (min. 60 cm hoog)",p:0.75,n:true},
    {k:"kraan_een",g:"kraan",l:"Eenhandsmengkraan",p:0.25},
    {k:"kraan_thermo",g:"kraan",l:"Thermostatische mengkraan",p:0.5},
    {k:"kokend",l:"Kokendwaterfunctie",p:0.5}
  ],
  san:{toiletStaandApart:3,toiletStaandBad:2,toiletHangApart:3.75,toiletHangBad:2.75,wastafelBad:1,wastafelElders:1,meerpersBad:1.5,meerpersElders:1.5,douche:4,bad:6,badDouche:7},
  voorzSan:[
    {k:"bubbel",l:"Bubbelfunctie van het bad",p:1.5,need:"bad"},
    {k:"afscheiding",l:"Gemonteerde volledige afscheiding van de douche",p:1.25,need:"douche"},
    {k:"handdoekrad",l:"Handdoekenradiator",p:0.75,n:true},
    {k:"kastje",l:"Ingebouwd kastje met in- of opgebouwde wastafel",p:1,n:true},
    {k:"kastruimte",l:"Kastruimte (min. 40 cm breed en hoog)",p:0.75},
    {k:"stopcontact",l:"Stopcontact (max. 2 per wastafel)",p:0.25,n:true},
    {k:"kraan_een",l:"Eenhandsmengkraan",p:0.25,n:true},
    {k:"kraan_thermo",l:"Thermostatische mengkraan",p:0.5,n:true}
  ],
  handicapPerPunt:332,
  buitenAanwezig:2, buitenPerM2:0.35, gemBuitenPerM2:0.75, geenBuiten:-5, buitenMax:15,
  parkeer:{I:9,II:6,III:4,laadpaal:2,m2TypeI:12},
  woz:{"2026":[16954,268,114],"2025":[15329,242,103],"2024":[14543,229,97],"2023":[14146,222,94]},
  wozMinimum:85806, taxatiePct:85, wozCapPct:33, wozMinNieuwbouw:40, nieuwbouwMinPunten:110,
  zorgPct:35, aanbel:0.25, laadpaal:2,
  opslag:{rijksPct:35,rijksPunten:50,gemprovPct:15,stadsPct:5,nieuwbouwPct:10},
  gecontroleerd:"2026-09-30", grensLaag:143, grensMidden:186, driveMap:"1MQ1rPgBJXohEwPrefWHJs2wezSw8Vqwt",
  huurTabel:HUURTABEL_2026, huurTabelStart:40,
  kosten:{labelStap:7500,verwVertrek:1500,koeling:3500,verwOverig:800,aanrecht:2500,keukenPunt:400,bad:4500,toiletHang:1500,toilet:3000,wastafel:700,sanPunt:400,balkon:12000,balkonM2:4,aanbel:900,laadpaal:2500}
};
const clone=o=>JSON.parse(JSON.stringify(o));
function mergeNormen(n){
  const d=clone(DEFAULT_NORMEN);if(!n)return d;
  if(n.versie!==NORMEN_VERSIE){if(n.kosten)Object.assign(d.kosten,n.kosten);return d;}
  for(const k in n){if(n[k]&&typeof n[k]==="object"&&!Array.isArray(n[k])&&d[k]&&typeof d[k]==="object"&&!Array.isArray(d[k]))Object.assign(d[k],n[k]);else d[k]=n[k];}
  return d;
}

/* ---------------- Ruimtetypen ---------------- */
// Volgorde en benamingen zoals in de Huurprijscheck van de Huurcommissie
const VERTREK_TYPES=[
  {k:"woonkamer",l:"Woonkamer"},
  {k:"keuken",l:"Keuken"},
  {k:"woonkamer_ok",l:"Woonkamer met open keuken",verwVertrekken:2},
  {k:"slaapkamer",l:"Slaapkamer"},
  {k:"badkamer",l:"Badkamer"},
  {k:"woonslaap",l:"Woon- en slaapkamer"},
  {k:"slaap_san",l:"Slaapkamer met wastafel, douche of bad"},
  {k:"woonslaap_ok",l:"Woon- en slaapkamer met keuken",verwVertrekken:2},
  {k:"zolderkamer",l:"Zolder (vaste trap, beschoten dak)"},
  {k:"eetkamer",l:"Eetkamer"},
  {k:"studeer",l:"Hobby- of studeerkamer"},
  {k:"overig",l:"Overig vertrek"}
];
const OVERIG_TYPES=[
  {k:"toilet",l:"Toiletruimte"},
  {k:"overloop",l:"Overloop",verkeer:true},
  {k:"hal",l:"Hal of gang",verkeer:true},
  {k:"kleine_kamer",l:"Kleine kamer (kleiner dan 4 m²)"},
  {k:"wasruimte",l:"Wasruimte / bijkeuken"},
  {k:"berging_in",l:"Berging"},
  {k:"berging_uit",l:"Fietsenberging of schuur"},
  {k:"garage",l:"Garage"},
  {k:"kelder",l:"Kelder"},
  {k:"zolder",l:"Zolderberging met vaste trap"},
  {k:"zolder_notrap",l:"Zolderberging zonder vaste trap"},
  {k:"overig",l:"Overige ruimte"}
];
const MONUMENT_OPTS=[["geen","Geen"],["rijks","Rijksmonument"],["gemprov","Gemeentelijk of provinciaal monument"],["stads","Beschermd stads- en dorpsgezicht"]];
// Keuzes zoals in de Huurprijscheck van de Huurcommissie
const MONUMENT_KEUZES=[["gemprov","Gemeentelijk of provinciaal monument"],["stads","Beschermd stads- en dorpsgezicht"],["rijks_voor","Rijksmonument, contract vóór 1 juli 2024"],["rijks_na","Rijksmonument, contract na 1 juli 2024"],["geen","Geen monument"]];
const isVertrekKey=key=>/vertrekken$/.test(key);
const typeOf=(key,k)=>(isVertrekKey(key)?VERTREK_TYPES:OVERIG_TYPES).find(t=>t.k===k)||(isVertrekKey(key)?VERTREK_TYPES:OVERIG_TYPES).find(t=>t.k==="overig");
function guessType(key,naam){
  const list=isVertrekKey(key)?VERTREK_TYPES:OVERIG_TYPES;const n=String(naam||"").toLowerCase();
  const hit=list.find(t=>n&&(n.startsWith(t.l.toLowerCase().split(/[ ,(]/)[0])||n.includes(t.k)));
  return hit?hit.k:"overig";
}
/* ---------------- Voorzieningen per ruimte (zoals de Huurprijscheck) ---------------- */
const KEUKEN_TYPES=["keuken","woonkamer_ok","woonslaap_ok"];
function facKind(key,type){
  if(key==="vertrekken"){if(KEUKEN_TYPES.includes(type))return "keuken";if(type==="badkamer")return "badkamer";if(type==="slaap_san")return "slaap_san";return null;}
  if(type==="toilet")return "toilet";if(type==="wasruimte")return "was";return null;
}
function facDefault(kind,leeg){
  if(kind==="keuken")return {kind,keuken:{lengte:leeg?"<1":"1-2",voorz:{}}};
  if(kind==="badkamer")return {kind,san:{toiletStaand:0,toiletHang:0,wastafel:leeg?0:1,meerpers:0,douche:leeg?0:1,bad:0,badDouche:0,eisenOk:true,voorz:{}}};
  if(kind==="slaap_san")return {kind,san:{wastafel:leeg?0:1,meerpers:0,douche:0,bad:0,badDouche:0}};
  if(kind==="toilet")return {kind,toilet:{toilet:leeg?"geen":"staand",fontein:false}};
  if(kind==="was")return {kind,was:{wastafel:false}};
  return null;
}
function ensureFac(key,r,leeg){const k=facKind(key,r.type);if(!k){if(r.fac)delete r.fac;return;}if(!r.fac||r.fac.kind!==k)r.fac=facDefault(k,leeg);}
function migrateFac(inp){
  // Oude tellingen: keuken en sanitair stonden los; verdeel ze over de ruimten
  const K=inp.keuken||{lengte:"<1",voorz:{}},S=inp.san||{};
  inp.vertrekken.forEach(r=>ensureFac("vertrekken",r,true));inp.overig.forEach(r=>ensureFac("overig",r,true));
  const kHas=K.lengte&&K.lengte!=="<1"||Object.keys(K.voorz||{}).length;
  let kr=inp.vertrekken.find(r=>r.fac&&r.fac.kind==="keuken");
  if(!kr&&kHas){kr={type:"keuken",naam:"",m2:"",maten:[{l:"",b:""}],verwarmd:false,verkoeld:false};ensureFac("vertrekken",kr,true);inp.vertrekken.push(kr);}
  if(kr)kr.fac.keuken={lengte:K.lengte||"<1",voorz:clone(K.voorz||{})};
  const bathItems=num(S.toiletStaandBad)+num(S.toiletHangBad)+num(S.wastafelBad)+num(S.meerpersBad)+num(S.douche)+num(S.bad)+num(S.badDouche)+Object.keys(S.voorz||{}).length;
  let br=inp.vertrekken.find(r=>r.fac&&r.fac.kind==="badkamer");
  const needBath=bathItems>0||num(S.wastafelElders)+num(S.meerpersElders)>0;
  if(!br&&needBath){br={type:"badkamer",naam:"",m2:"",maten:[{l:"",b:""}],verwarmd:false,verkoeld:false};ensureFac("vertrekken",br,true);inp.vertrekken.push(br);}
  if(br){const b=br.fac.san;b.toiletStaand=num(S.toiletStaandBad);b.toiletHang=num(S.toiletHangBad);b.wastafel=num(S.wastafelBad);b.meerpers=num(S.meerpersBad);b.douche=num(S.douche);b.bad=num(S.bad);b.badDouche=num(S.badDouche);b.eisenOk=S.eisenOk!==false;b.voorz=clone(S.voorz||{});}
  const trs=inp.overig.filter(r=>r.fac&&r.fac.kind==="toilet");
  const toiletten=[];for(let n=0;n<num(S.toiletHangApart);n++)toiletten.push("hangend");for(let n=0;n<num(S.toiletStaandApart);n++)toiletten.push("staand");
  toiletten.forEach((t,n)=>{let tr=trs[n];if(!tr){tr={type:"toilet",naam:"",m2:"",maten:[{l:"",b:""}],verwarmd:false};ensureFac("overig",tr,true);inp.overig.push(tr);trs.push(tr);}tr.fac.toilet.toilet=t;});
  let we=num(S.wastafelElders);for(const tr of trs){if(we<=0)break;tr.fac.toilet.fontein=true;we--;}
  if(br){br.fac.san.wastafel+=we;br.fac.san.meerpers+=num(S.meerpersElders);}
  inp.facV=1;
}
function deriveFac(inp){
  const keukens=[];const agg={toiletStaandApart:0,toiletHangApart:0,toiletStaandBad:0,toiletHangBad:0,wastafelBad:0,wastafelElders:0,meerpersBad:0,meerpersElders:0,douche:0,bad:0,badDouche:0,eisenOk:false,voorz:{},_extraZonderEisen:false};
  inp.vertrekken.forEach(r=>{const f=r.fac;if(!f)return;
    if(f.kind==="keuken")keukens.push({lengte:f.keuken.lengte,voorz:f.keuken.voorz||{},ruimte:typeOf("vertrekken",r.type).l});
    if(f.kind==="badkamer"){const b=f.san;agg.toiletStaandBad+=num(b.toiletStaand);agg.toiletHangBad+=num(b.toiletHang);agg.wastafelBad+=num(b.wastafel);agg.meerpersBad+=num(b.meerpers);agg.douche+=num(b.douche);agg.bad+=num(b.bad);agg.badDouche+=num(b.badDouche);
      const v=b.voorz||{};const any=Object.values(v).some(x=>num(x)>0);
      if(b.eisenOk){agg.eisenOk=true;for(const k in v){let c=num(v[k]);if(k==="kastruimte")c=Math.min(c,1);agg.voorz[k]=(agg.voorz[k]||0)+c;}}else if(any)agg._extraZonderEisen=true;}
    if(f.kind==="slaap_san"){const b=f.san;agg.wastafelElders+=Math.min(1,num(b.wastafel));agg.meerpersElders+=Math.min(1,num(b.meerpers));agg.douche+=num(b.douche);agg.bad+=num(b.bad);agg.badDouche+=num(b.badDouche);}
  });
  inp.overig.forEach(r=>{const f=r.fac;if(!f)return;
    if(f.kind==="toilet"){if(f.toilet.toilet==="staand")agg.toiletStaandApart++;if(f.toilet.toilet==="hangend")agg.toiletHangApart++;if(f.toilet.fontein)agg.wastafelElders++;}
    if(f.kind==="was"&&f.was.wastafel)agg.wastafelElders++;
  });
  if(!agg.eisenOk&&agg._extraZonderEisen)agg.eisenOk=false;
  inp.keukens=keukens;inp.keuken=keukens[0]?{lengte:keukens[0].lengte,voorz:keukens[0].voorz}:{lengte:"<1",voorz:{}};
  inp.san=agg;
}

function normalizeInput(inp){
  for(const key of ["vertrekken","overig"]){(inp[key]=inp[key]||[]).forEach(r=>{if(!Array.isArray(r.maten))r.maten=num(r.m2)>0?[]:[{l:"",b:""}];if(r.type===undefined)r.type=guessType(key,r.naam);if(key==="overig"&&r.type==="vliering")r.type="zolder_notrap";if(key==="overig"&&r.type==="wasruimte"&&false)r.type="wasruimte";});}
  inp.overig.forEach(r=>{if(r.type==="stook"||r.type==="bijkeuken")r.type="wasruimte";if(r.type==="verkeer")r.type="hal";});
  if(inp.energie){const E=inp.energie;
    if(E.soort==="labelVoor2015")E.soort="labelOud";
    if(E.soort==="label2015")E.soort="bouwjaar";
    if(E.soort==="epv"){E.soort="label";E.label="EPV";}
    if(E.soort==="index"&&(E.indexKlasse===undefined||E.indexKlasse==="")&&num(E.index)>0){const ei=num(E.index);E.indexKlasse=String([0.6,0.8,1.2,1.4,1.8,2.1,2.4,2.7,999].findIndex(x=>ei<=x));}
    if(E.indexKlasse===undefined)E.indexKlasse="";
  }
  if(!inp.energie){inp.energie={soort:inp.label==="geen"?"bouwjaar":"label",label:inp.label&&inp.label!=="geen"?inp.label:"C",index:"",bouwjaar:""};}
  inp.keuken=inp.keuken||{lengte:"1-2"};inp.keuken.voorz=inp.keuken.voorz||{};
  if(inp.keuken.voorz.combi){inp.keuken.voorz.oven=true;inp.keuken.voorz.magnetron=true;delete inp.keuken.voorz.combi;}
  if(inp.keuken.voorz.kast===true)inp.keuken.voorz.kast=1;
  delete inp.keuken.voorz.spoelbak;delete inp.keuken.extra;
  const s=inp.san=inp.san||{};
  if(s.toiletStaandApart===undefined){
    const hang=s.voorz&&s.voorz.wandcloset;
    s.toiletStaandApart=hang?0:num(s.toiletApart);s.toiletHangApart=hang?num(s.toiletApart):0;
    s.toiletStaandBad=num(s.toiletBad);s.toiletHangBad=0;
    s.wastafelBad=num(s.wastafel);s.wastafelElders=0;s.meerpersBad=num(s.meerpersWastafel);s.meerpersElders=0;
    const o=s.voorz||{};const nv={};
    if(o.douchewand)nv.afscheiding=true;if(o.whirlpool)nv.bubbel=true;if(o.handdoekrad)nv.handdoekrad=1;if(o.wastafelmeubel)nv.kastje=1;
    const th=(o.thermo_douche?1:0)+(o.thermo_bad?1:0);if(th)nv.kraan_thermo=th;
    s.voorz=nv;s.eisenOk=true;
    delete s.toiletApart;delete s.toiletBad;delete s.wastafel;delete s.meerpersWastafel;delete s.extra;
  }
  s.voorz=s.voorz||{};if(s.eisenOk===undefined)s.eisenOk=true;
  if(!inp.handicap)inp.handicap={investering:""};
  if(inp.handicapVanToepassing===undefined)inp.handicapVanToepassing=num(inp.handicap.investering)>0;
  inp.buiten=inp.buiten||{};if(inp.buiten.gemAdressen===undefined)inp.buiten.gemAdressen=inp.buiten.gemWoningen||1;
  if(!Array.isArray(inp.buiten.ruimten))inp.buiten.ruimten=[];
  // Oude tellingen kenden alleen twee totaal-m²-velden (privé/gemeenschappelijk), zonder een
  // 'soort' (zoals de Huurprijscheck die wel kent: tuin, balkon, dakterras, ...). Zet dit eenmalig
  // om in losse buitenruimten, net als bij vertrekken/overige ruimten hierboven.
  if(!inp.buiten.ruimten.length&&num(inp.buiten.privM2)>0)inp.buiten.ruimten.push({soort:"overig",groep:"priv",m2:inp.buiten.privM2,maten:Array.isArray(inp.buiten.privMaten)&&inp.buiten.privMaten.length?clone(inp.buiten.privMaten):[]});
  if(!inp.buiten.ruimten.some(r=>r.groep==="gem")&&num(inp.buiten.gemM2)>0)inp.buiten.ruimten.push({soort:"overig",groep:"gem",m2:inp.buiten.gemM2,maten:Array.isArray(inp.buiten.gemMaten)&&inp.buiten.gemMaten.length?clone(inp.buiten.gemMaten):[]});
  delete inp.buiten.privM2;delete inp.buiten.gemM2;delete inp.buiten.privMaten;delete inp.buiten.gemMaten;
  inp.buiten.ruimten.forEach(r=>{if(!Array.isArray(r.maten)||!r.maten.length)r.maten=num(r.m2)>0?[]:[{l:"",b:""}];if(r.soort==="tuin")r.soort="voorzijtuin";if(!r.soort)r.soort="overig";if(r.groep!=="gem")r.groep="priv";});
  inp.gem=inp.gem||{};if(inp.gem.adressen===undefined)inp.gem.adressen=inp.gem.woningen||1;if(inp.gem.voorzPunten===undefined)inp.gem.voorzPunten="";
  if(!Array.isArray(inp.gem.vertrekken))inp.gem.vertrekken=[];
  if(!Array.isArray(inp.gem.overig))inp.gem.overig=[];
  // Oude tellingen hadden alleen twee totaal-m²-velden; zet die eenmalig om in een losse ruimte,
  // net als bij de gewone vertrekken/overige ruimten, zodat de indeling en benaming gelijk trekken.
  if(!inp.gem.vertrekken.length&&num(inp.gem.vertrekM2)>0){inp.gem.vertrekken.push({type:"overig",naam:"",m2:inp.gem.vertrekM2,maten:[]});}
  if(!inp.gem.overig.length&&num(inp.gem.overigM2)>0){inp.gem.overig.push({type:"overig",naam:"",m2:inp.gem.overigM2,maten:[]});}
  delete inp.gem.vertrekM2;delete inp.gem.overigM2;
  for(const key of ["gem.vertrekken","gem.overig"]){getPath(inp,key).forEach(r=>{if(!Array.isArray(r.maten))r.maten=num(r.m2)>0?[]:[{l:"",b:""}];if(r.type===undefined)r.type=guessType(key,r.naam);});}
  if(inp.gem.vanToepassing===undefined)inp.gem.vanToepassing=inp.gem.vertrekken.length>0||inp.gem.overig.length>0||num(inp.gem.voorzPunten)>0;
  if(!inp.parkeer)inp.parkeer={typeI:"",typeII:"",typeIII:"",adressen:1,laadpalen:""};
  inp.woz=inp.woz||{};if(!inp.woz.soort)inp.woz.soort="woz";if(!inp.woz.jaar)inp.woz.jaar="2026";
  if(inp.woz.nieuwbouw1519===undefined)inp.woz.nieuwbouw1519=false;if(inp.woz.kleinCorop===undefined)inp.woz.kleinCorop=false;
  if(!inp.bijz)inp.bijz={zorgwoning:false,aanbel:false,laadpalen:""};
  if(!inp.opslag)inp.opslag={monument:inp.monument||"geen",contractVoor2024:false,nieuwbouw:false};
  {const O=inp.opslag;if(O.keuze){O.monument=O.keuze.startsWith("rijks")?"rijks":O.keuze;O.contractVoor2024=O.keuze==="rijks_voor";}else{O.keuze=O.monument==="rijks"?(O.contractVoor2024?"rijks_voor":"rijks_na"):(O.monument||"geen");}}
  delete inp.label;delete inp.labelHandmatig;delete inp.aangepast;delete inp.bijzonder;delete inp.opslagPct;delete inp.monument;
  if(!inp.facV)migrateFac(inp);
  inp.vertrekken.forEach(r=>ensureFac("vertrekken",r,false));inp.overig.forEach(r=>ensureFac("overig",r,false));
  deriveFac(inp);
  return inp;
}

/* ---------------- Lege telling ---------------- */
function emptyTelling(){
  return {
    meta:{naam:"",adres:"",postcode:"",huisnummer:"",plaats:"",bouwjaar:"",peildatum:new Date().toISOString().slice(0,10),opsteller:"",auto:{},favoriet:false,klantId:""},
    input:{
      woningtype:"meergezins",
      facV:1,
      vertrekken:[],
      overig:[],
      energie:{soort:"label",label:"",indexKlasse:"",datum:"",bouwjaar:""},
      keuken:{lengte:"<1",voorz:{}},
      san:{toiletStaandApart:0,toiletStaandBad:0,toiletHangApart:0,toiletHangBad:0,wastafelBad:0,wastafelElders:0,meerpersBad:0,meerpersElders:0,douche:0,bad:0,badDouche:0,eisenOk:true,voorz:{}},
      handicap:{investering:""},
      buiten:{gemAdressen:1,ruimten:[]},
      gem:{vertrekM2:"",overigM2:"",voorzPunten:"",adressen:1},
      parkeer:{typeI:"",typeII:"",typeIII:"",adressen:1,laadpalen:""},
      woz:{soort:"woz",waarde:"",jaar:"2026",nieuwbouw1519:false,kleinCorop:false},
      bijz:{zorgwoning:false,aanbel:false,laadpalen:""},
      opslag:{keuze:"geen",monument:"geen",contractVoor2024:false,nieuwbouw:false}
    }
  };
}

/* ---------------- Rekenen ---------------- */
const num=v=>{if(v===null||v===undefined||v===""||v===false)return 0;if(v===true)return 1;const n=parseFloat(String(v).replace(/\s/g,"").replace(/[−–]/g,"-").replace(",","."));return isFinite(n)?n:0;};
const r2=x=>Math.round(x*100)/100;
const q=x=>Math.round(x*4+1e-9)/4;          // afronding per rubriek op 0,25 (vanaf 1/8 omhoog)
const m2r=x=>Math.floor(x+0.5+1e-9);          // hele m², vanaf 0,50 omhoog
const fmt=(x,d=2)=>(Math.round(x*Math.pow(10,d))/Math.pow(10,d)).toLocaleString("nl-NL",{minimumFractionDigits:0,maximumFractionDigits:d});
const eur=x=>x.toLocaleString("nl-NL",{style:"currency",currency:"EUR"});
/* ---------------- PDF-stijl (gedeeld tussen de PDF-generators) ---------------- */
const PDF_W=210,PDF_M=16;
const PDF_PUR=[91,65,255],PDF_INK=[10,10,26],PDF_MUT=[92,92,122],PDF_SOFT=[237,240,255],PDF_ALT=[248,248,255],PDF_LINE=[230,230,242];
const PDF_WARN_BG=[255,241,232],PDF_WARN_INK=[154,66,18];
const PDF_SEGC={laag:[229,72,77],midden:[255,124,58],hoog:[48,164,108]};
const pdfTxt=s=>String(s??"").replace(/²/g,"2").replace(/–/g,"-");
function huurVoorPunten(p,N){
  const t=String(N.huurTabel||"").split(",").map(Number);const s=N.huurTabelStart||40;
  if(!t.length)return null;if(p<s)return t[0]/100;const i=p-s;
  if(i<t.length)return t[i]/100;
  const last=t[t.length-1],prev=t[t.length-2];return (last+(i-(t.length-1))*(last-prev))/100;
}

function calc(inp,N){
  inp=normalizeInput(clone(inp));
  const rows=[];const warn=[];
  const add=(nr,naam,p,t)=>rows.push({nr,naam,p,t});

  // Rubriek 1: vertrekken
  inp.vertrekken.forEach(r=>{const m=num(r.m2);if(m>0&&m<N.minVertrek)warn.push((r.naam||typeOf("vertrekken",r.type).l)+": een vertrek moet minimaal 4 m² zijn. Voldoet de ruimte daar niet aan, zet hem dan bij de overige ruimten.");});
  const oppVraw=inp.vertrekken.reduce((s,r)=>s+r2(num(r.m2)),0);
  const oppV=m2r(oppVraw);
  add(1,"Vertrekken",q(oppV*N.oppVertrek),oppV+" m² × "+fmt(N.oppVertrek));

  // Rubriek 2: overige ruimten
  const ov=inp.overig.map(r=>({r,T:typeOf("overig",r.type),m:r2(num(r.m2))}));
  ov.forEach(o=>{if(!o.T.verkeer&&o.m>0&&o.m<N.minOverig)warn.push((o.r.naam||o.T.l)+" is kleiner dan 2 m² en krijgt geen punten voor de oppervlakte.");});
  const telt=ov.filter(o=>!o.T.verkeer&&o.m>=N.minOverig);
  const oppO=m2r(telt.reduce((s,o)=>s+o.m,0));
  let p2=oppO*N.oppOverig;let aftrek=0;
  telt.filter(o=>o.T.k==="zolder_notrap").forEach(o=>{aftrek+=Math.min(N.zolderZonderTrap,o.m*N.oppOverig);});
  p2-=aftrek;
  add(2,"Overige ruimten",q(p2),oppO+" m² × "+fmt(N.oppOverig)+(aftrek?", aftrek zolder zonder vaste trap "+fmt(aftrek):""));

  // Rubriek 3: verwarming en verkoeling
  const vv=inp.vertrekken.filter(r=>r.verwarmd).reduce((s,r)=>s+(typeOf("vertrekken",r.type).verwVertrekken||1),0);
  const vk=inp.vertrekken.filter(r=>r.verwarmd&&r.verkoeld).length;
  const ow=inp.overig.filter(r=>r.verwarmd).length;
  const p3=vv*N.verwVertrek+Math.min(ow*N.verwOverig,N.verwOverigMax)+Math.min(vk*N.verkoelVertrek,N.verkoelMax);
  add(3,"Verwarming en verkoeling",q(p3),vv+" verwarmde vertrekken, "+ow+" verwarmde overige of verkeersruimten"+(vk?", "+vk+" verkoeld":""));

  // Rubriek 4: energieprestatie
  const eg=inp.woningtype==="eengezins"?0:1;const E=inp.energie;let p4=0,t4="";
  let soort=E.soort,note="";
  const dt=E.datum?new Date(E.datum):null;
  const naam={labelOud:"energielabel",index:"energie-index",label:"energielabel"}[soort];
  if(naam&&dt&&!isNaN(dt)){
    const exp=new Date(dt);exp.setFullYear(exp.getFullYear()+10);
    if(exp<new Date()){note=naam+" vervallen (10 jaar geldig)";warn.push("Het "+naam+" is vervallen, want een registratie is 10 jaar geldig. De punten worden bepaald op basis van het bouwjaar.");soort="bouwjaar";}
    else if(soort==="labelOud"&&dt>=new Date("2015-01-01"))warn.push("Een ‘Energielabel’ (oud) is geregistreerd vóór 1 januari 2015. Kies bij een latere registratie de energie-index of het energielabel vanaf 2021.");
    else if(soort==="label"&&dt<new Date("2021-01-01"))warn.push("Een energielabel vanaf 2021 (NTA 8800) is geregistreerd op of na 1 januari 2021. Controleer de registratiedatum.");
    else if(soort==="index"&&(dt<new Date("2015-01-01")||dt>=new Date("2021-01-01")))warn.push("Een energie-index is geregistreerd van 1 januari 2015 tot 1 januari 2021. Controleer de registratiedatum.");
  }else if(soort==="labelOud"){warn.push("Een energielabel van vóór 2015 is 10 jaar geldig en is daardoor inmiddels vervallen. Gebruik ‘Bouwjaar’ tenzij de peildatum vóór het verlopen ligt, of vul de registratiedatum in.");}
  if(soort==="label"||soort==="labelOud"){
    if(E.label==="EPV"){p4=N.epv[eg];t4="energieprestatievergoeding";}
    else if(!E.label){warn.push("Kies de labelklasse.");t4="geen labelklasse gekozen";}
    else{const e=N.energie[E.label]||[0,0];p4=e[eg];t4=(soort==="label"?"energielabel vanaf 2021":"energielabel (vóór 2015)")+", label "+E.label;}
  }
  else if(soort==="index"){
    if(E.indexKlasse==="EPV"){p4=N.epv[eg];t4="energieprestatievergoeding";}
    else if(E.indexKlasse!==""&&E.indexKlasse!=null){const row=N.energieIndex[+E.indexKlasse];p4=row[eg+1];t4="energie-index, "+INDEX_KLASSEN[+E.indexKlasse];}
    else{warn.push("Kies de klasse van de energie-index.");t4="geen index gekozen";}
  }
  else{const bj=parseInt(num(E.bouwjaar))||0;const row=N.energieBouwjaar.find(x=>bj>=x[0]);if(bj>0){p4=row[eg+1];t4=(note||"geen geldig label")+", bouwjaar "+bj;}else{p4=N.energieBouwjaar[N.energieBouwjaar.length-1][eg+1];t4="geen geldig label, bouwjaar onbekend";warn.push("Vul het bouwjaar in; zonder geldig label of index bepaalt het bouwjaar de punten.");}}
  const isMon=inp.opslag.monument==="rijks"||inp.opslag.monument==="gemprov";
  if(isMon&&p4<0){p4=0;t4+=", monument: geen minpunten";}
  add(4,"Energieprestatie",q(p4),t4+", "+(eg?"meergezinswoning":"eengezinswoning"));

  // Rubriek 5: keuken (per keuken)
  let p5=0;const t5=[];
  if(!inp.keukens.length)warn.push("Er is geen keuken ingevuld. Kies bij de vertrekken een Keuken of Woonkamer met open keuken.");
  inp.keukens.forEach(k=>{
    const kl=k.lengte;const kb=kl===">=2"?N.keukenLang:kl==="1-2"?N.keukenKort:0;
    let kx=0;(N.voorzKeuken||[]).forEach(it=>{kx+=num(k.voorz[it.k])*it.p;});
    if(kb===0&&kx>0)warn.push(k.ruimte+": een aanrecht korter dan 1 meter voldoet niet aan de basiseisen; de keuken en de extra voorzieningen krijgen geen punten.");
    const kxc=kb?Math.min(kx,kb):0;p5+=kb+kxc;
    t5.push((inp.keukens.length>1?k.ruimte+": ":"")+"aanrecht "+({"<1":"korter dan 1 m","1-2":"1 tot 2 m",">=2":"langer dan 2 m"}[kl])+(kxc?", extra "+fmt(kxc)+(kx>kxc?" (afgetopt)":""):""));
  });
  add(5,"Keuken",q(p5),t5.join("; ")||"geen keuken");

  // Rubriek 6: sanitair. Toilet- en wastafelpunten en de douche/bad-punten worden over de hele woning opgeteld,
  // maar de aftopping van extra voorzieningen (zoals een bubbelfunctie) geldt per bad-/doucheruimte: het aantal
  // punten voor extra voorzieningen in een ruimte mag niet hoger zijn dan de douche/bad-punten in diezelfde ruimte
  // (beleidsboek waarderingsstelsel, par. 2.6.2). Daarom wordt die aftopping per ruimte berekend, niet over het totaal.
  const S=inp.san,NS=N.san;
  const toiletP=num(S.toiletStaandApart)*NS.toiletStaandApart+num(S.toiletStaandBad)*NS.toiletStaandBad+num(S.toiletHangApart)*NS.toiletHangApart+num(S.toiletHangBad)*NS.toiletHangBad;
  const wasP=num(S.wastafelBad)*NS.wastafelBad+num(S.wastafelElders)*NS.wastafelElders+num(S.meerpersBad)*NS.meerpersBad+num(S.meerpersElders)*NS.meerpersElders;
  const dbP=num(S.douche)*NS.douche+num(S.bad)*NS.bad+num(S.badDouche)*NS.badDouche;
  let sx=0,sxc=0,extraZonderEisen=false;
  inp.vertrekken.forEach(r=>{const f=r.fac;if(!f||f.kind!=="badkamer")return;const b=f.san,v=b.voorz||{};
    const any=Object.values(v).some(x=>num(x)>0);
    if(!b.eisenOk){if(any)extraZonderEisen=true;return;}
    const nWasR=num(b.wastafel)+num(b.meerpers);
    const hasBadR=num(b.bad)+num(b.badDouche)>0, hasDoucheR=num(b.douche)+num(b.badDouche)>0;
    const dbR=num(b.douche)*NS.douche+num(b.bad)*NS.bad+num(b.badDouche)*NS.badDouche;
    let sxR=0;
    (N.voorzSan||[]).forEach(it=>{
      let c=num(v[it.k]);if(it.k==="kastruimte")c=Math.min(c,1);if(!c)return;
      if(it.need==="bad"&&!hasBadR){warn.push(it.l+" telt niet: er is in deze ruimte geen bad.");return;}
      if(it.need==="douche"&&!hasDoucheR){warn.push(it.l+" telt niet: er is in deze ruimte geen douche.");return;}
      if(it.k==="stopcontact"&&c>2*nWasR){warn.push("Stopcontacten tellen tot maximaal 2 per wastafel.");c=2*nWasR;}
      sxR+=c*it.p;
    });
    sx+=sxR;
    if(sxR>0&&dbR===0){warn.push("Extra sanitaire voorzieningen tellen alleen als er in dezelfde ruimte een douche of bad is.");sxR=0;}
    sxc+=Math.min(sxR,dbR);
  });
  if(extraZonderEisen)warn.push("Een badkamer voldoet niet aan de eisen voor extra voorzieningen; die voorzieningen tellen daarom niet.");
  add(6,"Sanitair",q(toiletP+wasP+dbP+sxc),"toiletten "+fmt(toiletP)+", wastafels "+fmt(wasP)+", douche/bad "+fmt(dbP)+(sxc?", extra "+fmt(sxc)+(sx>sxc?" (afgetopt)":""):""));

  // Rubriek 7: woonvoorzieningen voor personen met een handicap
  const inv=num(inp.handicap.investering);
  add(7,"Woonvoorzieningen bij een handicap",q(inv/N.handicapPerPunt),inv?eur(inv)+" netto-investering / "+eur(N.handicapPerPunt):"geen");

  // Rubriek 8: buitenruimten. Een Frans balkon (geen echte vloeroppervlakte) telt, net als bij
  // de Huurprijscheck, nooit mee -- ongeacht welk m² erbij is ingevuld.
  const buitenRuimten=inp.buiten.ruimten||[];
  const bp=buitenRuimten.filter(r=>r.groep!=="gem"&&r.soort!=="fransbalkon").reduce((s,r)=>s+num(r.m2),0);
  const bg=buitenRuimten.filter(r=>r.groep==="gem"&&r.soort!=="fransbalkon").reduce((s,r)=>s+num(r.m2),0);
  const ba=Math.max(1,num(inp.buiten.gemAdressen)||1);
  let p8,t8;
  if(bp<=0&&bg<=0){p8=N.geenBuiten;t8="geen buitenruimte";}
  else{p8=(bp>0?N.buitenAanwezig+r2(bp)*N.buitenPerM2:0)+(bg>0?r2(bg)*N.gemBuitenPerM2/ba:0);if(p8>N.buitenMax){p8=N.buitenMax;warn.push("Buitenruimten zijn begrensd op "+N.buitenMax+" punten.");}
    t8=[bp>0?fmt(bp)+" m² privé":"",bg>0?fmt(bg)+" m² gemeenschappelijk / "+ba+" adressen":""].filter(Boolean).join(", ");}
  add(8,"Buitenruimten",q(p8),t8);

  // Rubriek 9: gemeenschappelijke ruimten (zelfde indeling en punten per m² als rubriek 1 en 2)
  const ga=Math.max(1,num(inp.gem.adressen)||1);
  const gVraw=inp.gem.vertrekken.reduce((s,r)=>s+r2(num(r.m2)),0);
  const gOppV=m2r(gVraw);
  const gOv=inp.gem.overig.map(r=>({r,T:typeOf("gem.overig",r.type),m:r2(num(r.m2))}));
  const gTelt=gOv.filter(o=>!o.T.verkeer&&o.m>=N.minOverig);
  const gOppO=m2r(gTelt.reduce((s,o)=>s+o.m,0));
  let gP=gOppV*N.oppVertrek+gOppO*N.oppOverig;
  gTelt.filter(o=>o.T.k==="zolder_notrap").forEach(o=>{gP-=Math.min(N.zolderZonderTrap,o.m*N.oppOverig);});
  const p9=(gP+num(inp.gem.voorzPunten))/ga;
  add(9,"Gemeenschappelijke ruimten",q(p9),p9?(gOppV+gOppO)+" m² gedeeld door "+ga+" adressen":"geen");

  // Rubriek 10: gemeenschappelijke parkeerruimten
  const P=inp.parkeer,pa=Math.max(1,num(P.adressen)||1);
  const p10=(num(P.typeI)*N.parkeer.I+num(P.typeII)*N.parkeer.II+num(P.typeIII)*N.parkeer.III+num(P.laadpalen)*N.parkeer.laadpaal)/pa;
  add(10,"Gemeenschappelijke parkeerruimten",q(p10),p10?"gedeeld door "+pa+" adressen":"geen");

  // Rubriek 12: bijzondere voorzieningen (aanbelfunctie, laadpaal)
  const p12=(inp.bijz.aanbel?N.aanbel:0)+num(inp.bijz.laadpalen)*N.laadpaal;
  const r1to10=rows.reduce((s,r)=>s+r.p,0);

  // Rubriek 11: WOZ-waarde
  const W=inp.woz;const kg=N.woz[W.jaar]||N.woz["2026"];
  let wVal=0,wT="";let minUsed=false;
  if(W.soort==="taxatie"){wVal=num(W.waarde)*N.taxatiePct/100;wT=N.taxatiePct+"% van taxatiewaarde "+eur(num(W.waarde));}
  else if(W.soort==="minimum"||!num(W.waarde)){wVal=N.wozMinimum;minUsed=true;wT="minimum WOZ-waarde "+eur(N.wozMinimum);if(W.soort==="woz")warn.push("Er is geen WOZ-waarde ingevuld; er is gerekend met de minimum WOZ-waarde.");}
  else{wVal=num(W.waarde);wT="WOZ "+eur(wVal)+" (beschikking "+W.jaar+")";}
  const m2woz=m2r(oppV+oppO+num(P.typeI)*N.parkeer.m2TypeI/pa);
  const d2=W.kleinCorop?kg[2]:kg[1];
  let pW=q(wVal/kg[0]+(m2woz>0?wVal/m2woz/d2:0));
  const pWstd=pW;
  let nb1519=false;
  if(W.nieuwbouw1519&&r1to10+p12>=N.nieuwbouwMinPunten&&pW<N.wozMinNieuwbouw){pW=N.wozMinNieuwbouw;nb1519=true;}
  wT+=", "+m2woz+" m²"+(W.kleinCorop?", kengetal kleine nieuwbouw COROP":"")+(nb1519?", minimaal 40 punten (nieuwbouw 2015-2019)":"");

  // Zorgwoning: +35% over rubrieken 1 t/m 11.1
  const pZorg=inp.bijz.zorgwoning?(r1to10+pWstd)*N.zorgPct/100:0;
  // Rijksmonument met huurovereenkomst vóór 1 juli 2024: 50 punten
  const pRijks=inp.opslag.monument==="rijks"&&inp.opslag.contractVoor2024?N.opslag.rijksPunten:0;

  let other=r1to10+p12+pZorg+pRijks;
  let totaalExact=other+pW;
  let capNote="",floor186=false;
  if(Math.round(totaalExact)>=N.grensMidden+1&&!minUsed&&!nb1519){
    const share=N.wozCapPct/100;
    if(pW>share*totaalExact){
      const wMax=Math.floor(other*share/(1-share)+1e-9);
      pW=wMax;capNote=" (cap: maximaal "+N.wozCapPct+"% van het totaal, afgerond op hele punten)";
      totaalExact=other+pW;
      if(Math.round(totaalExact)<N.grensMidden+1&&!W.kleinCorop){floor186=true;}
    }
  }
  add(11,"WOZ-waarde",pW,wT+capNote);
  add(12,"Bijzondere voorzieningen",q(p12),[inp.bijz.aanbel?"aanbelfunctie met video en audio":"",num(inp.bijz.laadpalen)?num(inp.bijz.laadpalen)+" laadpaal/laadpalen":""].filter(Boolean).join(", ")||"geen");
  if(pZorg)add(12,"Zorgwoning (+"+N.zorgPct+"%)",r2(pZorg),N.zorgPct+"% over rubriek 1 t/m 11");
  if(pRijks)add(13,"Rijksmonument, huurovereenkomst vóór 1 juli 2024",pRijks,"50 punten");

  let totaal=Math.round(totaalExact+1e-9);
  if(floor186){totaal=N.grensMidden;warn.push("Zonder de WOZ-cap had de woning 187 punten of meer; met de cap zakt hij eronder. Daarom geldt een waardering van "+N.grensMidden+" punten.");}
  const seg=totaal<=N.grensLaag?"laag":totaal<=N.grensMidden?"midden":"hoog";
  const maxHuur=huurVoorPunten(totaal,N);

  // Opslagen op de maximale huurprijs
  const ops=[];const M=inp.opslag.monument;
  if(M==="rijks"&&!inp.opslag.contractVoor2024)ops.push(["Rijksmonument",N.opslag.rijksPct]);
  if(M==="gemprov")ops.push(["Gemeentelijk of provinciaal monument",N.opslag.gemprovPct]);
  if(M==="stads")ops.push(["Beschermd stads- of dorpsgezicht",N.opslag.stadsPct]);
  if(inp.opslag.nieuwbouw){if(seg==="midden")ops.push(["Nieuwbouw",N.opslag.nieuwbouwPct]);else warn.push("De nieuwbouwopslag geldt alleen voor woningen in de middensector.");}
  const opslagPct=ops.reduce((s,o)=>s+o[1],0);
  const maxHuurOpslag=maxHuur!=null&&opslagPct?r2(maxHuur*(1+opslagPct/100)):null;

  return {rows,totaal,exact:r2(totaalExact),seg,maxHuur,opslagen:ops,opslagPct,maxHuurOpslag,warn,oppV,oppO,oppVraw,gOppV,gOppO,wozCapActief:!!capNote,wozCapFloor:floor186};
}
function getPath(obj,path){return path.split(".").reduce((o,k)=>o==null?o:o[k],obj);}
module.exports={calc,DEFAULT_NORMEN,normalizeInput,huurVoorPunten,emptyTelling,clone,num,r2,fmt,LABELS,INDEX_KLASSEN,typeOf};
