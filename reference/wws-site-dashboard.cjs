// Automatisch geëxtraheerd uit reference/wws-site.html — alleen voor de vergelijkingstest
// src/lib/wws/dashboard.vergelijk.test.ts. Letterlijke regels 2311–2406 (SEGRANG,
// dashboardKlantFilter, berekenDashboard), niet bewerken. De globals van de pagina
// (tellingen, store, N) komen binnen als parameters van maakDashboard(); calc,
// huurVoorPunten en LABELS komen uit wws-site-calc.cjs (fase 1).
const { calc, huurVoorPunten, LABELS } = require("./wws-site-calc.cjs");

function maakDashboard(tellingen, store, N) {
// ---- regels 2311–2406 ----
const SEGRANG={laag:0,midden:1,hoog:2};
let dashboardKlantFilter="";
async function berekenDashboard(klantIdOverride){
  const klantId=klantIdOverride!==undefined?klantIdOverride:dashboardKlantFilter;
  const lijst=(tellingen||[]).filter(t=>!klantId||(t.meta&&t.meta.klantId===klantId));
  // Live herberekenen met de huidige normen (in plaats van het opgeslagen laatstePunten te
  // vertrouwen), zodat dit ook meteen klopt als de normen net zijn aangepast.
  const resultaten=lijst.map(t=>{
    try{const R=calc(t.input,N);return {t,totaal:R.totaal,maxHuur:R.maxHuur,seg:R.seg};}
    catch(e){return {t,totaal:t.laatstePunten!=null?t.laatstePunten:null,maxHuur:null,seg:null};}
  });
  const grensLaag=N.grensLaag,grensMidden=N.grensMidden;
  const metPunten=resultaten.filter(r=>r.totaal!=null);
  const gemPunten=metPunten.length?metPunten.reduce((s,r)=>s+r.totaal,0)/metPunten.length:null;
  const segLaag=metPunten.filter(r=>r.seg==="laag");
  const segMidden=metPunten.filter(r=>r.seg==="midden");
  const segHoog=metPunten.filter(r=>r.seg==="hoog");
  const marge=10; // punten: wat we als "net onder de grens" beschouwen
  const nabijGrens=metPunten.filter(r=>r.totaal<=grensMidden&&r.totaal>grensMidden-marge);

  // Energielabels: een registratie (label of energie-index) is 10 jaar geldig vanaf de
  // registratiedatum die bij het ophalen via EP-Online is vastgelegd. Handmatig ingevulde
  // labels zonder bekende datum kunnen we niet signaleren.
  const vandaag=new Date();
  const labelSignalen=lijst.map(t=>{
    const E=t.input&&t.input.energie;
    const soort=E&&E.soort;
    const datum=E&&E.datum;
    if(!datum||(soort!=="label"&&soort!=="labelOud"&&soort!=="index"))return null;
    const d=new Date(datum);if(isNaN(d.getTime()))return null;
    const vervalt=new Date(d);vervalt.setFullYear(vervalt.getFullYear()+10);
    const dagenTot=Math.round((vervalt-vandaag)/86400000);
    return {t,vervalt,dagenTot};
  }).filter(Boolean).filter(x=>x.dagenTot<365).sort((a,b)=>a.dagenTot-b.dagenTot);

  // Waarde-analyse: wat is er door hertellingen al daadwerkelijk bereikt (eerste versie
  // vergeleken met de laatste versie van diezelfde telling), en wat zou er nog te behalen
  // zijn bij de tellingen die net onder de vrije-sectorgrens zitten.
  let alleVersies=[];
  try{alleVersies=await store.alleVersies();}catch(e){alleVersies=[];}
  if(klantId){const idsInLijst=new Set(lijst.map(t=>t.id));alleVersies=alleVersies.filter(v=>idsInLijst.has(v.tellingId));}
  const perTelling={};
  alleVersies.forEach(v=>{(perTelling[v.tellingId]=perTelling[v.tellingId]||[]).push(v);});
  let behaaldTotaal=0,behaaldAantal=0,opgeschoven=0;
  Object.keys(perTelling).forEach(tid=>{
    const vs=perTelling[tid].slice().sort((a,b)=>a.nr-b.nr);
    if(vs.length<2)return;
    const eerste=vs[0],laatste=vs[vs.length-1];
    const hE=eerste.resultaat&&eerste.resultaat.maxHuur,hL=laatste.resultaat&&laatste.resultaat.maxHuur;
    if(hE!=null&&hL!=null&&hL>hE+0.01){behaaldTotaal+=(hL-hE);behaaldAantal++;}
    const sE=eerste.resultaat&&eerste.resultaat.seg,sL=laatste.resultaat&&laatste.resultaat.seg;
    if(sE&&sL&&SEGRANG[sL]>SEGRANG[sE])opgeschoven++;
  });
  const huurBijGrens=huurVoorPunten(grensMidden+1,N);
  let potentieelTotaal=0,potentieelAantal=0;
  nabijGrens.forEach(r=>{
    r.nodig=grensMidden+1-r.totaal;
    r.winst=(r.maxHuur!=null&&huurBijGrens!=null&&huurBijGrens>r.maxHuur+0.01)?(huurBijGrens-r.maxHuur):null;
    if(r.winst!=null){potentieelTotaal+=r.winst;potentieelAantal++;}
  });

  // Trend: gemiddeld aantal punten per maand, over alle opgeslagen versies heen (ongeacht
  // welke telling), zodat je ziet of de portefeuille als geheel vooruitgaat.
  const trendMap={};
  alleVersies.forEach(v=>{
    if(!v.createdAt||!v.resultaat||v.resultaat.totaal==null)return;
    const d=new Date(v.createdAt);if(isNaN(d.getTime()))return;
    const key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
    (trendMap[key]=trendMap[key]||[]).push(v.resultaat.totaal);
  });
  const MAANDNAMEN=["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
  const trend=Object.keys(trendMap).sort().map(key=>{
    const arr=trendMap[key];const [jaar,maand]=key.split("-");
    return {key,label:MAANDNAMEN[Number(maand)-1]+" "+jaar.slice(2),gem:arr.reduce((s,x)=>s+x,0)/arr.length};
  });

  // Verdeling naar energielabel: alleen tellingen met een bekende labelklasse (A++++ t/m G);
  // op energie-index of bouwjaar gebaseerde tellingen hebben geen vergelijkbare klasse.
  const labelCounts=LABELS.map(k=>({label:k,n:lijst.filter(t=>{const E=t.input&&t.input.energie;return E&&(E.soort==="label"||E.soort==="labelOud")&&E.label===k;}).length}));

  // Werkverdeling per collega: aantal tellingen en gemiddeld aantal punten, per eigenaar.
  const perEigenaar={};
  resultaten.forEach(r=>{(perEigenaar[r.t.ownerId||"_onbekend"]=perEigenaar[r.t.ownerId||"_onbekend"]||[]).push(r);});
  const perCollega=Object.keys(perEigenaar).map(oid=>{
    const rs=perEigenaar[oid],metP=rs.filter(r=>r.totaal!=null);
    return {ownerId:oid,aantal:rs.length,gemPunten:metP.length?metP.reduce((s,r)=>s+r.totaal,0)/metP.length:null};
  }).sort((a,b)=>b.aantal-a.aantal);

  // Recent bijgewerkt: de laatst aangepaste tellingen, als activiteitenoverzicht.
  const recent=lijst.slice().filter(t=>t.updatedAt).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,8);

  return {totaal:lijst.length,gemPunten,grensLaag,grensMidden,marge,
    segLaag,segMidden,segHoog,nabijGrens,vrijeSector:segHoog,labelSignalen,
    behaaldTotaal,behaaldAantal,opgeschoven,potentieelTotaal,potentieelAantal,
    alleTotalen:metPunten.map(r=>r.totaal),trend,labelCounts,perCollega,recent};
}
return { berekenDashboard };
}
module.exports = { maakDashboard };
