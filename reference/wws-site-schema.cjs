// Automatisch geëxtraheerd uit reference/wws-site.html — alleen voor
// src/lib/wws/schemaTekening.vergelijk.test.ts. Letterlijke regels (niet bewerken):
//   4728–4732  platBboxOk
//   5734–5763  indelingVloerplanLayout
//   5771–5929  indelingTekenKamerblok t/m indelingWrapCanvasText
// document.createElement('canvas') komt binnen via maakSchema(maakCanvas).
const { num, fmt, typeOf } = require("./wws-site-calc.cjs");

function maakSchema(maakCanvas) {
  const document = { createElement: () => maakCanvas() };
  const indelingState = { rooms: [] };
// ---- regels 4728–4732 ----
function platBboxOk(b){
  if(!b||typeof b!=="object")return false;
  const {x,y,w,h}=b;
  return [x,y,w,h].every(v=>typeof v==="number"&&isFinite(v))&&w>0&&h>0&&x>=-0.02&&y>=-0.02&&x+w<=1.02&&y+h<=1.02;
}
// ---- regels 5734–5763 ----
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
// Tekent een eenvoudig, proportioneel blokkenschema (géén bouwkundige tekening) naar een
// PNG data-URL, zodat er na het toepassen van een variant ook weer een 'plattegrond' bij de
// telling hoort (die van vóór de herindeling klopt immers niet meer). Faalt dit om wat voor
// ---- regels 5771–5929 ----
function indelingTekenKamerblok(ctx,x,y,w,h,b,buiten){
  ctx.fillStyle=b.vast?"#e4e4ec":"#e3e3f6";ctx.fillRect(x,y,w,h);
  // Muur: iets dikkere buitenlijn plus een dunnere lijn net erbinnen, voor een 'dubbele lijn'-
  // muurdikte zoals op een echte plattegrond, in plaats van één enkele rand.
  ctx.strokeStyle=b.vast?"#6b6b86":"#6b6ba8";
  ctx.lineWidth=4;ctx.setLineDash(b.nieuw?[8,5]:[]);ctx.strokeRect(x,y,w,h);
  if(w>16&&h>16){ctx.lineWidth=1;ctx.setLineDash([]);ctx.strokeStyle="rgba(31,31,51,.25)";ctx.strokeRect(x+3,y+3,w-6,h-6);}
  ctx.setLineDash([]);
  // Deursymbool: een kwart cirkelboog (deurzwaai) in de hoek met het langste beschikbare wand-
  // segment, met een kort lijntje voor de deur zelf. Alleen als het blok groot genoeg is om het
  // niet te laten verdrinken.
  if(w>34&&h>34){
    const deurBreedte=Math.min(26,Math.min(w,h)*0.35);
    const verticaleWand=h>=w;
    ctx.strokeStyle="#1f1f33";ctx.lineWidth=1.5;
    ctx.beginPath();
    if(verticaleWand){
      // Deur in de linker wand, dicht bij de bovenhoek.
      ctx.moveTo(x,y+6);ctx.lineTo(x,y+6+deurBreedte);
      ctx.moveTo(x,y+6+deurBreedte);ctx.arc(x,y+6,deurBreedte,Math.PI/2,0,true);
    }else{
      // Deur in de boven-wand, dicht bij de linkerhoek.
      ctx.moveTo(x+6,y);ctx.lineTo(x+6+deurBreedte,y);
      ctx.moveTo(x+6+deurBreedte,y);ctx.arc(x+6,y,deurBreedte,0,Math.PI/2,false);
    }
    ctx.stroke();
  }
  // Raamsymbool: twee korte evenwijdige streepjes dwars over de muur die het dichtst bij de
  // buitenrand van het hele schema ligt (een eenvoudige benadering van 'deze ruimte grenst
  // vermoedelijk aan de gevel'), zodat niet elke ruimte een raam krijgt.
  if(buiten&&w>30&&h>30){
    ctx.strokeStyle="#1f1f33";ctx.lineWidth=1.5;
    const mid=buiten==="boven"||buiten==="onder"?x+w/2:x;
    const ramen=(cx,cy,horiz)=>{
      ctx.beginPath();
      if(horiz){ctx.moveTo(cx-14,cy-2);ctx.lineTo(cx+14,cy-2);ctx.moveTo(cx-14,cy+2);ctx.lineTo(cx+14,cy+2);}
      else{ctx.moveTo(cx-2,cy-14);ctx.lineTo(cx-2,cy+14);ctx.moveTo(cx+2,cy-14);ctx.lineTo(cx+2,cy+14);}
      ctx.stroke();
    };
    if(buiten==="boven")ramen(x+w/2,y,true);
    else if(buiten==="onder")ramen(x+w/2,y+h,true);
    else if(buiten==="links")ramen(x,y+h/2,false);
    else if(buiten==="rechts")ramen(x+w,y+h/2,false);
  }
  ctx.fillStyle="#1f1f33";ctx.textAlign="center";
  const metLabel=w>50&&h>26;
  if(metLabel){ctx.font="bold 13px sans-serif";indelingWrapCanvasText(ctx,b.label,x+w/2,y+h/2-6,Math.max(20,w-10));}
  if(w>40&&h>14){ctx.font="12px sans-serif";ctx.fillText(fmt(b.m2)+" m²",x+w/2,y+h/2+(metLabel?18:4));}
}
// Welke buitenrand (indien enig) ligt het dichtst bij dit blok, binnen een kleine marge —
// gebruikt om te bepalen aan welke wand (zo die er is) een raamsymbool komt.
function indelingBuitenrand(x,y,w,h,W,H,PAD){
  const marge=14;
  const afstanden=[["links",x-PAD],["rechts",(W-PAD)-(x+w)],["boven",y-PAD],["onder",(H-PAD)-(y+h)]];
  const dichtstbij=afstanden.reduce((a,b)=>b[1]<a[1]?b:a);
  return dichtstbij[1]<=marge?dichtstbij[0]:null;
}
// Bepaalt, uit een lijst ruimten met elk een (mogelijk ontbrekende) bbox, de kleinste
// rechthoek die alle geldige bbox'en omvat (fracties 0-1 t.o.v. de ingelezen plattegrond-
// afbeelding). Pure rekenfunctie (geen canvas nodig), gebruikt door indelingSchemaDataUrl
// om in te zoomen op het deel van de plattegrond dat daadwerkelijk ruimten bevat (i.p.v. het
// hele canvas te vullen met vooral lege marge rond de tekening) en om de nieuw voorgestelde
// ruimten precies binnen het gebied van de oorspronkelijk vrij herindeelbare ruimten te
// plaatsen, in plaats van in een los stripje dat niets met de plattegrond te maken heeft.
function indelingUnieBbox(rooms){
  const geldig=(rooms||[]).filter(r=>platBboxOk(r.bbox));
  if(!geldig.length)return null;
  const x0=Math.min(...geldig.map(r=>r.bbox.x)),y0=Math.min(...geldig.map(r=>r.bbox.y));
  const x1=Math.max(...geldig.map(r=>r.bbox.x+r.bbox.w)),y1=Math.max(...geldig.map(r=>r.bbox.y+r.bbox.h));
  return {x:x0,y:y0,w:Math.max(0.02,x1-x0),h:Math.max(0.02,y1-y0)};
}
// origineleRooms: de ruimten zoals ze bij het openen van het Indelingsadvies zijn ingelezen
// (indelingState.rooms — elk met .status 'vast'/'vrij' en evt. .bbox), dus VÓÓR het splitsen
// in een vrije pool. Optioneel (valt terug op het globale indelingState.rooms): hiermee kan
// het schema (a) inzoomen op het deel van de plattegrond waar daadwerkelijk ruimten staan,
// in plaats van de hele, deels lege foto-afbeelding als uitgangspunt te nemen, en (b) de
// nieuw voorgestelde ruimten exact binnen de oude, vrij herindeelbare ruimten plaatsen in
// plaats van in een los stripje — dat was precies de klacht dat de gegenereerde indeling
// "totaal niet overeenkomt met de uitlijnen van de ingeladen plattegrond".
function indelingSchemaDataUrl(vertrekken,overig,origineleRooms){
  try{
    const alleRooms=vertrekken.map(r=>({label:r.naam||typeOf("vertrekken",r.type).l,m2:num(r.m2),vast:!!r._indVast,nieuw:!!r._indNieuw,bbox:r.bbox})).concat(
      overig.map(r=>({label:r.naam||typeOf("overig",r.type).l,m2:num(r.m2),vast:!!r._indVast,nieuw:!!r._indNieuw,bbox:r.bbox}))
    ).filter(b=>b.m2>0);
    if(!alleRooms.length)return null;
    const orig=origineleRooms||(typeof indelingState!=="undefined"?indelingState.rooms:null)||[];
    const geheelUnie=indelingUnieBbox(orig);
    const vrijUnie=indelingUnieBbox(orig.filter(r=>r.status==="vrij"));
    const PAD=10,W=1000;
    // De canvashoogte volgt, als er een geheelUnie is, de werkelijke verhouding (hoogte/breedte)
    // van het ingelezen plattegrond-gebied, zodat één gelijke schaalfactor voor x én y kan worden
    // gebruikt (geen uitgerekte/ingedrukte ruimten) — zonder geheelUnie (bijv. 'Blanco' start
    // zonder ingetekende vlakken) blijft de vaste 1000×620-verhouding van voorheen gehandhaafd.
    const H=geheelUnie?Math.round(Math.min(900,Math.max(320,(W-2*PAD)*(geheelUnie.h/geheelUnie.w)+2*PAD))):620;
    const canvas=document.createElement("canvas");canvas.width=W;canvas.height=H;
    const ctx=canvas.getContext&&canvas.getContext("2d");if(!ctx)return null;
    ctx.fillStyle="#f4f4f8";ctx.fillRect(0,0,W,H);
    const innerW=W-PAD*2,innerH=H-PAD*2;
    // Vertaalt een foto-fractie (0-1 t.o.v. de hele ingelezen plattegrond-afbeelding) naar
    // canvaspixels — ingezoomd op geheelUnie (het deel van de plattegrond met daadwerkelijk
    // ruimten) als die bekend is, anders (zoals voorheen) rechtstreeks t.o.v. het hele canvas.
    const naarCanvas=(fx,fy)=>geheelUnie
      ?[PAD+((fx-geheelUnie.x)/geheelUnie.w)*innerW, PAD+((fy-geheelUnie.y)/geheelUnie.h)*innerH]
      :[PAD+fx*innerW, PAD+fy*innerH];
    // Vast gehouden ruimten mét een bruikbare bbox (van het inlezen van de plattegrond, zie
    // platBboxOk) krijgen hun ECHTE positie en afmeting op het schema. Ruimten zonder bruikbare
    // bbox (nieuw voorgesteld, of een vaste ruimte waarvan nooit een locatie kon worden
    // afgeleid) krijgen een proportioneel blokkenschema, bij voorkeur precies binnen het gebied
    // van de oorspronkelijk vrij herindeelbare ruimten (vrijUnie) — dus op de plek, in de maat
    // en met de verhoudingen van de plattegrond die is ingelezen — in plaats van in een los
    // stripje elders. Is er geen enkele bruikbare bbox (bijv. een 'Blanco' start zonder
    // ingetekende vlakken), dan werkt deze functie als voorheen: alles proportioneel verdeeld
    // over het hele canvas.
    const metBbox=alleRooms.filter(b=>b.vast&&platBboxOk(b.bbox));
    const zonderBbox=alleRooms.filter(b=>!(b.vast&&platBboxOk(b.bbox)));
    const geplaatst=[]; // {x,y,w,h,b} — voor het raamsymbool (buitenrand-detectie) van alle blokken samen
    metBbox.forEach(b=>{
      const [x,y]=naarCanvas(b.bbox.x,b.bbox.y);
      const [x2,y2]=naarCanvas(b.bbox.x+b.bbox.w,b.bbox.y+b.bbox.h);
      geplaatst.push({x,y,w:Math.max(1,x2-x-3),h:Math.max(1,y2-y-3),b});
    });
    if(zonderBbox.length){
      let stripX=PAD,stripY=PAD,stripW=innerW,stripH=innerH;
      if(vrijUnie){
        // Precies het gebied dat vóór het herindelen door de vrij herindeelbare ruimten werd
        // ingenomen — zo blijven de nieuw voorgestelde ruimten op de plek en in de verhoudingen
        // van de ingelezen plattegrond, in plaats van in een los stripje.
        const [sx,sy]=naarCanvas(vrijUnie.x,vrijUnie.y);
        const [sx2,sy2]=naarCanvas(vrijUnie.x+vrijUnie.w,vrijUnie.y+vrijUnie.h);
        stripX=sx;stripY=sy;stripW=Math.max(60,sx2-sx);stripH=Math.max(60,sy2-sy);
      }else if(metBbox.length){
        // Geen bekend vrij-gebied (bijv. oudere telling zonder bewaarde status): val terug op de
        // resterende ruimte ónder de laagst geplaatste bbox-ruimte, zoals voorheen.
        const laagsteOnder=Math.max(...geplaatst.map(g=>g.y+g.h));
        stripY=Math.min(laagsteOnder,PAD+innerH-60);stripH=Math.max(60,PAD+innerH-stripY);
      }
      const vlak=indelingVloerplanLayout(zonderBbox,stripW,stripH);
      zonderBbox.forEach((b,i)=>{
        const r=vlak[i];if(!r)return;
        const x=stripX+r.x,y=stripY+r.y,w=Math.max(1,r.w-3),h=Math.max(1,r.h-3);
        geplaatst.push({x,y,w,h,b});
      });
    }
    geplaatst.forEach(({x,y,w,h,b})=>{
      const buiten=indelingBuitenrand(x,y,w,h,W,H,PAD);
      indelingTekenKamerblok(ctx,x,y,w,h,b,buiten);
    });
    ctx.strokeStyle="#1f1f33";ctx.lineWidth=4;ctx.setLineDash([]);ctx.strokeRect(PAD/2,PAD/2,W-PAD,H-PAD);
    return canvas.toDataURL("image/png");
  }catch(e){return null;}
}
function indelingWrapCanvasText(ctx,text,cx,cy,maxWidth){
  const words=String(text||"").split(" ");const lines=[];let line="";
  words.forEach(w=>{const test=line?line+" "+w:w;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=w;}else line=test;});
  if(line)lines.push(line);
  const used=lines.slice(0,2);
  const lh=14;const startY=cy-(used.length-1)*lh/2;
  used.forEach((l,i)=>ctx.fillText(l,cx,startY+i*lh));
}
return { indelingSchemaDataUrl };
}

module.exports = { maakSchema };
