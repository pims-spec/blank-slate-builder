import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Het (i)-icoon met uitleg — infoIcon() in wws-site.html; klikken of tikken opent de tekst */
export default function Uitleg({ tekst, over }: { tekst: string; over: string }) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={"Uitleg: " + over}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-muted-foreground/50 text-[11px] font-semibold leading-none text-muted-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        i
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm font-normal" side="top">
        {tekst}
      </PopoverContent>
    </Popover>
  );
}
