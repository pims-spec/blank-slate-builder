// Automatisch geëxtraheerd uit reference/wws-site.html — alleen voor de vergelijkingstest
// src/lib/wws/opzoeken/eponline.vergelijk.test.ts. Letterlijke regels (niet bewerken):
//   2904–2933  epAdresVelden, epFindField, epToIsoDate
//   2959–3012  epWoningtype, epBepaalSoort, applyEpLabel
// De globals van de pagina (cur, epState) en UI-functies (toast, setDirty,
// rerenderHuidigScherm) komen binnen als parameters/stubs van maakEp().
const { num, LABELS } = require("./wws-site-calc.cjs");

function maakEp(cur, epState, stubs) {
  const { toast, setDirty, rerenderHuidigScherm } = stubs;
// ---- regels 2904–2933 ----
function epAdresVelden(){
  const m=(cur&&cur.meta)||{};
  const postcode=String(m.postcode||"").replace(/\s+/g,"").toUpperCase();
  const hn=String(m.huisnummer||"").trim();
  const mHn=/^(\d+)\s*[-\s]?\s*(.*)$/.exec(hn);
  const huisnummer=mHn?mHn[1]:"";
  let rest=mHn?mHn[2].trim():"";
  let huisletter="",huisnummertoevoeging="";
  if(/^[A-Za-z]$/.test(rest))huisletter=rest;else if(rest)huisnummertoevoeging=rest;
  return {postcode,huisnummer,huisletter,huisnummertoevoeging};
}
function epFindField(obj,names,seen){
  seen=seen||new Set();
  if(obj==null||typeof obj!=="object"||seen.has(obj))return undefined;
  seen.add(obj);
  if(Array.isArray(obj)){for(const it of obj){const v=epFindField(it,names,seen);if(v!==undefined)return v;}return undefined;}
  for(const k of Object.keys(obj)){
    const nk=k.toLowerCase().replace(/[^a-z]/g,"");
    if(names.some(n=>nk===n||nk.endsWith(n))&&obj[k]!=null&&obj[k]!=="")return obj[k];
  }
  for(const k of Object.keys(obj)){const v=epFindField(obj[k],names,seen);if(v!==undefined)return v;}
  return undefined;
}
function epToIsoDate(v){
  if(!v)return "";
  const s=String(v);
  let m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s);if(m)return m[1]+"-"+m[2]+"-"+m[3];
  m=/^(\d{4})(\d{2})(\d{2})$/.exec(s);if(m)return m[1]+"-"+m[2]+"-"+m[3];
  return "";
}
// ---- regels 2959–3012 ----
function epWoningtype(gebouwtype){
  if(!gebouwtype)return null;
  const g=String(gebouwtype).toLowerCase();
  if(/vrijstaand|twee.?onder|2.?onder|hoekwoning|tussenwoning|rijwoning|rijtjeswoning|hoekhuis|eengezins|landhuis|boerderij/.test(g))return "eengezins";
  if(/appartement|flat|maisonnette|portiek|galerij|benedenwoning|bovenwoning|meergezins|duplex/.test(g))return "meergezins";
  return null;
}
function epBepaalSoort(r){
  // Bepaalt automatisch welke van de vier tegels (Energielabel vóór 2015 / Energie-Index
  // 2015-2021 / Label vanaf 2021 (NTA 8800) / Bouwjaar) van toepassing is, op basis van de
  // registratiedatum en de geldigheid van het label. Zelfde grenzen als de controle in calc().
  const klasse=epFindField(r,["energieklasse","labelklasse","energielabel"]);
  const regdatum=epToIsoDate(epFindField(r,["registratiedatum"]));
  const opndatum=epToIsoDate(epFindField(r,["opnamedatum"]));
  const datum=regdatum||opndatum;
  const geldigTot=epToIsoDate(epFindField(r,["geldigtot"]));
  const verlopen=!!(geldigTot&&new Date(geldigTot)<new Date());
  const geldigKlasse=!!(klasse&&LABELS.includes(String(klasse))&&!verlopen);
  const dt=datum?new Date(datum):null;
  let soort="bouwjaar";
  if(geldigKlasse){
    if(dt&&dt<new Date("2015-01-01"))soort="labelOud";
    else if(dt&&dt<new Date("2021-01-01"))soort="index";
    else soort="label";
  }
  return {soort,klasse:geldigKlasse?String(klasse):null,datum};
}
function applyEpLabel(){
  if(!cur||!epState.result)return;
  cur.meta.auto=cur.meta.auto||{};
  const r=epState.result;
  const {soort,klasse,datum}=epBepaalSoort(r);
  const indexRuw=epFindField(r,["energieindex"]);
  const bouwjaar=epFindField(r,["bouwjaar"]);
  const gebouwtype=epFindField(r,["gebouwtype"]);
  const woningtype=epWoningtype(gebouwtype);
  let changed=false,gelukt=[];
  cur.input.energie.soort=soort;changed=true;
  if(soort==="label"||soort==="labelOud"){cur.input.energie.label=klasse;gelukt.push("energielabel");}
  else if(soort==="index"){
    if(indexRuw&&num(indexRuw)>0){
      const ei=num(indexRuw);
      cur.input.energie.indexKlasse=String([0.6,0.8,1.2,1.4,1.8,2.1,2.4,2.7,999].findIndex(x=>ei<=x));
      gelukt.push("energie-index");
    }else{
      toast("Geregistreerd als energie-index (2015-2021): kies hieronder zelf de juiste klasse, dit kon niet automatisch worden bepaald.");
    }
  }else if(bouwjaar&&/^\d{3,4}$/.test(String(bouwjaar))){cur.input.energie.bouwjaar=String(bouwjaar);}
  if(datum){cur.input.energie.datum=datum;}
  if(bouwjaar&&/^\d{3,4}$/.test(String(bouwjaar))){cur.meta.bouwjaar=String(bouwjaar);cur.meta.auto.bouwjaar=true;changed=true;gelukt.push("bouwjaar");}
  if(woningtype){cur.input.woningtype=woningtype;cur.meta.auto.woningtype=true;changed=true;gelukt.push("type woning");}
  if(!changed){toast("Geen bruikbare gegevens gevonden in het antwoord.");return;}
  setDirty(true);rerenderHuidigScherm();toast((gelukt.length?gelukt.join(", ").replace(/^./,c=>c.toUpperCase()):"Gegevens")+" overgenomen van EP-Online.");
}
return { epAdresVelden, epFindField, epToIsoDate, epWoningtype, epBepaalSoort, applyEpLabel };
}
module.exports = { maakEp };
