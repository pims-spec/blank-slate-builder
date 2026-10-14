// Automatisch geëxtraheerd uit reference/wws-site.html — alleen voor de vergelijkingstest
// src/lib/wws/pve.vergelijk.test.ts. Letterlijke regels (niet bewerken):
//   1302–1303  pveActief, klantActievePves
//   1456–1466  normalizeKlantPves
//   1856–1887  facIsOnbewerkt, pasPveOpFac, pasKlantPveToe
//   1894–1902  pasPveOpNieuweRuimte
// De globals van de pagina (cur, klanten, setDirty, uid) komen binnen als parameters van
// maakPve(); clone, facDefault en getPath komen uit wws-site-calc.cjs (fase 1).
const { clone, facDefault, getPath } = require("./wws-site-calc.cjs");

function maakPve(cur, klanten, setDirty, uid) {
// ---- regels 1302–1303 ----
function pveActief(p){return !!(p&&((p.keuken&&p.keuken.actief)||(p.badkamer&&p.badkamer.actief)||(p.toilet&&p.toilet.actief)));}
function klantActievePves(k){return ((k&&k.pves)||[]).filter(pveActief);}
// ---- regels 1456–1466 ----
function normalizeKlantPves(k){
  const out=Object.assign({},k);
  let pves=null;
  if(Array.isArray(out.pves))pves=out.pves;
  else if(Array.isArray(out.pve))pves=out.pve;
  else if(out.pve&&typeof out.pve==="object"&&(out.pve.keuken||out.pve.badkamer||out.pve.toilet))pves=[Object.assign({id:uid(),naam:"Standaard"},clone(out.pve))];
  else pves=[];
  out.pves=pves.map(p=>Object.assign({},p,{id:p.id||uid(),naam:p.naam||"Standaard"}));
  delete out.pve;
  return out;
}
// ---- regels 1856–1887 ----
function facIsOnbewerkt(f){
  if(!f)return false;
  const basis=facDefault(f.kind,false);
  if(f.kind==="keuken")return f.keuken.lengte===basis.keuken.lengte&&JSON.stringify(f.keuken.voorz||{})===JSON.stringify(basis.keuken.voorz||{});
  if(f.kind==="badkamer")return JSON.stringify(f.san||{})===JSON.stringify(basis.san||{});
  if(f.kind==="toilet")return f.toilet.toilet===basis.toilet.toilet&&!!f.toilet.fontein===!!basis.toilet.fontein;
  return false;
}
// Past het PvE toe op één facility-object, mits het bijbehorende onderdeel actief is én de
// ruimte nog onbewerkt is. Wordt hergebruikt door zowel het (bevestigde) bulk-toepassen op een
// hele telling als het stil aanvullen van een enkele, zojuist aangemaakte ruimte.
function pasPveOpFac(f,p){
  if(!f||!p)return false;
  if(f.kind==="keuken"&&p.keuken&&p.keuken.actief&&facIsOnbewerkt(f)){f.keuken=clone(p.keuken.keuken);f.uitPve=true;return true;}
  if(f.kind==="badkamer"&&p.badkamer&&p.badkamer.actief&&facIsOnbewerkt(f)){f.san=clone(p.badkamer.san);f.uitPve=true;return true;}
  if(f.kind==="toilet"&&p.toilet&&p.toilet.actief&&facIsOnbewerkt(f)){f.toilet=clone(p.toilet.toilet);f.uitPve=true;return true;}
  return false;
}
function pasKlantPveToe(pve){
  if(!cur||!pve)return {aangepast:0,overgeslagen:0};
  const p=pve;let aangepast=0,overgeslagen=0;
  ["vertrekken","overig"].forEach(key=>{
    (cur.input[key]||[]).forEach(r=>{
      const f=r.fac;if(!f)return;
      const onderdeelActief=(f.kind==="keuken"&&p.keuken&&p.keuken.actief)||(f.kind==="badkamer"&&p.badkamer&&p.badkamer.actief)||(f.kind==="toilet"&&p.toilet&&p.toilet.actief);
      if(!onderdeelActief)return;
      if(pasPveOpFac(f,p))aangepast++;else overgeslagen++;
    });
  });
  if(aangepast)setDirty(true);
  return {aangepast,overgeslagen};
}
// ---- regels 1894–1902 ----
function pasPveOpNieuweRuimte(key,i){
  if(!cur||!cur.meta||!cur.meta.klantId)return;
  const k=klanten.find(x=>x.id===cur.meta.klantId);if(!k)return;
  const actief=klantActievePves(k);
  const pve=(k.pves||[]).find(p=>p.id===cur.meta.pveId)||(actief.length===1?actief[0]:null);
  if(!pve)return;
  const row=(getPath(cur,"input."+key)||[])[i];if(!row||!row.fac)return;
  if(pasPveOpFac(row.fac,pve))setDirty(true);
}
return { pveActief, klantActievePves, normalizeKlantPves, facIsOnbewerkt, pasPveOpFac, pasKlantPveToe, pasPveOpNieuweRuimte };
}
module.exports = { maakPve };
