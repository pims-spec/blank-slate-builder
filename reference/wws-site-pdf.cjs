// Automatisch geëxtraheerd uit reference/wws-site.html — alleen voor de vergelijkingstests
// in src/lib/wws/pdf/. Letterlijke regels (niet bewerken), op één gemarkeerde regel na
// (const → let in pdfSamenvattingPagina, zie 'ENIGE AANPASSING'):
//   1017–1017  eur
//   1019–1023  PDF-stijl, pdfTxt
//   2260–2294  exporteerArchiefExcel
//   2603–2674  makeDashboardPdf
//   2708–2713  wozCapNoteText
//   2795–2802  facSummary
//   2896–2900  weergaveAdres
//   3147–3147  segName
//   3561–3752  pdfGaugeCard, pdfWozCapNote, pdfTellingBody, makePdf
//   3754–3792  makeRoutePdf
//   3797–3858  pdfCoverPage, pdfBanner, pdfPlattegrondBlok, CATEGORIE_VAN_KEY
//   3927–4247  pdfCategorieKaarten t/m pdfSamenvattingPagina, makeAdviesVolledigPdf
// De globals van de pagina (N, cur, adviesState, tellingen, window.jspdf, XLSX, saveFile, toast, …)
// komen binnen via maakPdfBron(ctx); calc() en de hulpfuncties uit wws-site-calc.cjs,
// berekenRouteVoorDoel/selectieResultaat uit wws-site-advies.cjs en berekenDashboard uit
// wws-site-dashboard.cjs (eerdere fases).
const { calc, normalizeInput, clone, num, r2, fmt, LABELS, INDEX_KLASSEN, typeOf } = require("./wws-site-calc.cjs");
const { maakAdvies } = require("./wws-site-advies.cjs");
const { maakDashboard } = require("./wws-site-dashboard.cjs");

function maakPdfBron(ctx) {
const { N, cur, adviesState, XLSX, saveFile, toast, klantNaam, eigenaarNaam, db, profile, tellingen, store, archiefQuery, archiefMatch, archiefMatchFilters, archiefFilters, dashboardKlantFilter } = ctx;
const window = { jspdf: ctx.jsPDF ? { jsPDF: ctx.jsPDF } : undefined };
const { berekenRouteVoorDoel, selectieResultaat } = maakAdvies(N, cur, adviesState);
const { berekenDashboard } = maakDashboard(tellingen, store, N);
// ---- regels 1017–1017 ----
const eur=x=>x.toLocaleString("nl-NL",{style:"currency",currency:"EUR"});
// ---- regels 1019–1023 ----
const PDF_W=210,PDF_M=16;
const PDF_PUR=[91,65,255],PDF_INK=[10,10,26],PDF_MUT=[92,92,122],PDF_SOFT=[237,240,255],PDF_ALT=[248,248,255],PDF_LINE=[230,230,242];
const PDF_WARN_BG=[255,241,232],PDF_WARN_INK=[154,66,18];
const PDF_SEGC={laag:[229,72,77],midden:[255,124,58],hoog:[48,164,108]};
const pdfTxt=s=>String(s??"").replace(/²/g,"2").replace(/–/g,"-");
// ---- regels 2260–2294 ----
async function exporteerArchiefExcel(){
  if(typeof XLSX==="undefined"){toast("De Excel-bibliotheek is niet geladen. Herlaad de pagina.");return;}
  const q=(archiefQuery||"").trim().toLowerCase();
  const lijst=tellingen.filter(t=>archiefMatch(t,q)&&archiefMatchFilters(t,archiefFilters));
  if(!lijst.length){toast("Niets om te exporteren met de huidige zoekopdracht/filters.");return;}
  const rows=lijst.map(t=>{
    let totaal=t.laatstePunten!=null?t.laatstePunten:null,seg="",maxHuur=null;
    try{const R=calc(t.input,N);totaal=R.totaal;seg=R.seg;maxHuur=R.maxHuur;}catch(e){}
    return {
      "Naam":(t.meta&&t.meta.naam)||"",
      "Adres":weergaveAdres(t.meta)||"",
      "Postcode":(t.meta&&t.meta.postcode)||"",
      "Huisnummer":(t.meta&&t.meta.huisnummer)||"",
      "Plaats":(t.meta&&t.meta.plaats)||"",
      "Collega":db?eigenaarNaam(t.ownerId):"",
      "Eigenaar":klantNaam(t.meta&&t.meta.klantId),
      "Woningtype":(t.input&&t.input.woningtype==="eengezins")?"Eengezinswoning":"Meergezinswoning",
      "Punten":totaal!=null?totaal:"",
      "Segment":seg?segName(seg):"",
      "Max. huur":maxHuur!=null?maxHuur:"",
      "Peildatum":(t.meta&&t.meta.peildatum)||"",
      "Aantal versies":t.aantalVersies!=null?t.aantalVersies:(t.versieCount||0),
      "Laatst bijgewerkt":t.updatedAt?new Date(t.updatedAt).toLocaleDateString("nl-NL"):"",
      "Laatst bewerkt door":(t.lastEditedBy&&t.lastEditedBy.naam)||"",
    };
  });
  const ws=XLSX.utils.json_to_sheet(rows);
  ws["!cols"]=[{wch:28},{wch:28},{wch:10},{wch:12},{wch:16},{wch:18},{wch:22},{wch:20},{wch:9},{wch:14},{wch:12},{wch:12},{wch:14},{wch:16},{wch:18}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Tellingen");
  const buf=XLSX.write(wb,{type:"array",bookType:"xlsx"});
  const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  await saveFile("Tellingen export "+new Date().toISOString().slice(0,10)+".xlsx",blob);
  toast("Export gestart ("+rows.length+" telling"+(rows.length===1?"":"en")+").");
}
// ---- regels 2603–2674 ----
async function makeDashboardPdf(){
  if(!window.jspdf){toast("De PDF-bibliotheek is niet geladen. Herlaad de pagina.");return;}
  const klantId=dashboardKlantFilter;
  const klantTxt=klantId?klantNaam(klantId):"Alle eigenaren";
  const S=await berekenDashboard(klantId);
  if(!S.totaal){toast("Niets om te exporteren: geen tellingen voor deze keuze.");return;}
  const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:"mm",format:"a4",compress:true});
  const W=PDF_W,M=PDF_M,INK=PDF_INK,MUT=PDF_MUT,SOFT=PDF_SOFT,ALT=PDF_ALT,LINE=PDF_LINE,SEGC=PDF_SEGC;
  const vandaag=new Date().toLocaleDateString("nl-NL",{dateStyle:"long"});
  let y=pdfBanner(doc,"GoHome dashboard","Portefeuille-rapportage","Eigenaar: "+klantTxt,vandaag);

  doc.autoTable({startY:y,head:[["Kengetal","Waarde"]],body:[
    ["Tellingen in de portefeuille",String(S.totaal)],
    ["Gemiddeld aantal punten",S.gemPunten!=null?fmt(S.gemPunten,1):"–"],
    ["Al in de vrije sector (vanaf "+(S.grensMidden+1)+" punten)",String(S.vrijeSector.length)],
    ["Net onder de grens (binnen "+S.marge+" punten van "+S.grensMidden+")",String(S.nabijGrens.length)],
    ["Al behaalde huurstijging per maand, door hertellingen"+(S.behaaldAantal?" bij "+S.behaaldAantal+" telling"+(S.behaaldAantal>1?"en":""):""),eur(S.behaaldTotaal)],
    ["Potentiële huurstijging per maand (tellingen net onder de grens)",eur(S.potentieelTotaal)],
  ],theme:"plain",styles:{fontSize:9.5,textColor:INK,cellPadding:1.6},columnStyles:{0:{cellWidth:120,textColor:MUT},1:{fontStyle:"bold",halign:"right"}},margin:{left:M,right:M}});
  y=doc.lastAutoTable.finalY+10;

  const segTotaal=S.segLaag.length+S.segMidden.length+S.segHoog.length;
  if(segTotaal){
    if(y>250){doc.addPage();y=20;}
    doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(...INK);doc.text("Verdeling naar segment",M,y);y+=6;
    doc.autoTable({startY:y,head:[["Segment","Aantal","Percentage"]],body:[
      ["Sociale huur (t/m "+S.grensLaag+" punten)",String(S.segLaag.length),Math.round(S.segLaag.length/segTotaal*100)+"%"],
      ["Middenhuur ("+(S.grensLaag+1)+"–"+S.grensMidden+" punten)",String(S.segMidden.length),Math.round(S.segMidden.length/segTotaal*100)+"%"],
      ["Vrije sector (vanaf "+(S.grensMidden+1)+" punten)",String(S.segHoog.length),Math.round(S.segHoog.length/segTotaal*100)+"%"],
    ],styles:{fontSize:9,textColor:INK,lineColor:LINE,lineWidth:0.1,cellPadding:2},headStyles:{fillColor:SOFT,textColor:INK,fontStyle:"bold"},alternateRowStyles:{fillColor:ALT},
      didParseCell:d=>{if(d.section==="body"){const kleur=d.row.index===0?SEGC.laag:d.row.index===1?SEGC.midden:SEGC.hoog;if(d.column.index===0)d.cell.styles.textColor=kleur;}},
      margin:{left:M,right:M}});
    y=doc.lastAutoTable.finalY+10;
  }

  const labelRijen=S.labelCounts.filter(l=>l.n>0);
  if(labelRijen.length){
    if(y>250){doc.addPage();y=20;}
    doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(...INK);doc.text("Verdeling naar energielabel",M,y);y+=6;
    doc.autoTable({startY:y,head:[["Label","Aantal"]],body:labelRijen.map(l=>["Label "+l.label,String(l.n)]),
      styles:{fontSize:9,textColor:INK,lineColor:LINE,lineWidth:0.1,cellPadding:2},headStyles:{fillColor:SOFT,textColor:INK,fontStyle:"bold"},alternateRowStyles:{fillColor:ALT},margin:{left:M,right:M}});
    y=doc.lastAutoTable.finalY+10;
  }

  if(S.nabijGrens.length){
    if(y>240){doc.addPage();y=20;}
    const top=S.nabijGrens.slice().sort((a,b)=>b.totaal-a.totaal).slice(0,5);
    doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(...INK);doc.text("Snelste winst: bijna in de vrije sector",M,y);y+=6;
    doc.autoTable({startY:y,head:[["Telling","Punten","Nog nodig","Potentiële winst/mnd"]],body:top.map(r=>[
      (r.t.meta&&r.t.meta.naam)||weergaveAdres(r.t.meta)||"Naamloze telling",String(r.totaal),String(r.nodig),r.winst!=null?eur(r.winst):"–",
    ]),styles:{fontSize:9,textColor:INK,lineColor:LINE,lineWidth:0.1,cellPadding:2},headStyles:{fillColor:SOFT,textColor:INK,fontStyle:"bold"},alternateRowStyles:{fillColor:ALT},margin:{left:M,right:M}});
    y=doc.lastAutoTable.finalY+10;
  }

  if(!klantId&&db&&profile&&profile.role==="admin"&&S.perCollega.length>1){
    if(y>240){doc.addPage();y=20;}
    doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(...INK);doc.text("Werkverdeling per collega",M,y);y+=6;
    doc.autoTable({startY:y,head:[["Collega","Tellingen","Gem. punten"]],body:S.perCollega.map(c=>[eigenaarNaam(c.ownerId),String(c.aantal),c.gemPunten!=null?fmt(c.gemPunten,1):"–"]),
      styles:{fontSize:9,textColor:INK,lineColor:LINE,lineWidth:0.1,cellPadding:2},headStyles:{fillColor:SOFT,textColor:INK,fontStyle:"bold"},alternateRowStyles:{fillColor:ALT},margin:{left:M,right:M}});
    y=doc.lastAutoTable.finalY+10;
  }

  if(y>265){doc.addPage();y=20;}
  doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(...MUT);
  doc.text(doc.splitTextToSize("Cijfers live berekend op basis van de huidige normen ("+N.naam+"); aan dit overzicht kunnen geen rechten worden ontleend.",W-2*M),M,y);
  const pages=doc.getNumberOfPages();
  for(let i=1;i<=pages;i++){doc.setPage(i);doc.setDrawColor(...LINE);doc.setLineWidth(0.3);doc.line(M,282,W-M,282);doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(...INK);doc.text("GoHome",M,287);doc.setFont("helvetica","normal");doc.setTextColor(...MUT);doc.text("gohome.io",M+13,287);doc.text("Pagina "+i+" van "+pages,W-M,287,{align:"right"});}
  const basis=(klantId?klantTxt:"Alle_eigenaren").replace(/[^\w\-]+/g,"_").slice(0,60);
  const blob=doc.output("blob");
  try{await saveFile("Dashboard_"+basis+"_"+new Date().toISOString().slice(0,10)+".pdf",blob);toast("PDF opgeslagen");}
  catch(e){if(e&&e.code==="declined")return;if(e&&e.code==="rate_limited"){toast("Er staat al een download klaar. Probeer het zo opnieuw.");return;}toast("Downloaden lukte niet.");}
}
// ---- regels 2708–2713 ----
function wozCapNoteText(R,N){
  if(!R||!R.wozCapActief)return "";
  return R.wozCapFloor
    ? "Let op: de "+N.wozCapPct+"% WOZ-cap is actief. Zonder de cap had deze woning 187 punten of meer; door de cap zakt hij daaronder en geldt een waardering van "+N.grensMidden+" punten."
    : "Let op: de "+N.wozCapPct+"% WOZ-cap is actief. De WOZ-waarde draagt niet voor de volle waarde bij, omdat dit meer dan "+N.wozCapPct+"% van het totaal aantal punten zou zijn.";
}
// ---- regels 2795–2802 ----
function facSummary(kind,f){
  if(kind==="keuken"){const n=Object.values(f.keuken.voorz||{}).reduce((s,x)=>s+(num(x)>0?1:0),0);return "Keuken: aanrecht "+({"<1":"< 1 m","1-2":"1–2 m",">=2":"> 2 m"}[f.keuken.lengte])+(n?", "+n+" voorziening"+(n>1?"en":""):"");}
  if(kind==="badkamer"||kind==="slaap_san"){const b=f.san;const p=[];if(num(b.toiletStaand))p.push(num(b.toiletStaand)+"× staand toilet");if(num(b.toiletHang))p.push(num(b.toiletHang)+"× hangend toilet");if(num(b.wastafel))p.push(num(b.wastafel)+"× wastafel");if(num(b.meerpers))p.push(num(b.meerpers)+"× meerpersoonswastafel");if(num(b.douche))p.push(num(b.douche)+"× douche");if(num(b.bad))p.push(num(b.bad)+"× bad");if(num(b.badDouche))p.push(num(b.badDouche)+"× bad met douche");const n=b.voorz?Object.values(b.voorz).reduce((s,x)=>s+(num(x)>0?1:0),0):0;if(n)p.push(n+" extra");return "Sanitair: "+(p.join(", ")||"nog niets ingevuld");}
  if(kind==="toilet"){const t=f.toilet;return "Toilet: "+({geen:"geen toilet",staand:"staand toilet",hangend:"hangend toilet"}[t.toilet])+(t.fontein?", fontein":"");}
  if(kind==="was")return "Wastafel: "+(f.was.wastafel?"ja":"nee");
  return "";
}
function cnt(label,path,max){const v=getPath(cur,path);return '<label class="f"><span class="lbl" title="'+esc(label)+'">'+esc(label)+'</span><select data-path="'+path+'">'+Array.from({length:(max||4)+1},(_,n)=>'<option value="'+n+'"'+(num(v)===n?" selected":"")+'>'+n+'</option>').join("")+'</select></label>';}
// ---- regels 2896–2900 ----
function weergaveAdres(meta){
  meta=meta||{};
  const straatHn=[meta.adres,meta.huisnummer].filter(Boolean).join(" ").trim();
  return [straatHn,meta.plaats].filter(Boolean).join(", ");
}
// ---- regels 3147–3147 ----
function segName(s){return s==="laag"?"Sociale huur":s==="midden"?"Middenhuur":"Vrije sector";}
// ---- regels 3561–3752 ----
function pdfGaugeCard(doc,y,R,normen){
  const W=PDF_W,M=PDF_M,PUR=PDF_PUR,INK=PDF_INK,MUT=PDF_MUT,SOFT=PDF_SOFT,SEGC=PDF_SEGC;
  const cardH=30;doc.setFillColor(...SOFT);doc.roundedRect(M,y,W-2*M,cardH,5,5,"F");
  doc.setFont("helvetica","bold");doc.setFontSize(7.5);doc.setTextColor(...PUR);doc.text("TOTAAL",M+7,y+8);
  doc.setFontSize(30);doc.setTextColor(...INK);doc.text(String(R.totaal),M+7,y+22);const tw=doc.getTextWidth(String(R.totaal));
  doc.setFont("helvetica","normal");doc.setFontSize(10);doc.setTextColor(...MUT);doc.text("punten",M+9+tw,y+22);
  doc.setFontSize(8);doc.text("exact "+fmt(R.exact),M+7,y+27);
  const sc=SEGC[R.seg],sn=segName(R.seg);doc.setFont("helvetica","bold");doc.setFontSize(9);
  const pw=doc.getTextWidth(sn)+10,px=M+68;doc.setFillColor(...sc);doc.roundedRect(px,y+7,pw,7,3.5,3.5,"F");doc.setTextColor(255);doc.text(sn,px+5,y+11.9);
  doc.setTextColor(...MUT);doc.setFont("helvetica","normal");doc.setFontSize(8);
  doc.text(R.seg==="hoog"?"Huurprijs volgens WWS (vrije sector)":"Maximale kale huur (huurprijstabel 1-1-2026)",px,y+20);
  doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(...INK);if(R.maxHuur!=null)doc.text(eur(R.maxHuur)+" per maand",px,y+26);
  if(R.maxHuurOpslag!=null){doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(...MUT);doc.text("Met opslag "+R.opslagPct+"%: "+eur(R.maxHuurOpslag),px+48,y+26);}
  const bx=W-M-58,bw=50,by=y+13,scale=Math.max(250,R.totaal+20);
  const w1=bw*normen.grensLaag/scale,w2=bw*(normen.grensMidden-normen.grensLaag)/scale;
  doc.setFillColor(...SEGC.laag);doc.rect(bx,by,w1,3,"F");doc.setFillColor(...SEGC.midden);doc.rect(bx+w1,by,w2,3,"F");doc.setFillColor(...SEGC.hoog);doc.rect(bx+w1+w2,by,bw-w1-w2,3,"F");
  const mx=bx+bw*Math.min(1,R.totaal/scale);doc.setDrawColor(...INK);doc.setLineWidth(0.6);doc.line(mx,by-3,mx,by+6);
  doc.setFont("helvetica","normal");doc.setFontSize(6.5);doc.setTextColor(...MUT);doc.text("t/m "+normen.grensLaag,bx+w1-0.8,by+9,{align:"right"});doc.text("t/m "+normen.grensMidden,bx+w1+w2+0.8,by+9);
  const bubTxt=String(R.totaal),bubW=doc.getTextWidth(bubTxt)*0.6+8;
  doc.setFillColor(255,255,255);doc.setDrawColor(...PUR);doc.setLineWidth(0.3);
  const bubX=Math.min(Math.max(mx-bubW/2,bx-2),bx+bw-bubW+2),bubY=by-11;
  doc.roundedRect(bubX,bubY,bubW,6.5,2,2,"FD");
  doc.setFont("helvetica","bold");doc.setFontSize(8.5);doc.setTextColor(...INK);doc.text(bubTxt,bubX+bubW/2,bubY+4.6,{align:"center"});
  return y+cardH+8;
}
// Kleine, opvallende waarschuwing in de PDF zodra de WOZ-cap voor deze telling actief is —
// zelfde boodschap als wozCapNoteText() op het scherm, zodat dit niet verstopt raakt onderin
// de algemene disclaimer.
function pdfWozCapNote(doc,y,R,normen){
  const t=wozCapNoteText(R,normen);if(!t)return y;
  const W=PDF_W,M=PDF_M;
  const lines=doc.splitTextToSize(pdfTxt(t),W-2*M-12);
  const h=6+lines.length*4.4;
  if(y+h>270){doc.addPage();y=20;}
  doc.setFillColor(...PDF_WARN_BG);doc.roundedRect(M,y,W-2*M,h,4,4,"F");
  doc.setFont("helvetica","bold");doc.setFontSize(8.5);doc.setTextColor(...PDF_WARN_INK);
  let ly=y+5.5;lines.forEach(l=>{doc.text(l,M+6,ly);ly+=4.4;});
  return y+h+6;
}
function pdfTellingBody(doc,y,meta,input,normen,opts){
  opts=opts||{};
  const W=PDF_W,M=PDF_M,PUR=PDF_PUR,INK=PDF_INK,MUT=PDF_MUT,SOFT=PDF_SOFT,ALT=PDF_ALT,LINE=PDF_LINE,SEGC=PDF_SEGC;
  const p=x=>fmt(x);const txt=pdfTxt;
  const R=calc(input,normen);
  const byNr=n=>R.rows.filter(r=>r.nr===n).reduce((s,r)=>s+r.p,0);
  // Samenvattingskaart
  if(!opts.skipGauge)y=pdfGaugeCard(doc,y,R,normen);
  const h3=t=>{if(y>260){doc.addPage();y=20;}doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(...PUR);doc.text(t.toUpperCase(),M,y);y+=4;};
  // Woning
  h3("Woning");
  const adres=[meta.adres,[meta.postcode,meta.huisnummer].filter(Boolean).join(" "),meta.plaats].filter(Boolean).join(", ");
  doc.autoTable({startY:y,body:[["Adres",txt(adres||"-")],["Bouwjaar",meta.bouwjaar||"-"],["Type",input.woningtype==="eengezins"?"Eengezinswoning":"Meergezinswoning"],["Peildatum",meta.peildatum?new Date(meta.peildatum).toLocaleDateString("nl-NL"):"-"],["Opgesteld door",meta.opsteller||"-"]],theme:"plain",styles:{fontSize:9.5,textColor:INK,cellPadding:1.4},columnStyles:{0:{fontStyle:"bold",cellWidth:40,textColor:MUT}},margin:{left:M,right:M}});
  y=doc.lastAutoTable.finalY+7;
  // Punten per onderdeel (compact overzicht)
  const onderdelen=[["Woning","energieprestatie en WOZ-waarde",byNr(4)+byNr(11)],["Binnenruimtes","ruimten, verwarming, keuken en sanitair",byNr(1)+byNr(2)+byNr(3)+byNr(5)+byNr(6)+byNr(9)],["Buitenruimtes","buitenruimten en parkeren",byNr(8)+byNr(10)],["Bijzonderheden","handicap, bijzondere voorzieningen, monument",byNr(7)+byNr(12)+byNr(13)]];
  h3("Punten per onderdeel");
  doc.autoTable({startY:y,head:[["Onderdeel","Omvat","Punten"]],body:onderdelen.map(o=>[o[0],o[1],p(o[2])]),foot:[["Totaal (afgerond)","Exact "+fmt(R.exact),String(R.totaal)]],showFoot:"lastPage",
    styles:{fontSize:9,textColor:INK,lineColor:LINE,lineWidth:0.1,cellPadding:2.2},headStyles:{fillColor:PUR,textColor:255,fontStyle:"bold"},footStyles:{fillColor:SOFT,textColor:PUR,fontStyle:"bold"},alternateRowStyles:{fillColor:ALT},
    columnStyles:{0:{fontStyle:"bold",cellWidth:38},1:{textColor:MUT},2:{halign:"right",cellWidth:22,fontStyle:"bold"}},margin:{top:18,left:M,right:M,bottom:22}});
  y=doc.lastAutoTable.finalY+8;
  // Details per onderdeel, indeling zoals de Huurprijscheck: categorie › ruimte › voorzieningen, met m2 en punten
  h3("Details van de puntentelling");
  const tabel=(titel,metM2,rijen,totaalLabel,totaal)=>{
    const body=[],types=[];
    rijen.forEach(r=>{body.push(metM2?[r[0],r[1]||"",r[2]||""]:[r[0],r[2]||""]);types.push(r[3]||"item");});
    body.push(metM2?[totaalLabel,"",p(totaal)]:[totaalLabel,p(totaal)]);types.push("tot");
    if(y>248){doc.addPage();y=20;}
    doc.autoTable({startY:y,head:[metM2?[titel,"m2","Punten"]:[titel,"Punten"]],body,
      styles:{fontSize:9,textColor:INK,lineColor:LINE,lineWidth:0.1,cellPadding:{top:2,bottom:2,left:3,right:3}},
      headStyles:{fillColor:PUR,textColor:255,fontStyle:"bold"},
      columnStyles:metM2?{1:{cellWidth:22,halign:"right"},2:{cellWidth:22,halign:"right"}}:{1:{cellWidth:22,halign:"right"}},
      margin:{top:18,left:M,right:M,bottom:22},
      didParseCell:d=>{if(d.section!=="body")return;const t=types[d.row.index];
        if(t==="sub"){d.cell.styles.fillColor=SOFT;d.cell.styles.fontStyle="bold";}
        if(t==="item"){d.cell.styles.fillColor=[255,255,255];if(d.column.index===0)d.cell.styles.cellPadding={top:1.8,bottom:1.8,left:8,right:3};d.cell.styles.textColor=[40,40,60];}
        if(t==="voorz"){d.cell.styles.fillColor=[255,255,255];d.cell.styles.fontSize=8;d.cell.styles.textColor=MUT;if(d.column.index===0)d.cell.styles.cellPadding={top:1.2,bottom:1.2,left:13,right:3};else d.cell.styles.cellPadding={top:1.2,bottom:1.2,left:3,right:3};}
        if(t==="tot"){d.cell.styles.fillColor=SOFT;d.cell.styles.textColor=PUR;d.cell.styles.fontStyle="bold";}}});
    y=doc.lastAutoTable.finalY+6;
  };
  const m2s=x=>num(x)?fmt(r2(num(x))):"";
  const rn=(key,r)=>{const l=typeOf(key,r.type).l;return txt(l+(r.naam&&r.naam.toLowerCase()!==l.toLowerCase()?" ("+r.naam+")":""));};
  const mt=r=>(r.maten||[]).filter(m=>num(m.l)!==0&&num(m.b)!==0).map((m,k)=>{const neg=num(m.l)*num(m.b)<0;return (k?(neg?" - ":" + "):(neg?"-":""))+fmt(Math.abs(num(m.l)))+" x "+fmt(Math.abs(num(m.b)));}).join("");
  // Woning
  const e4=R.rows.find(r=>r.nr===4),w11=R.rows.find(r=>r.nr===11);
  tabel("Woning",false,[["Energieprestatie","",p(e4.p),"sub"],[txt(e4.t),"","","item"],["WOZ-waarde","",p(w11.p),"sub"],[txt(w11.t),"","","item"]],"Totaal Woning",byNr(4)+byNr(11));
  y=pdfWozCapNote(doc,y,R,normen);
  // Binnenruimtes
  const bin=[];
  bin.push(["Vertrekken",String(R.oppV),p(byNr(1)),"sub"]);
  input.vertrekken.forEach(r=>{const m=mt(r);bin.push([rn("vertrekken",r)+(m?"  ("+m+")":""),m2s(r.m2),"","item"]);});
  const ovT=input.overig.filter(r=>!typeOf("overig",r.type).verkeer);
  bin.push(["Overige ruimten",String(R.oppO),p(byNr(2)),"sub"]);
  ovT.forEach(r=>{const m=mt(r);bin.push([rn("overig",r)+(m?"  ("+m+")":"")+(num(r.m2)>0&&num(r.m2)<normen.minOverig?", kleiner dan 2 m2":""),m2s(r.m2),"","item"]);});
  const vk=input.overig.filter(r=>typeOf("overig",r.type).verkeer);
  if(vk.length){bin.push(["Verkeersruimten (geen oppervlaktepunten)","","","sub"]);vk.forEach(r=>bin.push([rn("overig",r),m2s(r.m2),"","item"]));}
  bin.push(["Verwarming en verkoeling","",p(byNr(3)),"sub"]);
  input.vertrekken.filter(r=>r.verwarmd).forEach(r=>{const n=typeOf("vertrekken",r.type).verwVertrekken||1;bin.push([rn("vertrekken",r)+": verwarmd"+(n>1?" (incl. open keuken)":"")+(r.verkoeld?" en verkoeld":""),"",p(n*normen.verwVertrek),"item"]);});
  const ovw=input.overig.filter(r=>r.verwarmd);ovw.forEach((r,k)=>bin.push([rn("overig",r)+": verwarmd"+(k>=normen.verwOverigMax?" (boven maximum)":""),"",k<normen.verwOverigMax?p(normen.verwOverig):"0","item"]));
  const kl=input.vertrekken.filter(r=>r.verwarmd&&r.verkoeld);kl.forEach((r,k)=>bin.push(["Verkoeling "+rn("vertrekken",r).toLowerCase()+(k>=normen.verkoelMax?" (boven maximum)":""),"",k<normen.verkoelMax?p(normen.verkoelVertrek):"0","item"]));
  bin.push(["Keuken","",p(byNr(5)),"sub"]);
  input.vertrekken.filter(r=>r.fac&&r.fac.kind==="keuken").forEach(r=>{const k=r.fac.keuken;const kb=k.lengte===">=2"?normen.keukenLang:k.lengte==="1-2"?normen.keukenKort:0;
    bin.push([rn("vertrekken",r)+": aanrecht "+({"<1":"korter dan 1 m","1-2":"1 tot 2 m",">=2":"langer dan 2 m"}[k.lengte]),"",p(kb),"item"]);
    let som=0;(normen.voorzKeuken||[]).forEach(it=>{const c=num(k.voorz[it.k]);if(c){som+=c*it.p;bin.push([it.l+(c>1?" (x"+c+")":""),"",p(c*it.p),"voorz"]);}});
    if(kb&&som>kb)bin.push(["Extra voorzieningen afgetopt op "+p(kb)+" punten","","-"+p(som-kb),"voorz"]);});
  bin.push(["Sanitair","",p(byNr(6)),"sub"]);
  const NS=normen.san;
  ["vertrekken","overig"].forEach(key=>input[key].forEach(r=>{const f=r.fac;if(!f||f.kind==="keuken")return;
    let pts=0,dbR=0;
    if(f.kind==="badkamer"){const b=f.san;dbR=num(b.douche)*NS.douche+num(b.bad)*NS.bad+num(b.badDouche)*NS.badDouche;pts=num(b.toiletStaand)*NS.toiletStaandBad+num(b.toiletHang)*NS.toiletHangBad+num(b.wastafel)*NS.wastafelBad+num(b.meerpers)*NS.meerpersBad+dbR;}
    if(f.kind==="slaap_san"){const b=f.san;pts=Math.min(1,num(b.wastafel))*NS.wastafelElders+Math.min(1,num(b.meerpers))*NS.meerpersElders+num(b.douche)*NS.douche+num(b.bad)*NS.bad+num(b.badDouche)*NS.badDouche;}
    if(f.kind==="toilet"){pts=(f.toilet.toilet==="staand"?NS.toiletStaandApart:f.toilet.toilet==="hangend"?NS.toiletHangApart:0)+(f.toilet.fontein?NS.wastafelElders:0);}
    if(f.kind==="was"){pts=f.was.wastafel?NS.wastafelElders:0;}
    bin.push([rn(key,r)+": "+txt(facSummary(f.kind,f).replace(/^[A-Za-z]+: /,"")),"",p(pts),"item"]);
    // Extra sanitaire voorzieningen gelden per bad-/doucheruimte en worden ook per ruimte afgetopt op de punten van de douche/het bad in diezelfde ruimte (beleidsboek 2.6.2)
    if(f.kind==="badkamer"&&f.san.eisenOk){
      let exR=0;(normen.voorzSan||[]).forEach(it=>{let c=num(f.san.voorz[it.k]);if(it.k==="kastruimte")c=Math.min(c,1);if(!c)return;exR+=c*it.p;bin.push([it.l+(c>1?" (x"+c+")":""),"",p(c*it.p),"voorz"]);});
      if(exR>dbR)bin.push(["Extra voorzieningen in deze ruimte afgetopt op "+p(dbR)+" punten","","-"+p(exR-dbR),"voorz"]);
    }}));
  if(byNr(9)){const g=R.rows.find(r=>r.nr===9);bin.push(["Gemeenschappelijke ruimten","",p(byNr(9)),"sub"]);bin.push([txt(g.t),"","","item"]);}
  tabel("Binnenruimtes",true,bin,"Totaal Binnenruimtes",onderdelen[1][2]);
  // Buitenruimtes
  const b8=R.rows.find(r=>r.nr===8),b10=R.rows.find(r=>r.nr===10);
  const bu=[["Buitenruimten","",p(b8.p),"sub"],[txt(b8.t),"","","item"]];
  if(b10.p)bu.push(["Gemeenschappelijke parkeerruimten","",p(b10.p),"sub"],[txt(b10.t),"","","item"]);
  tabel("Buitenruimtes",false,bu,"Totaal Buitenruimtes",onderdelen[2][2]);
  // Bijzonderheden
  const bz=[];R.rows.filter(r=>[7,12,13].includes(r.nr)&&r.p!==0).forEach(r=>bz.push([txt(r.naam)+(r.t&&r.t!=="geen"?": "+txt(r.t):""),"",p(r.p),"item"]));
  if(bz.length)tabel("Bijzonderheden",false,bz,"Totaal Bijzonderheden",onderdelen[3][2]);
  // Huurprijs
  if(R.maxHuur!=null){
    const hr=[[R.seg==="hoog"?"Huurprijs volgens WWS":"Maximale kale huurprijs",eur(R.maxHuur)]];
    R.opslagen.forEach(o=>hr.push([o[1]+"% "+o[0].toLowerCase(),eur(r2(R.maxHuur*o[1]/100))]));
    if(R.maxHuurOpslag!=null)hr.push(["Inclusief opslagen",eur(R.maxHuurOpslag)]);
    h3("Huurprijs");
    doc.autoTable({startY:y,body:hr,styles:{fontSize:9,textColor:INK,lineColor:LINE,lineWidth:0.1,cellPadding:2.2},alternateRowStyles:{fillColor:ALT},columnStyles:{1:{halign:"right",cellWidth:40}},margin:{top:18,left:M,right:M,bottom:22},didParseCell:d=>{if(d.row.index===hr.length-1&&hr.length>1)d.cell.styles.fontStyle="bold";}});
    y=doc.lastAutoTable.finalY+7;
  }
  return {y,R};
}
async function makePdf(meta,input,normen,versie,alleenBlob,opts){
  if(!window.jspdf){toast("De PDF-bibliotheek is niet geladen. Herlaad de pagina.");return;}
  opts=opts||{};
  input=normalizeInput(clone(input));
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:"mm",format:"a4",compress:true});
  const W=PDF_W,M=PDF_M,PUR=PDF_PUR,INK=PDF_INK,MUT=PDF_MUT,SOFT=PDF_SOFT,ALT=PDF_ALT,LINE=PDF_LINE;
  const txt=pdfTxt;
  pdfCoverPage(doc,meta,"Rapportage puntentelling");doc.addPage();
  // Kop (GoHome-huisstijl) — gedeeld met de overige PDF-generators, zodat de voorpagina overal identiek is
  const dateText=versie?"Versie "+versie.nr+"  |  "+new Date(versie.createdAt).toLocaleString("nl-NL",{dateStyle:"long",timeStyle:"short"}):(opts.labelOverride?opts.labelOverride+"  |  "+new Date().toLocaleDateString("nl-NL",{dateStyle:"long"}):"Werkversie, niet vastgelegd  |  "+new Date().toLocaleDateString("nl-NL",{dateStyle:"long"}));
  let y=pdfBanner(doc,opts.badgeTitel||"WWS-puntentelling",meta.naam||weergaveAdres(meta)||"Puntentelling","Puntentelling volgens het Woningwaarderingsstelsel, zelfstandige woonruimte",dateText);
  if(versie&&versie.notitie){doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(...MUT);doc.text(doc.splitTextToSize(txt(versie.notitie),W-2*M),M,y);y+=6;}
  y=pdfPlattegrondBlok(doc,y,input);
  const body=pdfTellingBody(doc,y,meta,input,normen);
  y=body.y;const R=body.R;
  // Advies: route naar de vrije sector (optioneel, voor een gecombineerde PDF)
  if(opts.routeInfo){
    const RI=opts.routeInfo;
    if(y>240){doc.addPage();y=20;}
    doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(...PUR);doc.text("ADVIES: ROUTE NAAR DE VRIJE SECTOR",M,y);y+=4;
    const cardH2=26;if(y+cardH2>270){doc.addPage();y=20;}
    doc.setFillColor(...SOFT);doc.roundedRect(M,y,W-2*M,cardH2,5,5,"F");
    const kc2=[["NU",String(RI.start.totaal)],["DOEL",String(RI.doel)],["MET GEKOZEN ROUTE",String(R.totaal)],["KOSTEN (INDICATIE)",eur(RI.kosten)]];
    kc2.forEach((k,n)=>{const x=M+7+n*44.5;doc.setFont("helvetica","bold");doc.setFontSize(7);doc.setTextColor(...PUR);doc.text(k[0],x,y+8);doc.setFontSize(n===3?13:20);doc.setTextColor(...INK);doc.text(k[1],x,y+19);});
    y+=cardH2+8;
    doc.setFont("helvetica","normal");doc.setFontSize(9.5);doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize((RI.okVrij?"Met de gekozen maatregelen komt de woning op "+R.totaal+" punten en valt hij in de vrije sector"+(R.totaal>=RI.doel?".":", maar onder het gekozen doel van "+RI.doel+" punten."):"Met de gekozen maatregelen komt de woning op "+R.totaal+" punten. Dat is nog niet genoeg voor de vrije sector (minimaal "+(N.grensMidden+1)+" punten).")+(RI.forcedCount?" "+(RI.forcedCount===1?"Eén maatregel is":RI.forcedCount+" maatregelen zijn")+" zelf gekozen en altijd meegenomen.":""),W-2*M),M,y);
    y+=12;
    if(y>248){doc.addPage();y=20;}
    doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(...PUR);doc.text("GEKOZEN MAATREGELEN",M,y);y+=4;
    doc.autoTable({startY:y,head:[["#","Maatregel","Haalbaarheid","Punten","Kosten","Totaal na"]],body:RI.rows.length?RI.rows:[["","Geen maatregelen aangevinkt","","","",""]],foot:[["","Totaal","","+"+fmt(r2(R.exact-RI.start.exact)),eur(RI.kosten),String(R.totaal)]],showFoot:"lastPage",
      styles:{fontSize:9,textColor:INK,lineColor:LINE,lineWidth:0.1,cellPadding:2.2},headStyles:{fillColor:PUR,textColor:255,fontStyle:"bold"},footStyles:{fillColor:SOFT,textColor:PUR,fontStyle:"bold"},alternateRowStyles:{fillColor:ALT},
      columnStyles:{0:{cellWidth:8,textColor:MUT},2:{cellWidth:24},3:{halign:"right",cellWidth:16},4:{halign:"right",cellWidth:26},5:{halign:"right",cellWidth:18}},margin:{top:18,left:M,right:M,bottom:22},
      didParseCell:d=>{if(d.section==="body"&&d.column.index===2){const v=d.cell.raw;d.cell.styles.textColor=v==="Eenvoudig"?[48,164,108]:v==="Lastig"?[229,72,77]:[224,110,40];d.cell.styles.fontStyle="bold";}}});
    y=doc.lastAutoTable.finalY+8;
    if(RI.nietGekozen.length){if(y>250){doc.addPage();y=20;}doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(...PUR);doc.text("VOORGESTELD MAAR NIET GEKOZEN",M,y);y+=4;
      doc.autoTable({startY:y,head:[["Maatregel","Kosten"]],body:RI.nietGekozen,styles:{fontSize:9,textColor:INK,lineColor:LINE,lineWidth:0.1,cellPadding:2.2},headStyles:{fillColor:PUR,textColor:255,fontStyle:"bold"},alternateRowStyles:{fillColor:ALT},columnStyles:{1:{halign:"right",cellWidth:28}},margin:{top:18,left:M,right:M,bottom:22}});
      y=doc.lastAutoTable.finalY+8;}
  }
  if(y>258){doc.addPage();y=20;}
  doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(...MUT);
  const disc="Gebruikte normen: "+normen.naam+". Berekend volgens het beleidsboek van de Huurcommissie; aan deze telling kunnen geen rechten worden ontleend."+(R.warn.length?" Opmerkingen: "+R.warn.map(txt).join(" "):"")+(opts.routeInfo?" De kosten van de maatregelen zijn indicatieve ramingen, geen offertes. Bij een zittende huurder verandert het huurcontract niet vanzelf mee. Een renovatie kan ook de WOZ-waarde verhogen; dat is niet meegerekend.":"");
  doc.text(doc.splitTextToSize(disc,W-2*M),M,y);
  const pages=doc.getNumberOfPages();
  for(let i=2;i<=pages;i++){doc.setPage(i);doc.setDrawColor(...LINE);doc.setLineWidth(0.3);doc.line(M,282,W-M,282);doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(...INK);doc.text("GoHome",M,287);doc.setFont("helvetica","normal");doc.setTextColor(...MUT);doc.text("gohome.io",M+13,287);doc.text("Pagina "+i+" van "+pages,W-M,287,{align:"right"});}
  const base=(meta.naam||weergaveAdres(meta)||"puntentelling").replace(/[^\w\-]+/g,"_").slice(0,60);
  const fname="WWS_"+base+(opts.filenameSuffix!=null?opts.filenameSuffix:(versie?"_v"+versie.nr:"_werkversie"))+".pdf";
  const blob=doc.output("blob");
  if(alleenBlob)return blob;
  try{await saveFile(fname,blob);toast("PDF opgeslagen");}
  catch(e){if(e&&e.code==="declined")return;if(e&&e.code==="rate_limited"){toast("Er staat al een download klaar. Probeer het zo opnieuw.");return;}toast("Downloaden lukte niet.");}
}
// ---- regels 3754–3792 ----
async function makeRoutePdf(){
  if(!window.jspdf){toast("De PDF-bibliotheek is niet geladen. Herlaad de pagina.");return;}
  const A=adviesState.result;if(!A)return;const S=selectieResultaat();const meta=cur.meta;
  const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:"mm",format:"a4",compress:true});
  const W=PDF_W,M=PDF_M,MUT=PDF_MUT;
  const naam=meta.naam||weergaveAdres(meta)||"Puntentelling";
  const vandaag=new Date().toLocaleDateString("nl-NL",{dateStyle:"long"});
  pdfCoverPage(doc,meta);doc.addPage();

  // Sectie 1: huidige situatie — zelfde voorpagina-opmaak als de losse puntentelling-PDF
  let y=pdfBanner(doc,"WWS-rapport","Huidige situatie","Puntentelling volgens het Woningwaarderingsstelsel, zelfstandige woonruimte",vandaag);
  y=pdfPlattegrondBlok(doc,y,cur.input);
  const body1=pdfTellingBody(doc,y,meta,cur.input,N);
  const R1=body1.R;

  // Sectie 2: de route zoals die nu in het advies-dialoog is samengesteld (aangevinkte maatregelen)
  const chosen=A.stappen.filter((g,k)=>!adviesState.skip[k]);
  const route={start:A.start,eind:S.R,stappen:chosen,doel:A.doel,gehaald:S.R.totaal>=A.doel,kosten:S.kosten,input:S.input,vanLabel:cur.input.energie.label};
  ({y}=await pdfOptiePagina(doc,1,"Advies: route naar de vrije sector","De gekozen maatregelen om de woning in de vrije sector te krijgen",route,"Advies"));

  // Sectie 3: nieuwe situatie, na de gekozen maatregelen
  doc.addPage();
  y=pdfBanner(doc,"WWS-rapport","Nieuwe situatie (na advies)","Puntentelling volgens het Woningwaarderingsstelsel, zelfstandige woonruimte",vandaag);
  const body2=pdfTellingBody(doc,y,meta,S.input,N);
  const R2=body2.R;
  y=body2.y;

  if(y>258){doc.addPage();y=20;}
  doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(...MUT);
  const disc="Gebruikte normen: "+N.naam+". Berekend volgens het beleidsboek van de Huurcommissie; aan deze telling kunnen geen rechten worden ontleend. De kosten en besparingen van de maatregelen zijn indicatieve ramingen, geen offertes. Bij een zittende huurder verandert het huurcontract niet vanzelf mee. Een renovatie kan ook de WOZ-waarde verhogen; dat is niet meegerekend."+((R1.warn.length||R2.warn.length)?" Opmerkingen: "+R1.warn.concat(R2.warn).map(pdfTxt).join(" "):"");
  doc.text(doc.splitTextToSize(disc,W-2*M),M,y);
  const pages=doc.getNumberOfPages();
  const INK=PDF_INK,LINE=PDF_LINE;
  for(let i=2;i<=pages;i++){doc.setPage(i);doc.setDrawColor(...LINE);doc.setLineWidth(0.3);doc.line(M,282,W-M,282);doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(...INK);doc.text("GoHome",M,287);doc.setFont("helvetica","normal");doc.setTextColor(...MUT);doc.text("gohome.io",M+13,287);doc.text("Pagina "+i+" van "+pages,W-M,287,{align:"right"});}
  const base=(meta.naam||weergaveAdres(meta)||"woning").replace(/[^\w\-]+/g,"_").slice(0,60);
  const blob=doc.output("blob");
  try{await saveFile("Route_vrije_sector_"+base+".pdf",blob);toast("PDF opgeslagen");}
  catch(e){if(e&&e.code==="declined")return;if(e&&e.code==="rate_limited"){toast("Er staat al een download klaar. Probeer het zo opnieuw.");return;}toast("Downloaden lukte niet.");}
}
// ---- regels 3797–3858 ----
function pdfCoverPage(doc,meta,titel){
  const W=PDF_W,H=297,INK=PDF_INK,SOFT=PDF_SOFT,LINE=PDF_LINE;
  const COVER_PUR=[127,125,255];
  const CX=78; // x voor subtitel en adrestabel (de grote GoHome-wordmark begint links daarvan, deels over de paarse vorm)
  doc.setFillColor(...SOFT);doc.rect(0,0,W,H,"F");
  // Zeshoekige paarse vorm: punt linksboven, schuin naar een brede verticale balk, punt linksonder
  doc.setFillColor(...COVER_PUR);doc.lines([[66.4,52.9],[0,193.6],[-66.4,50.5]],0,0,[1,1],"F",true);
  doc.setFont("helvetica","bold");doc.setFontSize(108);doc.setTextColor(...INK);doc.text("GoHome",26,129);
  doc.setFont("helvetica","normal");doc.setFontSize(14);doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(titel||"Rapportage puntentelling & verbeteradvies",W-CX-16),CX,178);
  const mHn=/^(\d+)\s*[-\s]?\s*(.*)$/.exec(String(meta.huisnummer||"").trim());
  const rows=[["Straat",meta.adres||"-"],["Huisnummer",mHn?mHn[1]:(meta.huisnummer||"-")],["Toevoeging",mHn?mHn[2]:""],["Plaats",meta.plaats||"-"],["Postcode",meta.postcode||"-"]].filter(r=>r[0]!=="Toevoeging"||r[1]);
  let y=209;
  rows.forEach(r=>{
    doc.setFont("helvetica","bold");doc.setFontSize(9.5);doc.setTextColor(...INK);doc.text(pdfTxt(r[0]),CX,y);
    doc.setFont("helvetica","normal");doc.setTextColor(...INK);doc.text(pdfTxt(String(r[1])),110,y);
    doc.setDrawColor(...LINE);doc.setLineWidth(0.2);doc.line(CX,y+2.5,W-10,y+2.5);
    y+=8;
  });
}
function pdfBanner(doc,badge,titel,sub,dateText){
  const W=PDF_W,M=PDF_M,MUT=PDF_MUT,SOFT=PDF_SOFT,INK=PDF_INK;
  const BANDPUR=[127,125,255];
  doc.setFillColor(...SOFT);doc.rect(0,0,W,22,"F");
  doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(...BANDPUR);doc.text(pdfTxt(badge),M,14);
  doc.setFont("helvetica","bold");doc.setFontSize(16);doc.setTextColor(...BANDPUR);doc.text("GoHome",W-8,14,{align:"right"});
  // Titel: laat op 22pt passen; is de tekst te breed, verklein stapsgewijs, en wijk anders uit naar twee regels.
  doc.setFont("helvetica","bold");doc.setTextColor(...INK);
  const titelTxt=pdfTxt(titel),maxW=W-2*M;
  let fs=22;doc.setFontSize(fs);
  while(fs>14&&doc.getTextWidth(titelTxt)>maxW){fs-=1;doc.setFontSize(fs);}
  let titelLines=[titelTxt];
  if(doc.getTextWidth(titelTxt)>maxW)titelLines=doc.splitTextToSize(titelTxt,maxW).slice(0,2);
  let ty=38;
  if(titelLines.length>1){doc.text(titelLines[0],M,32);doc.text(titelLines[1],M,32+(fs*0.42));ty=32+(fs*0.42)+7;}
  else{doc.text(titelLines[0],M,ty);ty+=7;}
  let y=ty;
  if(sub){doc.setFont("helvetica","normal");doc.setFontSize(9.5);doc.setTextColor(...MUT);doc.text(pdfTxt(sub),M,y);y+=5.5;}
  if(dateText){doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(...MUT);doc.text(pdfTxt(dateText),M,y);y+=5;}
  return Math.max(y+2,48);
}
function pdfPlattegrondBlok(doc,y,input,maxH){
  if(!input||!input.plattegrondImg)return y;
  const W=PDF_W,M=PDF_M,PUR=PDF_PUR,MUT=PDF_MUT;
  maxH=maxH||85;
  try{
    const props=doc.getImageProperties(input.plattegrondImg);
    const maxW=W-2*M;
    let w=maxW,h=w*props.height/props.width;
    if(h>maxH){h=maxH;w=h*props.width/props.height;}
    if(y+h+10>270){doc.addPage();y=20;}
    doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(...PUR);doc.text("PLATTEGROND",M,y);y+=5.5;
    const x=M+(maxW-w)/2;
    doc.addImage(input.plattegrondImg,"JPEG",x,y,w,h);
    return y+h+8;
  }catch(e){
    doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.setTextColor(...MUT);
    doc.text("De plattegrond kon niet worden weergegeven.",M,y);
    return y+6;
  }
}
const CATEGORIE_VAN_KEY={label:"Energielabel",indexKlasse:"Energielabel",verwVertrek:"Verwarming en verkoeling",verwOverig:"Verwarming en verkoeling",koeling:"Verwarming en verkoeling",aanrecht:"Keuken",keukenExtra:"Keuken",bad:"Sanitair",toiletHang:"Sanitair",toilet:"Sanitair",wastafel:"Sanitair",sanExtra:"Sanitair",balkon:"Buitenruimte",aanbel:"Overig",laadpaal:"Overig"};
// ---- regels 3927–4247 ----
function pdfCategorieKaarten(doc,y,route){
  const W=PDF_W,M=PDF_M,PUR=PDF_PUR,INK=PDF_INK,MUT=PDF_MUT,SOFT=PDF_SOFT;
  const cats=[];
  route.stappen.forEach(g=>{
    const naam=CATEGORIE_VAN_KEY[g.key]||"Overig";
    let c=cats.find(x=>x.naam===naam);if(!c){c={naam,g:0,bullets:[],energie:null};cats.push(c);}
    c.g+=g.g;
    if(g.key==="label"){
      const isLabel=route.origSoort==="label"||route.origSoort==="labelOud";
      c.energie={van:isLabel?route.vanLabel:route.vanOmschrijving,vanIsLabel:isLabel,naar:g.naarLabel,bron:g.bron,kostenMin:g.kostenMin,kostenMax:g.kostenMax,besparingMin:g.besparingMin,besparingMax:g.besparingMax};
      (g.omschrijving&&g.omschrijving.length?g.omschrijving:[g.o]).forEach(d=>c.bullets.push(d));
    }else{
      (g.delen&&g.delen.length?g.delen:[g.o]).forEach(d=>c.bullets.push(d.replace(/ \(keuken\)$/,"")));
    }
  });
  if(!cats.length){
    doc.setFont("helvetica","italic");doc.setFontSize(9.5);doc.setTextColor(...MUT);doc.text("Geen maatregelen nodig voor deze optie.",M,y);
    return y+8;
  }
  cats.forEach(c=>{
    const bodyLines=c.bullets.map(b=>"-  "+pdfTxt(b));
    const extra=[];
    if(c.energie){
      extra.push(c.energie.vanIsLabel?("Van label "+c.energie.van+" naar "+(c.energie.naar||"?")):("Van "+c.energie.van+" naar nieuw energielabel "+(c.energie.naar||"?")));
      if(c.energie.bron==="advies"){
        extra.push("Kosten: "+eur(c.energie.kostenMin)+(c.energie.kostenMax>c.energie.kostenMin?" – "+eur(c.energie.kostenMax):""));
        if(c.energie.besparingMin||c.energie.besparingMax)extra.push("Besparing: "+eur(c.energie.besparingMin)+(c.energie.besparingMax>c.energie.besparingMin?" – "+eur(c.energie.besparingMax):"")+" per jaar");
      }
    }
    const extraWrapped=extra.flatMap(l=>doc.splitTextToSize(pdfTxt(l),W-2*M-14));
    const bodyWrapped=bodyLines.flatMap(l=>doc.splitTextToSize(l,W-2*M-14));
    const cardH=16+extraWrapped.length*4.6+bodyWrapped.length*4.6;
    if(y+cardH>268){doc.addPage();y=20;}
    doc.setFillColor(...SOFT);doc.roundedRect(M,y,W-2*M,cardH,4,4,"F");
    doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(...INK);doc.text(c.naam,M+6,y+9);
    doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(...PUR);doc.text((c.g>=0?"+":"")+fmt(c.g)+" punten",W-M-6,y+9,{align:"right"});
    let yy2=y+15;
    doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(...INK);
    extraWrapped.forEach(l=>{doc.text(l,M+6,yy2);yy2+=4.6;});
    doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(...MUT);
    bodyWrapped.forEach(l=>{doc.text(l,M+6,yy2);yy2+=4.6;});
    y+=cardH+6;
  });
  return y;
}
async function pdfOptiePagina(doc,idx,titel,sub,route,badge,meta){
  const W=PDF_W,M=PDF_M,PUR=PDF_PUR,INK=PDF_INK,MUT=PDF_MUT,SOFT=PDF_SOFT;
  doc.addPage();
  let y=pdfBanner(doc,badge||("Advies, optie "+idx),titel,sub);
  y=pdfGaugeCard(doc,y,route.eind,N);
  doc.setFillColor(...SOFT);doc.roundedRect(M,y,W-2*M,22,5,5,"F");
  const kc=[["NU",String(route.start.totaal)],["DOEL",String(route.doel)],["MET DEZE OPTIE",String(route.eind.totaal)],["KOSTEN (INDICATIE)",eur(route.kosten)]];
  kc.forEach((k,n)=>{const x=M+7+n*44.5;doc.setFont("helvetica","bold");doc.setFontSize(7);doc.setTextColor(...PUR);doc.text(k[0],x,y+8);doc.setFontSize(n===3?12:17);doc.setTextColor(...INK);doc.text(k[1],x,y+17);});
  y+=29;
  doc.setFont("helvetica","normal");doc.setFontSize(9.5);doc.setTextColor(...INK);
  const okVrij=route.eind.totaal>=N.grensMidden+1;
  doc.text(doc.splitTextToSize(route.gehaald?"Met deze optie komt de woning op "+route.eind.totaal+" punten"+(okVrij?" en valt hij in de vrije sector.":"."):"Met de beschikbare maatregelen komt de woning maximaal op "+route.eind.totaal+" punten; het doel van "+route.doel+" punten wordt niet gehaald.",W-2*M),M,y);
  y+=10;
  doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(...PUR);doc.text("MAATREGELEN PER ONDERDEEL",M,y);y+=6.5;
  y=pdfCategorieKaarten(doc,y,route);
  let R=null;
  if(meta&&route.input){
    if(y>258){doc.addPage();y=20;}
    doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(...PUR);doc.text("VOLLEDIGE PUNTENTELLING MET DEZE OPTIE",M,y);y+=5.5;
    const body=pdfTellingBody(doc,y,meta,route.input,N,{skipGauge:true});
    y=body.y;R=body.R;
  }
  return {y,R};
}
function pdfVerduurzamingPagina(doc,EA){
  if(!EA)return;
  const W=PDF_W,M=PDF_M,PUR=PDF_PUR,INK=PDF_INK,MUT=PDF_MUT,SOFT=PDF_SOFT;
  doc.addPage();
  let y=pdfBanner(doc,"WWS-rapport","Verduurzamingsopties","Op basis van het geüploade verduurzamings- of energieadvies");
  const H=EA.huidig;
  if(H){
    doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(...PUR);doc.text("HUIDIGE ENERGIESTATUS",M,y);y+=4;
    const rows=[];
    if(H.label)rows.push(["Energielabel",H.label]);
    if(H.woningtype)rows.push(["Woningtype",pdfTxt(H.woningtype)]);
    if(H.bouwjaar)rows.push(["Bouwjaar",pdfTxt(String(H.bouwjaar))]);
    if(H.oppervlakte_m2)rows.push(["Oppervlakte",pdfTxt(fmt(H.oppervlakte_m2)+" m²")]);
    const inst=H.installaties||{};
    [["verwarming","Verwarming"],["warmwater","Warm water"],["pv","Zonnepanelen"],["ventilatie","Ventilatie"],["koeling","Koeling"]].forEach(function(p){if(inst[p[0]])rows.push([p[1],pdfTxt(inst[p[0]])]);});
    const iso=H.isolatie||{};
    if(iso.muur)rows.push(["Isolatie muur",pdfTxt(iso.muur)]);
    if(iso.glas)rows.push(["Isolatie glas",pdfTxt(iso.glas)]);
    if(rows.length){
      doc.autoTable({startY:y,body:rows,theme:"plain",styles:{fontSize:9.5,textColor:INK,cellPadding:1.4},columnStyles:{0:{fontStyle:"bold",cellWidth:45,textColor:MUT}},margin:{left:M,right:M}});
      y=doc.lastAutoTable.finalY+7;
    }
  }
  const mr=EA.maatregelen||[];
  if(mr.length){
    if(y>250){doc.addPage();y=20;}
    doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(...PUR);doc.text("AANBEVOLEN MAATREGELEN",M,y);y+=4;
    mr.forEach((m,i)=>{
      const bodyLines=(m.omschrijving||[]).map(d=>"-  "+pdfTxt(d));
      const wrapped=bodyLines.flatMap(l=>doc.splitTextToSize(l,W-2*M-14));
      const kostTxt="Kosten: "+eur(m.kostenMin)+(m.kostenMax>m.kostenMin?" – "+eur(m.kostenMax):"");
      const bespTxt=(m.besparingMin||m.besparingMax)?"Besparing: "+eur(m.besparingMin)+(m.besparingMax>m.besparingMin?" – "+eur(m.besparingMax):"")+" per jaar":"";
      const extraLines=[kostTxt].concat(bespTxt?[bespTxt]:[]).flatMap(l=>doc.splitTextToSize(l,W-2*M-14));
      const cardH=16+extraLines.length*4.6+wrapped.length*4.6;
      if(y+cardH>268){doc.addPage();y=20;}
      doc.setFillColor(...SOFT);doc.roundedRect(M,y,W-2*M,cardH,4,4,"F");
      doc.setFont("helvetica","bold");doc.setFontSize(10.5);doc.setTextColor(...INK);doc.text("Maatregel "+(i+1)+": van "+m.vanLabel+" naar "+m.naarLabel,M+6,y+9);
      let yy=y+15;
      doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(...MUT);
      wrapped.forEach(l=>{doc.text(l,M+6,yy);yy+=4.6;});
      doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(...PUR);
      extraLines.forEach(l=>{doc.text(l,M+6,yy);yy+=4.6;});
      y+=cardH+6;
    });
  }
  return y;
}
function hsl2rgb(h,s,l){
  s/=100;l/=100;
  const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
  let r=0,g=0,b=0;
  if(h<60){r=c;g=x;b=0;}else if(h<120){r=x;g=c;b=0;}else if(h<180){r=0;g=c;b=x;}
  else if(h<240){r=0;g=x;b=c;}else if(h<300){r=c;g=0;b=x;}else{r=x;g=0;b=c;}
  return [Math.round((r+m)*255),Math.round((g+m)*255),Math.round((b+m)*255)];
}
function pdfLabelKleur(i,n){return hsl2rgb(120-120*i/Math.max(1,n-1),68,43);}
function pdfLabelChevron(doc,x,y,w,h,label,color){
  doc.setFillColor(...color);
  doc.lines([[w-h*0.45,0],[h*0.45,h/2],[-h*0.45,h/2],[-(w-h*0.45),0]],x,y,[1,1],"F",true);
  doc.setFont("helvetica","bold");doc.setFontSize(8.5);doc.setTextColor(255,255,255);
  doc.text(label,x+3.5,y+h/2+1.1);
}
function pdfKaartHeader(doc,M,y,titel,sub){
  doc.setFont("helvetica","bold");doc.setFontSize(15);doc.setTextColor(...PDF_INK);doc.text(titel,M,y);y+=7;
  if(sub){doc.setFont("helvetica","normal");doc.setFontSize(9.5);doc.setTextColor(...PDF_MUT);doc.text(sub,M,y);y+=8;}
  return y;
}
function pdfEnergieUitlegPagina(doc,normen){
  const W=PDF_W,M=PDF_M,INK=PDF_INK,MUT=PDF_MUT;
  const CARDBORDER=[214,211,255];
  doc.addPage();
  let y=pdfBanner(doc,"WWS-rapport","Energielabel en WOZ-waarde","Algemene uitleg over deze twee onderdelen van de puntentelling");

  // Kaart: punten per energielabel, met gekleurde labelvlaggen (zoals het energielabel zelf)
  y=pdfKaartHeader(doc,M,y,"Energielabel","Hieronder is een overzicht van de punten per energielabel.");
  const cardW=W-2*M,padX=7,rowH=8.4,chevW=26,chevH=5.6,col1=M+66,col2=M+128;
  const nRows=LABELS.length+1;
  const cardH=12+nRows*rowH;
  if(y+cardH>270){doc.addPage();y=20;}
  doc.setDrawColor(...CARDBORDER);doc.setLineWidth(0.4);doc.roundedRect(M,y,cardW,cardH,4,4,"S");
  let ty=y+11;
  doc.setFont("helvetica","bold");doc.setFontSize(9.5);doc.setTextColor(...INK);
  doc.text("Label",M+padX,ty);doc.text("Eengezinswoning",col1,ty);doc.text("Meergezinswoning",col2,ty);
  ty+=7;
  LABELS.forEach((l,i)=>{
    pdfLabelChevron(doc,M+padX,ty-chevH+1.5,chevW,chevH,l,pdfLabelKleur(i,LABELS.length));
    doc.setFont("helvetica","normal");doc.setFontSize(9.5);doc.setTextColor(...INK);
    doc.text(fmt(normen.energie[l][0]),col1,ty);doc.text(fmt(normen.energie[l][1]),col2,ty);
    doc.setDrawColor(...CARDBORDER);doc.setLineDashPattern([0.6,0.9],0);doc.setLineWidth(0.25);
    doc.line(M+padX,ty+2.6,M+cardW-padX,ty+2.6);doc.setLineDashPattern([],0);
    ty+=rowH;
  });
  doc.setFont("helvetica","bold");doc.setFontSize(9.5);doc.setTextColor(...INK);doc.text("EPV",M+padX,ty);
  doc.setFont("helvetica","normal");doc.text(fmt(normen.epv[0]),col1,ty);doc.text(fmt(normen.epv[1]),col2,ty);
  y+=cardH+12;

  // Kaart: WOZ-waarde, in twee delen plus de 33%-cap
  const wj=Object.keys(normen.woz).sort().reverse()[0];
  const kg=normen.woz[wj];
  const labelW=30;
  const deel1=doc.splitTextToSize(pdfTxt("Voor elke "+eur(kg[0])+" van de laatstelijk vastgestelde WOZ-waarde: 1 punt"),cardW-2*padX-labelW);
  const deel2=doc.splitTextToSize(pdfTxt("Voor elke "+eur(kg[1])+" van de WOZ-waarde per m² van vertrekken + overige ruimten van de woning: 1 punt"),cardW-2*padX-labelW);
  const capTxt=doc.splitTextToSize(pdfTxt(normen.wozCapPct+"% WOZ-cap is alleen van kracht wanneer de woning zich niet in de vrije sector bevindt. De WOZ-cap houdt in dat de WOZ-waarde niet meer dan "+normen.wozCapPct+"% van het totaal aantal punten mag bijdragen. Wanneer de WOZ-punten, berekend op basis van deel 1 plus deel 2, hoger zijn dan "+normen.wozCapPct+"% van het totaal, wordt de WOZ gecapt. Als de WOZ-cap ervoor zorgt dat het puntenaantal onder de "+(normen.grensMidden+1)+" punten komt, en daardoor uit de vrije sector valt, wordt het puntenaantal gemaximaliseerd op "+normen.grensMidden+" punten."),cardW-2*padX-labelW);
  const cardH2=14+deel1.length*4.6+deel2.length*4.6+10+capTxt.length*4.6+8;
  if(y+15+cardH2>270){doc.addPage();y=20;}
  y=pdfKaartHeader(doc,M,y,"WOZ-waarde","De berekening voor het puntenaantal op basis van de WOZ-waarde bestaat uit twee onderdelen.");
  doc.setDrawColor(...CARDBORDER);doc.setLineWidth(0.4);doc.roundedRect(M,y,cardW,cardH2,4,4,"S");
  let wy=y+11;
  doc.setFont("helvetica","bold");doc.setFontSize(9.5);doc.setTextColor(...INK);doc.text("Deel 1",M+padX,wy);
  doc.setFont("helvetica","normal");doc.setTextColor(...INK);doc.text(deel1,M+padX+labelW,wy);wy+=deel1.length*4.6+2;
  doc.setFont("helvetica","bold");doc.setTextColor(...INK);doc.text("Deel 2",M+padX,wy);
  doc.setFont("helvetica","normal");doc.setTextColor(...INK);doc.text(deel2,M+padX+labelW,wy);wy+=deel2.length*4.6+10;
  doc.setFont("helvetica","bold");doc.setTextColor(...INK);doc.text(normen.wozCapPct+"% WOZ-cap",M+padX,wy);
  doc.setFont("helvetica","normal");doc.setTextColor(...INK);doc.text(capTxt,M+padX+labelW,wy);wy+=capTxt.length*4.6;
  y+=cardH2+8;
  return y;
}
function pdfMiniGaugeRow(doc,x,y,w,label,totaal,normen){
  const PUR=PDF_PUR,INK=PDF_INK,MUT=PDF_MUT,SEGC=PDF_SEGC;
  doc.setFont("helvetica","bold");doc.setFontSize(9.5);doc.setTextColor(...INK);doc.text(label,x,y);
  const barY=y+10,barH=3.4,scale=Math.max(250,totaal+20);
  const w1=w*normen.grensLaag/scale,w2=w*(normen.grensMidden-normen.grensLaag)/scale;
  doc.setFillColor(...SEGC.laag);doc.rect(x,barY,w1,barH,"F");
  doc.setFillColor(...SEGC.midden);doc.rect(x+w1,barY,w2,barH,"F");
  doc.setFillColor(...SEGC.hoog);doc.rect(x+w1+w2,barY,w-w1-w2,barH,"F");
  const mx=x+w*Math.min(1,totaal/scale);
  doc.setDrawColor(...INK);doc.setLineWidth(0.5);doc.line(mx,barY-2.5,mx,barY+barH+2.5);
  const bubTxt=String(totaal),bubW=doc.getTextWidth(bubTxt)*0.6+7;
  doc.setFillColor(255,255,255);doc.setDrawColor(...PUR);doc.setLineWidth(0.3);
  const bubX=Math.min(Math.max(mx-bubW/2,x-2),x+w-bubW+2),bubY=barY-11.5;
  doc.roundedRect(bubX,bubY,bubW,6,2,2,"FD");
  doc.setFont("helvetica","bold");doc.setFontSize(8.5);doc.setTextColor(...INK);doc.text(bubTxt,bubX+bubW/2,bubY+4.2,{align:"center"});
  doc.setFont("helvetica","normal");doc.setFontSize(6.5);doc.setTextColor(...MUT);
  doc.text("0-"+normen.grensLaag,x,barY+barH+5);doc.text("sociale huur",x,barY+barH+8.3);
  doc.text((normen.grensLaag+1)+"-"+normen.grensMidden,x+w1+w2/2,barY+barH+5,{align:"center"});doc.text("middenhuur",x+w1+w2/2,barY+barH+8.3,{align:"center"});
  doc.text((normen.grensMidden+1)+"+",x+w,barY+barH+5,{align:"right"});doc.text("vrije sector",x+w,barY+barH+8.3,{align:"right"});
  return y+29;
}
function pdfSamenvattingPagina(doc,meta,input,normen,R,route1,route2,sections){
  const W=PDF_W,M=PDF_M,INK=PDF_INK,MUT=PDF_MUT,LINE=PDF_LINE,SOFT=PDF_SOFT;
  const CARDBORDER=[214,211,255];
  doc.addPage();
  let y=pdfBanner(doc,"WWS-rapport","Overzicht","Samenvatting van de puntentelling en de verbeteropties");
  let hasImg=input&&input.plattegrondImg; // ENIGE AANPASSING: in de bron 'const' (bug: toewijzing hieronder gooit); Bun weigert dat al bij het parsen
  let imgW=0,imgH=0;
  if(hasImg){try{const props=doc.getImageProperties(input.plattegrondImg);imgW=70;imgH=Math.min(50,imgW*props.height/props.width);}catch(e){hasImg=false;}}
  const leftW=hasImg?(W-2*M-imgW-8):(W-2*M);
  const rows=[
    ["Peildatum",meta.peildatum?new Date(meta.peildatum).toLocaleDateString("nl-NL"):"-"],
    ["Woonvorm",input.woningtype==="eengezins"?"Eengezinswoning":"Meergezinswoning"],
    ["Vertrekken m²",fmt(R.oppV,0)],
    ["Energielabel",(input.energie&&(input.energie.soort==="label"||input.energie.soort==="labelOud"))?input.energie.label:"n.v.t."]
  ];
  const startY=y;
  rows.forEach(r=>{
    doc.setFont("helvetica","bold");doc.setFontSize(9.5);doc.setTextColor(...INK);doc.text(pdfTxt(r[0]),M,y);
    doc.setFont("helvetica","normal");doc.setTextColor(...INK);doc.text(pdfTxt(String(r[1])),M+45,y);
    doc.setDrawColor(...LINE);doc.setLineWidth(0.2);doc.line(M,y+2.3,M+leftW,y+2.3);
    y+=8;
  });
  if(hasImg){try{doc.addImage(input.plattegrondImg,"JPEG",M+leftW+8,startY-5,imgW,imgH);}catch(e){}}
  y+=8;
  y=pdfKaartHeader(doc,M,y,"Inhoudsopgave");
  doc.setFont("helvetica","normal");doc.setFontSize(9.5);doc.setTextColor(...INK);
  sections.forEach(s=>{
    const lines=doc.splitTextToSize(pdfTxt(s),W-2*M-6);
    doc.text("-  "+lines[0],M,y);
    for(let k=1;k<lines.length;k++){doc.text(lines[k],M+5,y+k*5.2);}
    y+=5.8+(lines.length-1)*5.2;
  });
  y+=8;
  y=pdfKaartHeader(doc,M,y,"Samenvatting");
  const cardH=14+3*29;
  if(y+cardH>270){doc.addPage();y=20;}
  doc.setDrawColor(...CARDBORDER);doc.setFillColor(...SOFT);doc.roundedRect(M,y,W-2*M,cardH,5,5,"FD");
  let by=y+13;
  const items=[["Huidige status",R.totaal],["Verbeteroptie 1",route1.eind.totaal],["Verbeteroptie 2",route2.eind.totaal]];
  items.forEach(it=>{by=pdfMiniGaugeRow(doc,M+10,by,W-2*M-20,it[0],it[1],normen);});
  return y+cardH+8;
}
async function makeAdviesVolledigPdf(){
  if(!window.jspdf){toast("De PDF-bibliotheek is niet geladen. Herlaad de pagina.");return;}
  if(!adviesState.result)return;
  const meta=cur.meta;
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:"mm",format:"a4",compress:true});
  const W=PDF_W,M=PDF_M,MUT=PDF_MUT;
  const naam=meta.naam||weergaveAdres(meta)||"Puntentelling";
  const vandaag=new Date().toLocaleDateString("nl-NL",{dateStyle:"long"});
  pdfCoverPage(doc,meta);

  // Twee opties: optie 1 is de goedkoopste en snelste route naar de vrije sector;
  // optie 2 geeft een marge van standaard 4 punten daarboven, of anders de maximaal haalbare route.
  const margeGewenst=adviesState.marge>0?adviesState.marge:4;
  const doel1=N.grensMidden+1;
  let doel2=N.grensMidden+1+margeGewenst;
  const route1=berekenRouteVoorDoel(doel1);
  // Optie 2 bouwt voort op optie 1 (dezelfde maatregelen, aangevuld tot de afgesproken marge),
  // in plaats van een volledig losse route te zoeken die toevallig ook het doel haalt.
  let route2=berekenRouteVoorDoel(doel2,route1);
  let titel2="Optie 2: route met marge naar de vrije sector",sub2="De maatregelen van optie 1, aangevuld tot een marge van "+margeGewenst+" punten boven de grens van de vrije sector";
  if(!route2.gehaald){
    route2=berekenRouteVoorDoel(9999,route1);
    route2.doel=route2.eind.totaal;route2.gehaald=true;
    titel2="Optie 2: maximaal haalbare route";
    sub2="Optie 1, aangevuld met alle overige beschikbare maatregelen, voor het hoogst haalbare puntentotaal";
  }

  // Sectie 2: inhoudsopgave en samenvatting met de drie puntentotalen
  const Rcur=calc(cur.input,N);
  const sections=[
    "Huidige situatie, met de volledige puntentelling",
    "Verbeteroptie 1, met maatregelen en de volledige puntentelling",
    "Verbeteroptie 2, met maatregelen en de volledige puntentelling"
  ];
  if(cur.input.energieAdvies)sections.push("Verduurzamingsopties");
  sections.push("Energielabel en WOZ-waarde");
  pdfSamenvattingPagina(doc,meta,cur.input,N,Rcur,route1,route2,sections);

  // Sectie 1: huidige situatie — zelfde opmaak als de losse puntentelling-PDF, inclusief plattegrond
  doc.addPage();
  let y=pdfBanner(doc,"WWS-rapport","Huidige situatie","Puntentelling volgens het Woningwaarderingsstelsel, zelfstandige woonruimte",vandaag);
  y=pdfPlattegrondBlok(doc,y,cur.input);
  const body1=pdfTellingBody(doc,y,meta,cur.input,N);
  const R1=body1.R;

  // Sectie 3 en 4: de twee opties, elk met hun eigen volledige puntentelling
  let R2=null,R3=null;
  ({y,R:R2}=await pdfOptiePagina(doc,1,"Optie 1: goedkoopste en snelste route naar de vrije sector","De meest kosteneffectieve maatregelen om net in de vrije sector te komen",route1,undefined,meta));
  ({y,R:R3}=await pdfOptiePagina(doc,2,titel2,sub2,route2,undefined,meta));

  // Sectie 4 (optioneel): verduurzamingsopties uit een geüpload advies
  if(cur.input.energieAdvies)pdfVerduurzamingPagina(doc,cur.input.energieAdvies);

  // Sectie 5: altijd, uitleg energielabel en WOZ-waarde
  pdfEnergieUitlegPagina(doc,N);

  // Sectie 6: disclaimer, op een eigen pagina
  doc.addPage();y=20;
  doc.setFont("helvetica","bold");doc.setFontSize(13);doc.setTextColor(...PDF_PUR);doc.text("DISCLAIMER",M,y);y+=8;
  doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.setTextColor(...MUT);
  const allWarn=[...new Set(R1.warn.concat(R2?R2.warn:[]).concat(R3?R3.warn:[]))];
  const disc="Gebruikte normen: "+N.naam+". Berekend volgens het beleidsboek van de Huurcommissie; aan deze telling kunnen geen rechten worden ontleend. De kosten en besparingen van de maatregelen zijn indicatieve ramingen, geen offertes. Bij een zittende huurder verandert het huurcontract niet vanzelf mee. Een renovatie kan ook de WOZ-waarde verhogen; dat is niet meegerekend."+(allWarn.length?" Opmerkingen: "+allWarn.map(pdfTxt).join(" "):"");
  doc.text(doc.splitTextToSize(disc,W-2*M),M,y);
  const pages=doc.getNumberOfPages();
  const PUR=PDF_PUR,INK=PDF_INK,LINE=PDF_LINE;
  for(let i=2;i<=pages;i++){doc.setPage(i);doc.setDrawColor(...LINE);doc.setLineWidth(0.3);doc.line(M,282,W-M,282);doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(...INK);doc.text("GoHome",M,287);doc.setFont("helvetica","normal");doc.setTextColor(...MUT);doc.text("gohome.io",M+13,287);doc.text("Pagina "+i+" van "+pages,W-M,287,{align:"right"});}
  const base=(meta.naam||weergaveAdres(meta)||"puntentelling").replace(/[^\w\-]+/g,"_").slice(0,60);
  const blob=doc.output("blob");
  try{await saveFile("WWS_"+base+"_huidig_advies_opties.pdf",blob);toast("PDF opgeslagen");}
  catch(e){if(e&&e.code==="declined")return;if(e&&e.code==="rate_limited"){toast("Er staat al een download klaar. Probeer het zo opnieuw.");return;}toast("Downloaden lukte niet.");}
}
return { makePdf, makeRoutePdf, makeAdviesVolledigPdf, makeDashboardPdf, exporteerArchiefExcel };
}

module.exports = { maakPdfBron };
