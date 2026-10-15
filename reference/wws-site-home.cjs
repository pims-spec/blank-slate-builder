// Automatisch geëxtraheerd uit reference/wws-site.html — alleen voor src/lib/wws/home.vergelijk.test.ts.
// Letterlijke regels 1575–1600 (berekenHomeStats); niet bewerken. De globale profile, tellingen
// en store van de bron komen uit de omhullende functie.

function maakBerekenHomeStats(profile, tellingen, store) {
async function berekenHomeStats(){
  const eigen=profile?tellingen.filter(t=>t.ownerId===profile.id):tellingen.slice();
  const out={aantalTellingen:eigen.length,aantalAdvies:0,puntenTotaal:0,puntenGem:null,huurTotaal:0,huurGem:null};
  if(!eigen.length)return out;
  let alleVersies=[];
  try{alleVersies=await store.alleVersies();}catch(e){alleVersies=[];}
  const idsEigen=new Set(eigen.map(t=>t.id));
  alleVersies=alleVersies.filter(v=>idsEigen.has(v.tellingId));
  const perTelling={};
  alleVersies.forEach(v=>{(perTelling[v.tellingId]=perTelling[v.tellingId]||[]).push(v);});
  Object.keys(perTelling).forEach(tid=>{
    const vs=perTelling[tid].slice().sort((a,b)=>a.nr-b.nr);
    if(vs.length<2)return;
    const eerste=vs[0],laatste=vs[vs.length-1];
    const pE=eerste.resultaat&&eerste.resultaat.totaal,pL=laatste.resultaat&&laatste.resultaat.totaal;
    const hE=eerste.resultaat&&eerste.resultaat.maxHuur,hL=laatste.resultaat&&laatste.resultaat.maxHuur;
    const puntenBeter=pE!=null&&pL!=null&&pL>pE;
    const huurBeter=hE!=null&&hL!=null&&hL>hE+0.01;
    if(puntenBeter||huurBeter)out.aantalAdvies++;
    if(puntenBeter)out.puntenTotaal+=(pL-pE);
    if(huurBeter)out.huurTotaal+=(hL-hE);
  });
  out.puntenGem=out.aantalAdvies?out.puntenTotaal/out.aantalAdvies:null;
  out.huurGem=out.aantalAdvies?out.huurTotaal/out.aantalAdvies:null;
  return out;
}
return berekenHomeStats;
}

module.exports = { maakBerekenHomeStats };
