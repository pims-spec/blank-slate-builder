// Automatisch geëxtraheerd uit reference/wws-site.html — alleen voor src/lib/wws/versieDiff.vergelijk.test.ts.
// Letterlijke regels 3407–3433 (vlakAf, weergaveWaarde, diffVersies, versieKeuzeLabel); niet bewerken.

function vlakAf(obj,prefix,out){
  if(obj==null||typeof obj!=="object"){out[prefix]=obj;return;}
  if(Array.isArray(obj)){
    if(!obj.length){out[prefix]="(leeg)";return;}
    obj.forEach((v,i)=>vlakAf(v,prefix+"["+i+"]",out));
    return;
  }
  const keys=Object.keys(obj);
  if(!keys.length){out[prefix]="(leeg)";return;}
  keys.forEach(k=>vlakAf(obj[k],prefix?prefix+"."+k:k,out));
}
function weergaveWaarde(v){if(v==null||v==="")return "(leeg)";if(typeof v==="boolean")return v?"ja":"nee";return String(v);}
function diffVersies(vA,vB){
  const flatA={},flatB={};
  vlakAf(vA&&vA.input,"",flatA);vlakAf(vB&&vB.input,"",flatB);
  const keys=new Set(Object.keys(flatA).concat(Object.keys(flatB)));
  const verschillen=[];
  keys.forEach(pad=>{
    const a=flatA[pad],b=flatB[pad];
    const av=weergaveWaarde(a),bv=weergaveWaarde(b);
    if(av!==bv)verschillen.push({pad,van:av,naar:bv});
  });
  verschillen.sort((x,y)=>x.pad.localeCompare(y.pad,"nl"));
  return verschillen;
}
let diffTid=null;
function versieKeuzeLabel(v){return "v"+v.nr+" — "+(v.notitie||new Date(v.createdAt).toLocaleDateString("nl-NL",{day:"numeric",month:"short",year:"numeric"}));}

module.exports = { vlakAf, weergaveWaarde, diffVersies, versieKeuzeLabel };
