// Automatisch geëxtraheerd uit reference/wws-site.html — alleen voor de vergelijkingstest
// src/lib/wws/advies/advies.vergelijk.test.ts. Letterlijke regels (niet bewerken):
//   3859–3926  berekenRouteVoorDoel
//   4331–4406  energieVanOmschrijving, volgendeLabelVoorIndexOfBouwjaar, MAATREGELEN
//   4408–4409  safeApply, H_FACTOR
//   4412–4502  candidates, runAdvies, selectieResultaat
// De globals van de pagina (N, cur, adviesState) komen binnen als parameters van maakAdvies();
// calc(), normalizeInput() en de hulpfuncties komen uit wws-site-calc.cjs (fase 1).
const { calc, normalizeInput, clone, num, r2, fmt, LABELS, INDEX_KLASSEN, typeOf } = require("./wws-site-calc.cjs");

function maakAdvies(N, cur, adviesState) {
// ---- regels 3859–3926 ----
function berekenRouteVoorDoel(doel,baseOptie){
  const K=adviesState.kosten, uit=adviesState.uit;
  let x=normalizeInput(clone(cur.input));x._origLabel=x.energie.label;x._origIndexKlasse=x.energie.indexKlasse;const start=calc(x,N);
  const stappen=[];let guard=0;
  const eerste=candidates(normalizeInput(clone(cur.input)),K,N,uit,true);
  // Optie 2 bouwt voort op optie 1: de maatregelen daarvan worden eerst (in dezelfde volgorde)
  // toegepast en blijven altijd staan ("forced"), zodat optie 2 nooit een losse, mogelijk heel
  // andere combinatie is maar altijd optie 1 aangevuld tot de afgesproken marge.
  if(baseOptie){baseOptie.stappen.forEach(g=>g.applies.forEach(f=>{const b=calc(x,N).exact;safeApply(f,x);const R=calc(x,N);stappen.push({key:g.key,forced:true,fromBase:true,o:g.o,g:r2(R.exact-b),c:g.c/g.applies.length,h:g.h,hr:g.hr,tot:R.totaal,apply:f,bron:g.bron,omschrijving:g.omschrijving,kostenMin:g.kostenMin/g.applies.length,kostenMax:g.kostenMax/g.applies.length,besparingMin:g.besparingMin/g.applies.length,besparingMax:g.besparingMax/g.applies.length});}));}
  (adviesState.forced||[]).forEach(fk=>{const c=eerste.find(z=>z.key+"|"+z.o===fk);if(!c)return;const b=calc(x,N).exact;safeApply(c.apply,x);const R=calc(x,N);stappen.push({key:c.key,forced:true,o:c.o,g:r2(R.exact-b),c:c.c,h:c.h,hr:c.hr,tot:R.totaal,apply:c.apply,bron:c.bron,omschrijving:c.omschrijving,kostenMin:c.kostenMin,kostenMax:c.kostenMax,besparingMin:c.besparingMin,besparingMax:c.besparingMax});});
  // "1 labelsprong" altijd verwerken: niet opnieuw forceren als dit optie 2 is, want optie 1 (baseOptie)
  // heeft de sprong dan al toegepast en die stap wordt hierboven al herhaald.
  if(adviesState.labelsprong&&!baseOptie&&(x.energie.soort==="label"||x.energie.soort==="labelOud")){
    const i0=LABELS.indexOf(x.energie.label);
    if(i0>0){
      const target=LABELS[i0-1];
      const applyFn=y=>{y.energie.label=target;};
      const b=calc(x,N).exact;safeApply(applyFn,x);const R=calc(x,N);
      stappen.push({key:"label",forced:true,labelsprong:true,o:"Energielabel "+LABELS[i0]+" naar "+target,g:r2(R.exact-b),c:K.labelStap,h:"gemiddeld",hr:"Isolatie, glas of installatie; nieuw label laten opnemen",tot:R.totaal,apply:applyFn});
    }
  }else if(adviesState.labelsprong&&!baseOptie&&(x.energie.soort==="index"||x.energie.soort==="bouwjaar")){
    const target=volgendeLabelVoorIndexOfBouwjaar(x);
    if(target){
      const van=energieVanOmschrijving(x.energie),vandaag=new Date().toISOString().slice(0,10);
      const applyFn=y=>{y.energie={soort:"label",label:target,indexKlasse:"",bouwjaar:"",datum:vandaag};};
      const b=calc(x,N).exact;safeApply(applyFn,x);const R=calc(x,N);
      stappen.push({key:"label",forced:true,labelsprong:true,o:"Nieuw energielabel (vanaf 2021, NTA 8800) laten opnemen: "+van+" naar klasse "+target,g:r2(R.exact-b),c:K.labelStap,h:"gemiddeld",hr:"Energieprestatie laten opnemen via een erkende EP-adviseur (NTA 8800)",tot:R.totaal,apply:applyFn});
    }
  }
  while(calc(x,N).totaal<doel&&guard++<40){
    const c=candidates(x,K,N,uit);if(!c.length)break;
    const best=c[0];safeApply(best.apply,x);const R=calc(x,N);
    stappen.push({key:best.key,o:best.o,g:best.g,c:best.c,h:best.h,hr:best.hr,tot:R.totaal,apply:best.apply,bron:best.bron,omschrijving:best.omschrijving,kostenMin:best.kostenMin,kostenMax:best.kostenMax,besparingMin:best.besparingMin,besparingMax:best.besparingMax});
  }
  if(calc(x,N).totaal>=doel){
    const order=stappen.map((st,i)=>i).filter(i=>!stappen[i].forced).sort((a,b)=>stappen[b].c-stappen[a].c);
    const keep=new Set(stappen.map((st,i)=>i));
    for(const i of order){keep.delete(i);const y2=normalizeInput(clone(cur.input));stappen.forEach((st,k)=>{if(keep.has(k))safeApply(st.apply,y2);});if(calc(y2,N).totaal<doel)keep.add(i);}
    const kept=stappen.filter((st,k)=>keep.has(k));
    x=normalizeInput(clone(cur.input));let prev=calc(x,N).exact;
    for(const st of kept){safeApply(st.apply,x);const R=calc(x,N);st.g=r2(R.exact-prev);prev=R.exact;st.tot=R.totaal;}
    stappen.length=0;stappen.push(...kept);
  }
  const groep=[];for(const st of stappen){let g=groep.find(q=>q.key===st.key);if(!g){g={key:st.key,o:"",c:0,applies:[],delen:[],forced:false,omschrijving:[],kostenMin:0,kostenMax:0,besparingMin:0,besparingMax:0};groep.push(g);}if(st.forced)g.forced=true;const rank={eenvoudig:0,gemiddeld:1,lastig:2};if(!g.h||rank[st.h]>rank[g.h]){g.h=st.h;g.hr=st.hr;}g.c+=st.c;g.applies.push(st.apply);if(!g.delen.includes(st.o))g.delen.push(st.o);
    if(st.bron)g.bron=st.bron;(st.omschrijving||[]).forEach(o=>{if(!g.omschrijving.includes(o))g.omschrijving.push(o);});g.kostenMin+=num(st.kostenMin);g.kostenMax+=num(st.kostenMax);g.besparingMin+=num(st.besparingMin);g.besparingMax+=num(st.besparingMax);}
  const origSoort=cur.input.energie.soort;
  const vanLabel=cur.input.energie.label;
  const vanOmschrijving=energieVanOmschrijving(cur.input.energie);
  x=normalizeInput(clone(cur.input));let prevE=calc(x,N).exact;
  for(const g of groep){g.applies.forEach(f=>safeApply(f,x));const R=calc(x,N);g.g=r2(R.exact-prevE);prevE=R.exact;g.tot=R.totaal;
    if(g.key==="label"){g.naarLabel=x.energie.label;
      if(origSoort==="label"||origSoort==="labelOud"){
        g.o="Energielabel "+vanLabel+" naar "+x.energie.label;{const d=LABELS.indexOf(vanLabel)-LABELS.indexOf(x.energie.label);g.h=d>=3?"lastig":"gemiddeld";g.hr=g.bron==="advies"&&g.omschrijving.length?g.omschrijving.join("; "):(d>=3?"Grote renovatie: gevel, dak en installatie":"Isolatie, glas of installatie; nieuw label laten opnemen");}if(g.bron!=="advies")g.c=Math.max(0,LABELS.indexOf(vanLabel)-LABELS.indexOf(x.energie.label))*K.labelStap;
      }else{
        // Startpunt was energie-index of bouwjaar, geen echt label: een "labelafstand" bestaat hier
        // niet, dus de kosten NIET herberekenen op basis daarvan (dat gaf altijd €0) en de reeds
        // correct opgetelde kosten van de losse stappen (g.c, hierboven opgebouwd) laten staan.
        g.o="Nieuw energielabel (vanaf 2021, NTA 8800) laten opnemen: "+vanOmschrijving+" naar label "+x.energie.label;
        g.h="gemiddeld";
        g.hr="Energieprestatie laten opnemen via een erkende EP-adviseur (NTA 8800)";
      }
    }
    else if(g.key==="indexKlasse"){const vanIndex=Number(cur.input.energie.indexKlasse);g.o="Energie-index "+INDEX_KLASSEN[vanIndex]+" naar "+INDEX_KLASSEN[Number(x.energie.indexKlasse)];const d=vanIndex-Number(x.energie.indexKlasse);g.h=d>=3?"lastig":"gemiddeld";g.hr=d>=3?"Grote renovatie: gevel, dak en installatie":"Isolatie, glas of installatie; nieuwe energie-index laten vaststellen";g.c=Math.max(0,d)*K.labelStap;}
    else g.o=g.delen.join("; ");}
  const eind=calc(x,N);
  const kosten=groep.reduce((s,g)=>s+g.c,0);
  return {start,eind,stappen:groep,doel,gehaald:eind.totaal>=doel,kosten,input:x,vanLabel,vanOmschrijving,origSoort};
}
// ---- regels 4331–4406 ----
function energieVanOmschrijving(e){
  if(e.soort==="label"||e.soort==="labelOud")return e.label;
  if(e.soort==="index")return "energie-index "+(INDEX_KLASSEN[Number(e.indexKlasse)]||"onbekend");
  return "bouwjaar "+(e.bouwjaar||"onbekend");
}
function volgendeLabelVoorIndexOfBouwjaar(x){
  const eg=x.woningtype==="eengezins"?0:1;
  const r4=calc(x,N).rows.find(r=>r.nr===4);const curP4=r4?r4.p:-Infinity;
  const beter=LABELS.filter(l=>(N.energie[l]||[0,0])[eg]>curP4).sort((a,b)=>N.energie[a][eg]-N.energie[b][eg]);
  return beter.length?beter[0]:null;
}
const MAATREGELEN=[
  {key:"label",h:"gemiddeld",hr:"Isolatie, glas of installatie; nieuw label laten opnemen",naam:"Energielabel verbeteren (per labelstap)",kost:"labelStap",gen(x,K){
    // Geen energielabel (soort "index" of "bouwjaar"): de punten komen nu uit de energie-index- of
    // bouwjaartabel, die vaak ongunstiger uitpakt dan een daadwerkelijk label. Dit is geen te kiezen
    // "optie" naast andere smaken — elk energielabel dat vanaf nu wordt aangevraagd/opgenomen valt
    // toch altijd onder dezelfde norm (NTA 8800, vanaf 1 januari 2021), dus is er maar één logische
    // standaardstap: de eerstvolgende labelklasse die al boven de huidige (bouwjaar/index-)score zit.
    // Is er daarna nog meer winst te halen, dan pakt de gewone labelstap-verbetering hierboven dat
    // vanzelf verder op, net als bij een telling die al een label heeft.
    if(x.energie.soort==="index"||x.energie.soort==="bouwjaar"){
      const target=volgendeLabelVoorIndexOfBouwjaar(x);
      if(!target)return[];
      const vandaag=new Date().toISOString().slice(0,10);
      return [{
        o:"Nieuw energielabel (vanaf 2021, NTA 8800) laten opnemen: "+energieVanOmschrijving(x.energie)+" naar klasse "+target,
        c:K.labelStap,h:"gemiddeld",
        hr:"Energieprestatie laten opnemen via een erkende EP-adviseur (NTA 8800)",
        a:y=>{y.energie={soort:"label",label:target,indexKlasse:"",bouwjaar:"",datum:vandaag};}
      }];
    }
    if(x.energie.soort!=="label"&&x.energie.soort!=="labelOud")return[];const i=LABELS.indexOf(x.energie.label);if(i<=0)return[];const out=[];
    const EA=x.energieAdvies;const advTargets=new Set();
    if(EA&&Array.isArray(EA.maatregelen)){
      EA.maatregelen.filter(m=>m.vanLabel===x.energie.label&&LABELS.indexOf(m.naarLabel)<i&&LABELS.indexOf(m.naarLabel)>=0).forEach(m=>{
        const j=LABELS.indexOf(m.naarLabel);advTargets.add(j);const st=i-j;
        const kost=(num(m.kostenMin)+num(m.kostenMax))/2||K.labelStap*st;
        out.push({o:"Energielabel "+x.energie.label+" naar "+m.naarLabel+(st>1?" ("+st+" stappen)":""),c:kost,h:st>=3?"lastig":"gemiddeld",hr:(m.omschrijving||[]).join("; ")||"Volgens geüpload verduurzamingsadvies",a:y=>{y.energie.label=m.naarLabel;},bron:"advies",omschrijving:m.omschrijving||[],kostenMin:num(m.kostenMin),kostenMax:num(m.kostenMax),besparingMin:num(m.besparingMin),besparingMax:num(m.besparingMax)});
      });
    }
    for(let j=i-1;j>=Math.max(0,i-4);j--){
      if(advTargets.has(j))continue;
      const to=LABELS[j],st=i-j;const orig=x._origLabel||x.energie.label;const tot=LABELS.indexOf(orig)-LABELS.indexOf(to);
      out.push({o:"Energielabel "+x.energie.label+" naar "+to+(st>1?" ("+st+" stappen)":""),c:K.labelStap*st,h:tot>=3?"lastig":"gemiddeld",hr:tot>=3?"Grote renovatie: gevel, dak en installatie":"Isolatie, glas of installatie; nieuw label laten opnemen",a:y=>{y.energie.label=to;}});
    }
    return out;}},
  {key:"indexKlasse",h:"gemiddeld",hr:"Isolatie, glas of installatie; nieuwe energie-index laten vaststellen",naam:"Energie-index verbeteren (per klasse)",kost:"labelStap",gen(x,K){
    // Sinds 1 januari 2021 wordt er geen energie-index meer afgegeven (die systematiek is vervangen
    // door het energielabel volgens NTA 8800): een bestaande energie-index-registratie "verbeteren"
    // naar een betere index-klasse is in de praktijk niet meer mogelijk. De enige echte vervolgstap
    // is een nieuw energielabel laten opnemen (zie de "label"-maatregel hierboven), dus deze
    // maatregel levert bewust geen kandidaten meer op — anders zou hij als "goedkopere" optie blijven
    // concurreren met de wél haalbare nieuw-label-stap.
    return [];}},
  // Een piepklein vertrek (bijv. een als 'vertrek' ingevoerde kastruimte van nog geen 2 m²) is in de
  // praktijk geen bruikbare, te verwarmen leefruimte — het advies stelt zo'n ruimte daarom niet meer
  // voor om te verwarmen.
  {key:"verwVertrek",h:"gemiddeld",hr:"Radiator of vloerverwarming aanleggen",naam:"Vertrek verwarmen",kost:"verwVertrek",gen(x,K){const i=x.vertrekken.findIndex(r=>!r.verwarmd&&num(r.m2)>=2);if(i<0)return[];return[{o:"Verwarming in "+(x.vertrekken[i].naam||typeOf("vertrekken",x.vertrekken[i].type).l.toLowerCase()),c:K.verwVertrek,a:y=>{y.vertrekken[i].verwarmd=true;}}];}},
  {key:"koeling",h:"gemiddeld",hr:"Warmtepomp of vaste airco met A+-label",naam:"Verkoeling toevoegen (per vertrek)",kost:"koeling",gen(x,K,N){const n=x.vertrekken.filter(r=>r.verwarmd&&r.verkoeld).length;if(n*N.verkoelVertrek>=N.verkoelMax)return[];const i=x.vertrekken.findIndex(r=>r.verwarmd&&!r.verkoeld);if(i<0)return[];return[{o:"Verkoeling in "+(x.vertrekken[i].naam||typeOf("vertrekken",x.vertrekken[i].type).l.toLowerCase()),c:K.koeling,a:y=>{y.vertrekken[i].verkoeld=true;}}];}},
  {key:"verwOverig",h:"eenvoudig",hr:"Radiator bijplaatsen",naam:"Overige of verkeersruimte verwarmen",kost:"verwOverig",gen(x,K,N){const n=x.overig.filter(r=>r.verwarmd).length;if(n*N.verwOverig>=N.verwOverigMax)return[];const i=x.overig.findIndex(r=>!r.verwarmd);if(i<0)return[];return[{o:"Verwarming in "+(x.overig[i].naam||typeOf("overig",x.overig[i].type).l.toLowerCase()),c:K.verwOverig,a:y=>{y.overig[i].verwarmd=true;}}];}},
  {key:"aanrecht",h:"gemiddeld",hr:"Vraagt ruimte in de keuken",naam:"Aanrecht langer dan 2 meter",kost:"aanrecht",gen(x,K){const i=x.vertrekken.findIndex(r=>r.fac&&r.fac.kind==="keuken"&&r.fac.keuken.lengte!==">=2");if(i<0)return[];return[{o:"Aanrecht verlengen tot meer dan 2 meter ("+typeOf("vertrekken",x.vertrekken[i].type).l.toLowerCase()+")",c:K.aanrecht,a:y=>{y.vertrekken[i].fac.keuken.lengte=">=2";}}];}},
  {key:"keukenExtra",h:"eenvoudig",hr:"Inbouwapparatuur of kraan plaatsen",naam:"Extra keukenvoorzieningen (kosten per punt)",kost:"keukenPunt",gen(x,K,N){const i=x.vertrekken.findIndex(r=>r.fac&&r.fac.kind==="keuken"&&r.fac.keuken.lengte!=="<1");if(i<0)return[];const v=x.vertrekken[i].fac.keuken.voorz;const hasG=g=>(N.voorzKeuken||[]).some(z=>z.g===g&&num(v[z.k]));return (N.voorzKeuken||[]).filter(it=>it.n?num(v[it.k])<4:(!num(v[it.k])&&!(it.g&&hasG(it.g)))).map(it=>({o:it.l+" (keuken)",c:K.keukenPunt*it.p,nominal:it.p,a:y=>{const vv=y.vertrekken[i].fac.keuken.voorz;vv[it.k]=it.n?num(vv[it.k])+1:true;}}));}},
  {key:"bad",h:"lastig",hr:"Vraagt ruimte voor een bad in de badkamer",naam:"Douche vervangen door bad met douche",kost:"bad",gen(x,K){const i=x.vertrekken.findIndex(r=>r.fac&&r.fac.kind==="badkamer"&&num(r.fac.san.douche)>0);if(i<0)return[];return[{o:"Douche vervangen door bad met douche",c:K.bad,a:y=>{const b=y.vertrekken[i].fac.san;b.douche=num(b.douche)-1;b.badDouche=num(b.badDouche)+1;}}];}},
  {key:"toiletHang",h:"gemiddeld",hr:"Voorzetwand met inbouwreservoir",naam:"Staand toilet vervangen door hangend toilet",kost:"toiletHang",gen(x,K){const out=[];x.overig.forEach((r,i)=>{if(r.fac&&r.fac.kind==="toilet"&&r.fac.toilet.toilet==="staand")out.push({o:"Hangend toilet in toiletruimte",c:K.toiletHang,a:y=>{y.overig[i].fac.toilet.toilet="hangend";}});});x.vertrekken.forEach((r,i)=>{if(r.fac&&r.fac.kind==="badkamer"&&num(r.fac.san.toiletStaand)>0)out.push({o:"Hangend toilet in badkamer",c:K.toiletHang,a:y=>{const b=y.vertrekken[i].fac.san;b.toiletStaand=num(b.toiletStaand)-1;b.toiletHang=num(b.toiletHang)+1;}});});return out.slice(0,2);}},
  {key:"toilet",h:"lastig",hr:"Nieuwe toiletruimte kost woonoppervlak en vraagt leidingwerk",naam:"Extra toilet (tot 2 in totaal)",kost:"toilet",gen(x,K){const S=x.san;if(num(S.toiletStaandApart)+num(S.toiletStaandBad)+num(S.toiletHangApart)+num(S.toiletHangBad)>=2)return[];const i=x.overig.findIndex(r=>r.fac&&r.fac.kind==="toilet"&&r.fac.toilet.toilet==="geen");return[{o:i>=0?"Hangend toilet plaatsen in toiletruimte":"Extra toiletruimte met hangend toilet (1,2 m² van het grootste vertrek)",h:i>=0?"gemiddeld":"lastig",c:K.toilet,a:y=>{if(i>=0)y.overig[i].fac.toilet.toilet="hangend";else{y.overig.push({type:"toilet",naam:"",m2:"1,2",maten:[{l:"1,20",b:"1,00"}],verwarmd:false,fac:{kind:"toilet",toilet:{toilet:"hangend",fontein:false}}});
      // de ruimte gaat af van het grootste vertrek
      let bi=-1,bm=0;y.vertrekken.forEach((r,n)=>{const m=num(r.m2);if(m>bm){bm=m;bi=n;}});
      if(bi>=0){const r=y.vertrekken[bi];if(r.maten&&r.maten.some(mm=>num(mm.l)&&num(mm.b))){r.maten.push({l:"-1,20",b:"1,00"});}r.m2=String(r2(Math.max(0,bm-1.2))).replace(".",",");}}}}];}},
  {key:"wastafel",h:"gemiddeld",hr:"Water- en rioolaansluiting in het toilet",naam:"Fontein in de toiletruimte",kost:"wastafel",gen(x,K){const i=x.overig.findIndex(r=>r.fac&&r.fac.kind==="toilet"&&!r.fac.toilet.fontein);if(i<0)return[];return[{o:"Fontein in de toiletruimte",c:K.wastafel,a:y=>{y.overig[i].fac.toilet.fontein=true;}}];}},
  {key:"sanExtra",h:"eenvoudig",hr:"Accessoires en kranen in de badkamer",naam:"Extra sanitaire voorzieningen (kosten per punt)",kost:"sanPunt",gen(x,K,N){const i=x.vertrekken.findIndex(r=>r.fac&&r.fac.kind==="badkamer"&&r.fac.san.eisenOk);if(i<0)return[];const b=x.vertrekken[i].fac.san;const v=b.voorz||{};const hasBad=num(b.bad)+num(b.badDouche)>0,hasD=num(b.douche)+num(b.badDouche)>0;const nW=num(b.wastafel)+num(b.meerpers);const nDB=num(b.douche)+num(b.bad)+num(b.badDouche);
    const lim={handdoekrad:2,kastje:Math.max(1,nW),stopcontact:2*nW,kraan_een:nW,kraan_thermo:nDB};
    return (N.voorzSan||[]).filter(it=>{if(it.need==="bad"&&!hasBad)return false;if(it.need==="douche"&&!hasD)return false;return it.n?num(v[it.k])<(lim[it.k]||1):!num(v[it.k]);}).map(it=>({o:it.l,c:K.sanPunt*it.p,nominal:it.p,a:y=>{const vv=y.vertrekken[i].fac.san.voorz;vv[it.k]=it.n?num(vv[it.k])+1:true;}}));}},
  {key:"balkon",h:"lastig",hr:"Constructief, vaak vergunning of VvE-besluit nodig",naam:"Buitenruimte toevoegen (balkon)",kost:"balkon",gen(x,K){if((x.buiten.ruimten||[]).some(r=>r.soort!=="fransbalkon"&&num(r.m2)>0))return[];return[{o:"Balkon van "+fmt(K.balkonM2)+" m² toevoegen",c:K.balkon,a:y=>{y.buiten.ruimten=y.buiten.ruimten||[];y.buiten.ruimten.push({soort:"balkon",groep:"priv",m2:String(K.balkonM2),maten:[]});}}];}},
  {key:"aanbel",h:"eenvoudig",hr:"Video-intercom plaatsen",naam:"Aanbelfunctie met video en audio",kost:"aanbel",gen(x,K){if(x.bijz.aanbel)return[];return[{o:"Aanbelfunctie met video en audio",c:K.aanbel,a:y=>{y.bijz.aanbel=true;}}];}},
  {key:"laadpaal",h:"gemiddeld",hr:"Alleen bij eigen parkeerplek; aansluiting nodig",naam:"Privé laadpaal",kost:"laadpaal",gen(x,K){if(num(x.bijz.laadpalen)>=1)return[];return[{o:"Privé laadpaal",c:K.laadpaal,a:y=>{y.bijz.laadpalen=num(y.bijz.laadpalen)+1;}}];}}
];
// ---- regels 4408–4409 ----
function safeApply(f,y){try{f(y);}catch(e){}normalizeInput(y);}
const H_FACTOR={eenvoudig:1,gemiddeld:1.3,lastig:2.5};
// ---- regels 4412–4502 ----
function candidates(x,K,N,uit,alles){
  normalizeInput(x);const base=calc(x,N).exact;const out=[];
  for(const m of MAATREGELEN){if(uit[m.key])continue;for(const c of m.gen(x,K,N)){const h=c.h||m.h||"gemiddeld";if(!alles&&h==="lastig"&&!adviesState.lastig)continue;const y=clone(x);safeApply(c.a,y);const g=r2(calc(y,N).exact-base);if(g>0.009)out.push({key:m.key,o:c.o,c:c.c,g,nominal:c.nominal,h,hr:c.hr||m.hr||"",ratio:c.c/g,score:c.c/g*H_FACTOR[h],apply:c.a,bron:c.bron,omschrijving:c.omschrijving,kostenMin:c.kostenMin,kostenMax:c.kostenMax,besparingMin:c.besparingMin,besparingMax:c.besparingMax});}}
  return out.sort((a,b)=>a.score-b.score);
}
function runAdvies(){
  const K=adviesState.kosten, uit=adviesState.uit;
  const doel=N.grensMidden+1+(adviesState.marge||0);
  let x=normalizeInput(clone(cur.input));x._origLabel=x.energie.label;x._origIndexKlasse=x.energie.indexKlasse;const start=calc(x,N);
  const stappen=[];let guard=0;
  // Zelf gekozen maatregelen uit "Alle mogelijke eerste stappen" gaan altijd mee
  const eerste=candidates(normalizeInput(clone(cur.input)),K,N,uit,true);
  (adviesState.forced||[]).forEach(fk=>{const c=eerste.find(z=>z.key+"|"+z.o===fk);if(!c)return;const b=calc(x,N).exact;safeApply(c.apply,x);const R=calc(x,N);stappen.push({key:c.key,forced:true,o:c.o,g:r2(R.exact-b),c:c.c,h:c.h,hr:c.hr,tot:R.totaal,apply:c.apply,bron:c.bron,omschrijving:c.omschrijving,kostenMin:c.kostenMin,kostenMax:c.kostenMax,besparingMin:c.besparingMin,besparingMax:c.besparingMax});});
  // "1 labelsprong" altijd verwerken: forceert precies één stap verbetering van het energielabel,
  // los van wat verder de goedkoopste route zou zijn.
  if(adviesState.labelsprong&&(x.energie.soort==="label"||x.energie.soort==="labelOud")){
    const i0=LABELS.indexOf(x.energie.label);
    if(i0>0){
      const target=LABELS[i0-1];
      const applyFn=y=>{y.energie.label=target;};
      const b=calc(x,N).exact;safeApply(applyFn,x);const R=calc(x,N);
      stappen.push({key:"label",forced:true,labelsprong:true,o:"Energielabel "+LABELS[i0]+" naar "+target,g:r2(R.exact-b),c:K.labelStap,h:"gemiddeld",hr:"Isolatie, glas of installatie; nieuw label laten opnemen",tot:R.totaal,apply:applyFn});
    }
  }else if(adviesState.labelsprong&&(x.energie.soort==="index"||x.energie.soort==="bouwjaar")){
    const target=volgendeLabelVoorIndexOfBouwjaar(x);
    if(target){
      const van=energieVanOmschrijving(x.energie),vandaag=new Date().toISOString().slice(0,10);
      const applyFn=y=>{y.energie={soort:"label",label:target,indexKlasse:"",bouwjaar:"",datum:vandaag};};
      const b=calc(x,N).exact;safeApply(applyFn,x);const R=calc(x,N);
      stappen.push({key:"label",forced:true,labelsprong:true,o:"Nieuw energielabel (vanaf 2021, NTA 8800) laten opnemen: "+van+" naar klasse "+target,g:r2(R.exact-b),c:K.labelStap,h:"gemiddeld",hr:"Energieprestatie laten opnemen via een erkende EP-adviseur (NTA 8800)",tot:R.totaal,apply:applyFn});
    }
  }

  while(calc(x,N).totaal<doel&&guard++<40){
    const c=candidates(x,K,N,uit);if(!c.length)break;
    const best=c[0];safeApply(best.apply,x);const R=calc(x,N);
    stappen.push({key:best.key,o:best.o,g:best.g,c:best.c,h:best.h,hr:best.hr,tot:R.totaal,apply:best.apply,bron:best.bron,omschrijving:best.omschrijving,kostenMin:best.kostenMin,kostenMax:best.kostenMax,besparingMin:best.besparingMin,besparingMax:best.besparingMax});
  }
  // Overbodige maatregelen schrappen, duurste eerst
  if(calc(x,N).totaal>=doel){
    const order=stappen.map((st,i)=>i).filter(i=>!stappen[i].forced).sort((a,b)=>stappen[b].c-stappen[a].c);
    const keep=new Set(stappen.map((st,i)=>i));
    for(const i of order){keep.delete(i);const y=normalizeInput(clone(cur.input));stappen.forEach((st,k)=>{if(keep.has(k))safeApply(st.apply,y);});if(calc(y,N).totaal<doel)keep.add(i);}
    const kept=stappen.filter((st,k)=>keep.has(k));
    x=normalizeInput(clone(cur.input));let prev=calc(x,N).exact;
    for(const st of kept){safeApply(st.apply,x);const R=calc(x,N);st.g=r2(R.exact-prev);prev=R.exact;st.tot=R.totaal;}
    stappen.length=0;stappen.push(...kept);
  }
  // Samenvoegen per soort maatregel
  const groep=[];for(const st of stappen){let g=groep.find(q=>q.key===st.key);if(!g){g={key:st.key,o:"",c:0,applies:[],delen:[],forced:false,omschrijving:[],kostenMin:0,kostenMax:0,besparingMin:0,besparingMax:0};groep.push(g);}if(st.forced)g.forced=true;const rank={eenvoudig:0,gemiddeld:1,lastig:2};if(!g.h||rank[st.h]>rank[g.h]){g.h=st.h;g.hr=st.hr;}g.c+=st.c;g.applies.push(st.apply);if(!g.delen.includes(st.o))g.delen.push(st.o);
    if(st.bron)g.bron=st.bron;(st.omschrijving||[]).forEach(o=>{if(!g.omschrijving.includes(o))g.omschrijving.push(o);});g.kostenMin+=num(st.kostenMin);g.kostenMax+=num(st.kostenMax);g.besparingMin+=num(st.besparingMin);g.besparingMax+=num(st.besparingMax);}
  const origSoort=cur.input.energie.soort;
  const vanOmschrijving=energieVanOmschrijving(cur.input.energie);
  x=normalizeInput(clone(cur.input));let prevE=calc(x,N).exact;
  for(const g of groep){g.applies.forEach(f=>safeApply(f,x));const R=calc(x,N);g.g=r2(R.exact-prevE);prevE=R.exact;g.tot=R.totaal;
    if(g.key==="label"){
      if(origSoort==="label"||origSoort==="labelOud"){
        g.o="Energielabel "+cur.input.energie.label+" naar "+x.energie.label;{const d=LABELS.indexOf(cur.input.energie.label)-LABELS.indexOf(x.energie.label);g.h=d>=3?"lastig":"gemiddeld";g.hr=g.bron==="advies"&&g.omschrijving.length?g.omschrijving.join("; "):(d>=3?"Grote renovatie: gevel, dak en installatie":"Isolatie, glas of installatie; nieuw label laten opnemen");}if(g.bron!=="advies")g.c=Math.max(0,LABELS.indexOf(cur.input.energie.label)-LABELS.indexOf(x.energie.label))*K.labelStap;
      }else{
        // Startpunt was energie-index of bouwjaar: geen "labelafstand" om op te herberekenen (dat gaf
        // altijd €0 kosten en een lege "van"-omschrijving), dus de al correct opgetelde kosten van de
        // losse stappen laten staan.
        g.o="Nieuw energielabel (vanaf 2021, NTA 8800) laten opnemen: "+vanOmschrijving+" naar label "+x.energie.label;
        g.h="gemiddeld";
        g.hr="Energieprestatie laten opnemen via een erkende EP-adviseur (NTA 8800)";
      }
    }
    else if(g.key==="indexKlasse"){const vanIndex=Number(cur.input.energie.indexKlasse);g.o="Energie-index "+INDEX_KLASSEN[vanIndex]+" naar "+INDEX_KLASSEN[Number(x.energie.indexKlasse)];const d=vanIndex-Number(x.energie.indexKlasse);g.h=d>=3?"lastig":"gemiddeld";g.hr=d>=3?"Grote renovatie: gevel, dak en installatie":"Isolatie, glas of installatie; nieuwe energie-index laten vaststellen";g.c=Math.max(0,d)*K.labelStap;}
    else g.o=g.delen.join("; ");}
  stappen.length=0;stappen.push(...groep);
  const eind=calc(x,N);
  const los=eerste;
  // Absoluut plafond: wat is er maximaal haalbaar als ook de 'lastige' maatregelen worden
  // meegenomen, los van de instelling 'lastig haalbare maatregelen automatisch meenemen'? Dit
  // bepaalt of de vrije sector principieel haalbaar is, ook wanneer de route hierboven — die de
  // huidige instellingen respecteert — daar (nog) niet komt. Zonder dit plafond zou het advies
  // "niet haalbaar" kunnen melden terwijl een paar ingrijpender maatregelen de woning wél in de
  // vrije sector zouden brengen.
  let xMax=normalizeInput(clone(cur.input));let guardMax=0;
  while(calc(xMax,N).totaal<doel&&guardMax++<40){
    const c=candidates(xMax,K,N,uit,true);if(!c.length)break;
    safeApply(c[0].apply,xMax);
  }
  const maxHaalbaar=calc(xMax,N).totaal;
  adviesState.result={start,eind,stappen,los,input:x,doel,gehaald:eind.totaal>=doel,maxHaalbaar};
}
function selectieResultaat(){
  const A=adviesState.result;const y=normalizeInput(clone(cur.input));let c=0,n=0;
  A.stappen.forEach((g,k)=>{if(adviesState.skip[k])return;g.applies.forEach(f=>safeApply(f,y));c+=g.c;n++;});
  return {input:y,R:calc(y,N),kosten:c,n};
}
return { berekenRouteVoorDoel, candidates, runAdvies, selectieResultaat, MAATREGELEN };
}
module.exports = { maakAdvies };
