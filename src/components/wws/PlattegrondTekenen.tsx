import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { fmt, OVERIG_TYPES, overigType, vertrekType, VERTREK_TYPES } from "@/lib/wws";
import type {
  Bbox,
  Groep,
  IndelingRuimte,
  IndelingStatus,
  Notches,
  RuimteWijziging,
} from "@/lib/wws/indeling";
import {
  clamp01,
  clipPath,
  grootGenoeg,
  herkomstAangepast,
  HOEKEN,
  inkeping,
  m2NaVergroten,
  nieuwVlak,
  schatM2VoorBbox,
  vergroot,
  verplaats,
  zVolgorde,
  type Hoek,
} from "@/lib/wws/tekenen";

const STATUS_LABEL: Record<IndelingStatus, string> = {
  vrij: "Vrij herindelen",
  vast: "Vast houden",
  negeren: "Vervalt",
};
const STATUS_CLS: Record<IndelingStatus, string> = {
  vrij: "border-primary bg-primary/20",
  vast: "border-slate-600 bg-slate-500/25",
  negeren: "border-red-500 bg-red-500/15 line-through opacity-70",
};
const veldCls =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Drag =
  | { mode: "move"; i: number; startX: number; startY: number; start: Bbox; rect: DOMRect }
  | {
      mode: "resize";
      i: number;
      hoek: Hoek;
      startX: number;
      startY: number;
      start: Bbox;
      startM2: number;
      herkomst: string | undefined;
      rect: DOMRect;
    }
  | {
      mode: "notch";
      i: number;
      hoek: Hoek;
      startX: number;
      startY: number;
      start: { w: number; h: number };
      rect: DOMRect;
    }
  | { mode: "new"; startFrac: { x: number; y: number }; cur: Bbox | null; rect: DOMRect };

interface Props {
  url: string;
  rooms: IndelingRuimte[];
  /** Herkomst per ruimte (uit de telling), voor "aangepast" */
  herkomst: (r: IndelingRuimte) => string | undefined;
  onWijzig: (i: number, w: RuimteWijziging) => void;
  onStatus: (i: number) => void;
  onNieuw: (n: { key: Groep; type: string; naam: string; m2: string; bbox: Bbox }) => void;
}

/**
 * Tekenen op de plattegrond — de plattegrond-stap van het indelingsadvies in wws-site.html:
 * klik een vlak om de status te wisselen, sleep om te verplaatsen, sleep aan een hoek om het
 * formaat aan te passen (m² schaalt mee) of een inkeping te maken, en sleep op een leeg deel om
 * een nieuwe ruimte in te tekenen.
 */
export default function PlattegrondTekenen({
  url,
  rooms,
  herkomst,
  onWijzig,
  onStatus,
  onNieuw,
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const bewogen = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [nieuw, setNieuw] = useState<{ bbox: Bbox; schatting: string } | null>(null);
  const [form, setForm] = useState({ naam: "", soort: "vertrekken:overig", m2: "" });

  // laatste versies voor de window-listeners
  const props = useRef({ rooms, onWijzig, onStatus, herkomst });
  props.current = { rooms, onWijzig, onStatus, herkomst };

  useEffect(() => {
    if (!drag) return;
    const beweeg = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const rect = d.rect;
      if (d.mode === "new") {
        const x1 = clamp01((e.clientX - rect.left) / rect.width);
        const y1 = clamp01((e.clientY - rect.top) / rect.height);
        const cur = nieuwVlak(d.startFrac, x1, y1);
        bewogen.current = true;
        dragRef.current = { ...d, cur };
        setDrag(dragRef.current);
        return;
      }
      const dx = (e.clientX - d.startX) / rect.width;
      const dy = (e.clientY - d.startY) / rect.height;
      if (Math.abs(e.clientX - d.startX) > 3 || Math.abs(e.clientY - d.startY) > 3)
        bewogen.current = true;
      const r = props.current.rooms[d.i];
      if (!r) return;
      if (d.mode === "move") {
        if (bewogen.current) props.current.onWijzig(d.i, { bbox: verplaats(d.start, dx, dy) });
      } else if (d.mode === "resize") {
        const bbox = vergroot(d.start, d.hoek, dx, dy);
        const m2 = m2NaVergroten(d.startM2, d.start, bbox);
        props.current.onWijzig(
          d.i,
          m2 == null ? { bbox } : { bbox, m2, herkomst: herkomstAangepast(d.herkomst) },
        );
        bewogen.current = true;
      } else if (d.mode === "notch" && r.bbox) {
        const n: Notches = { ...r.notch, [d.hoek]: inkeping(d.start, d.hoek, r.bbox, dx, dy) };
        props.current.onWijzig(d.i, { notch: n });
        bewogen.current = true;
      }
    };
    const los = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      if (d.mode === "move" && !bewogen.current) props.current.onStatus(d.i);
      if (d.mode === "new" && grootGenoeg(d.cur) && d.cur) {
        setNieuw({ bbox: d.cur, schatting: schatM2VoorBbox(props.current.rooms, d.cur) });
        setForm({
          naam: "",
          soort: "vertrekken:overig",
          m2: schatM2VoorBbox(props.current.rooms, d.cur),
        });
      }
    };
    window.addEventListener("pointermove", beweeg);
    window.addEventListener("pointerup", los);
    return () => {
      window.removeEventListener("pointermove", beweeg);
      window.removeEventListener("pointerup", los);
    };
  }, [drag !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  function start(e: RPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const el = e.target as HTMLElement;
    const box = el.closest<HTMLElement>("[data-vlak]");
    const i = box ? Number(box.dataset["vlak"]) : -1;
    const r = rooms[i];
    const handle = el.closest<HTMLElement>("[data-greep]");
    bewogen.current = false;
    let d: Drag;
    if (r?.bbox && handle) {
      const hoek = handle.dataset["hoek"] as Hoek;
      d =
        handle.dataset["greep"] === "notch"
          ? {
              mode: "notch",
              i,
              hoek,
              rect,
              startX: e.clientX,
              startY: e.clientY,
              start: { w: 0, h: 0, ...r.notch[hoek] },
            }
          : {
              mode: "resize",
              i,
              hoek,
              rect,
              startX: e.clientX,
              startY: e.clientY,
              start: { ...r.bbox },
              startM2: r.m2,
              herkomst: herkomst(r),
            };
    } else if (r?.bbox) {
      d = { mode: "move", i, rect, startX: e.clientX, startY: e.clientY, start: { ...r.bbox } };
    } else {
      d = {
        mode: "new",
        rect,
        startFrac: {
          x: clamp01((e.clientX - rect.left) / rect.width),
          y: clamp01((e.clientY - rect.top) / rect.height),
        },
        cur: null,
      };
    }
    e.preventDefault();
    dragRef.current = d;
    setDrag(d);
  }

  const z = zVolgorde(rooms);
  const sleept = drag && drag.mode !== "new" ? drag.i : -1;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Klik op een ruimte om te wisselen tussen <b>vrij herindelen</b>, <b>vast houden</b> en{" "}
        <b>vervalt</b> (of gebruik de lijst eronder). Sleep een vlak om het te verplaatsen (het
        oppervlak verandert dan niet). Sleep aan een hoek (vierkantje) om het formaat aan te passen
        — het oppervlak schaalt mee — of aan het rondje om een inkeping te maken. Sleep op een leeg
        deel van de tekening om een nieuwe ruimte in te tekenen.
      </p>
      <div
        className="relative max-w-full touch-none select-none rounded-md border border-border bg-white"
        onPointerDown={start}
        aria-label="Plattegrond met ruimten"
      >
        <img
          ref={imgRef}
          src={url}
          alt="Plattegrond"
          draggable={false}
          className="block h-auto w-full rounded-md"
        />
        <div className="absolute inset-0">
          {rooms.map((r, i) => {
            if (!r.bbox) return null;
            const label =
              (r.naam && r.naam.trim()) ||
              (r.key === "vertrekken" ? vertrekType(r.type) : overigType(r.type)).l;
            const b = r.bbox;
            return (
              <button
                key={r.key + r.idx}
                type="button"
                data-vlak={i}
                className={`absolute flex items-center justify-center border-2 text-[11px] font-medium text-foreground ${STATUS_CLS[r.status]}`}
                style={{
                  left: b.x * 100 + "%",
                  top: b.y * 100 + "%",
                  width: b.w * 100 + "%",
                  height: b.h * 100 + "%",
                  zIndex: z.get(i),
                  clipPath: clipPath(r.notch),
                }}
                title={`${label} — ${STATUS_LABEL[r.status]}. Klik om te wisselen, sleep om te verplaatsen.`}
                aria-label={`${label}: ${STATUS_LABEL[r.status]}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onStatus(i);
                  }
                }}
              >
                <span className="pointer-events-none truncate px-1">
                  {sleept === i ? fmt(r.m2) + " m²" : label}
                </span>
                {HOEKEN.map((hoek) => {
                  const links = hoek === "tl" || hoek === "bl",
                    boven = hoek === "tl" || hoek === "tr";
                  const d = r.notch[hoek] || { w: 0.1, h: 0.1 };
                  return (
                    <span key={hoek} className="contents">
                      <span
                        data-greep="resize"
                        data-hoek={hoek}
                        title="Sleep om het formaat aan te passen"
                        className="absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize border-2 border-primary bg-white"
                        style={{ left: links ? "0%" : "100%", top: boven ? "0%" : "100%" }}
                      />
                      <span
                        data-greep="notch"
                        data-hoek={hoek}
                        title="Sleep om een inkeping (hoek) te maken"
                        className="absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-emerald-600 bg-white"
                        style={{
                          left: (links ? d.w * 100 : 100 - d.w * 100) + "%",
                          top: (boven ? d.h * 100 : 100 - d.h * 100) + "%",
                        }}
                      />
                    </span>
                  );
                })}
              </button>
            );
          })}
          {drag?.mode === "new" && drag.cur && (
            <div
              className="absolute border-2 border-dashed border-primary bg-primary/10"
              style={{
                left: drag.cur.x * 100 + "%",
                top: drag.cur.y * 100 + "%",
                width: drag.cur.w * 100 + "%",
                height: drag.cur.h * 100 + "%",
              }}
            />
          )}
        </div>
      </div>
      {!rooms.some((r) => r.bbox) && (
        <p className="text-xs text-muted-foreground">
          Van de ruimten is geen locatie op de tekening bekend; teken ze zelf in door op de tekening
          te slepen, of gebruik de lijst hieronder.
        </p>
      )}
      {nieuw && (
        <form
          className="space-y-3 rounded-md border border-border p-3"
          aria-label="Nieuwe ruimte op de plattegrond"
          onSubmit={(e) => {
            e.preventDefault();
            const [key, type] = form.soort.split(":") as [Groep, string];
            onNieuw({ key, type, naam: form.naam.trim(), m2: form.m2, bbox: nieuw.bbox });
            setNieuw(null);
          }}
        >
          <h3 className="text-sm font-semibold">Nieuwe ruimte op de plattegrond</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Naam</span>
              <input
                className={veldCls}
                maxLength={80}
                placeholder="Bijv. Slaapkamer 3"
                value={form.naam}
                onChange={(e) => setForm({ ...form, naam: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Soort</span>
              <select
                className={veldCls}
                value={form.soort}
                onChange={(e) => setForm({ ...form, soort: e.target.value })}
              >
                <optgroup label="Vertrek">
                  {VERTREK_TYPES.map((t) => (
                    <option key={t.k} value={"vertrekken:" + t.k}>
                      {t.l}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Overig">
                  {OVERIG_TYPES.map((t) => (
                    <option key={t.k} value={"overig:" + t.k}>
                      {t.l}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Geschat oppervlak (m²)</span>
              <input
                className={veldCls}
                inputMode="decimal"
                placeholder="bijv. 10,5"
                value={form.m2}
                onChange={(e) => setForm({ ...form, m2: e.target.value })}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="submit">Toevoegen</Button>
            <Button type="button" variant="ghost" onClick={() => setNieuw(null)}>
              Annuleren
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
