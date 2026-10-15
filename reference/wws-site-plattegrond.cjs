// Automatisch geëxtraheerd uit reference/wws-site.html — alleen voor
// src/lib/wws/plattegrond/toepassen.vergelijk.test.ts. Letterlijke regels (niet bewerken):
//   4728–4732  platBboxOk
//   4803–4838  applyPlat
// De DOM ($, document.querySelector) en de globals (cur, platState) komen binnen via maakPlat().
const { normalizeInput, num, r2, typeOf } = require("./wws-site-calc.cjs");

function maakPlat(cur, platState, velden) {
  const $ = (sel) => velden[sel] || { checked: false, value: "", close() {} };
  const document = { querySelector: (sel) => velden[sel] || null };
  const setDirty = () => {}, renderMain = () => {}, toast = () => {};
// ---- regels 4728–4732 ----
function platBboxOk(b){
  if(!b||typeof b!=="object")return false;
  const {x,y,w,h}=b;
  return [x,y,w,h].every(v=>typeof v==="number"&&isFinite(v))&&w>0&&h>0&&x>=-0.02&&y>=-0.02&&x+w<=1.02&&y+h<=1.02;
}
// ---- regels 4803–4838 ----
function applyPlat(){
  const R=platState.result;if(!R||!cur)return;
  const rooms=R.ruimten||[];const I=cur.input;
  const newV=[],newO=[];
  rooms.forEach((r,i)=>{
    const cb=document.querySelector('[data-pr="'+i+'"]');if(cb&&!cb.checked)return;
    const sel=document.querySelector('[data-prs="'+i+'"]').value.split(":");
    const m=document.querySelector('[data-prm="'+i+'"]').value;
    const herkomst="Plattegrond: "+(r.bron||"?")+(r.opmerking?" ("+String(r.opmerking).slice(0,80)+")":"");
    const maten=(num(r.lengte_m)>0&&num(r.breedte_m)>0)?[{l:String(r.lengte_m).replace(".",","),b:String(r.breedte_m).replace(".",",")}]:[{l:"",b:""}];
    const bbox=platBboxOk(r.bbox)?{x:r.bbox.x,y:r.bbox.y,w:r.bbox.w,h:r.bbox.h}:null;
    if(sel[0]==="v")newV.push(Object.assign({type:sel[1],naam:r.naam||"",m2:m,maten,verwarmd:true,verkoeld:false,herkomst},bbox?{bbox}:{}));
    else newO.push(Object.assign({type:sel[1],naam:r.naam||"",m2:m,maten,verwarmd:typeOf("overig",sel[1]).verkeer===true,herkomst},bbox?{bbox}:{}));
  });
  if($("#platReplace").checked){I.vertrekken=newV;I.overig=newO;}
  else{
    const merge=(list,add)=>{add.forEach(n=>{const ex=list.find(r=>r.type===n.type&&!(num(r.m2)>0)&&!r._merged);if(ex){ex.m2=n.m2;ex.maten=n.maten;ex.herkomst=n.herkomst;ex.naam=n.naam;ex._merged=true;}else list.push(n);});list.forEach(r=>delete r._merged);};
    merge(I.vertrekken,newV);merge(I.overig,newO);
  }
  const S=R.sanitair||{};
  normalizeInput(I);
  if($("#platSan")&&$("#platSan").checked){
    const br=I.vertrekken.find(r=>r.fac&&r.fac.kind==="badkamer");
    if(br){const b=br.fac.san;b.toiletStaand=num(S.toilet_badkamer);b.toiletHang=0;b.wastafel=num(S.wastafel_badkamer);b.douche=num(S.douche);b.bad=num(S.bad);b.badDouche=num(S.bad_douche);}
    const trs=I.overig.filter(r=>r.fac&&r.fac.kind==="toilet");let nt=num(S.toilet_toiletruimte),nf=num(S.fontein_toiletruimte);
    trs.forEach(tr=>{tr.fac.toilet.toilet=nt>0?"staand":"geen";if(nt>0)nt--;tr.fac.toilet.fontein=nf>0;if(nf>0)nf--;});
  }
  const K=R.keuken||{};const al=num(K.aanrecht_m);
  if($("#platKeuken")&&$("#platKeuken").checked&&al>0){const kr=I.vertrekken.find(r=>r.fac&&r.fac.kind==="keuken");if(kr)kr.fac.keuken.lengte=al<1?"<1":al<=2?"1-2":">=2";}
  if($("#platBuiten")&&$("#platBuiten").checked){const t=(R.buitenruimten||[]).reduce((s,b)=>s+num(b.m2),0);if(t>0)I.buiten.ruimten.push({soort:"overig",groep:"priv",m2:String(r2(t)).replace(".",","),maten:[]});}
  if(platState.previewUrl)I.plattegrondImg=platState.previewUrl;
  setDirty(true);$("#dlgPlat").close();renderMain();
  toast("Plattegrond overgenomen. Controleer de gemarkeerde ruimten.");
}

/* ---------------- Verduurzamingsadvies inlezen (energielabel-maatregelen) ---------------- */
return { applyPlat };
}

module.exports = { maakPlat };
