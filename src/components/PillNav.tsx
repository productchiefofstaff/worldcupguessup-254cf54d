import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type PillNavItem = {
  id: string;
  top: string;
  bottom?: string;
  dot?: boolean;
};

export function PillNav({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: PillNavItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the selected pill into view when value changes.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-pill-id="${CSS.escape(value)}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [value]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-2 overflow-x-auto snap-x scroll-smooth pb-2 -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-pill-id={it.id}
            onClick={() => onChange(it.id)}
            className={cn(
              "relative flex-none snap-center flex flex-col items-center justify-center min-w-14 px-3 py-2 rounded-2xl border transition-all active:scale-95",
              active
                ? "bg-primary border-primary text-primary-foreground shadow-md"
                : "bg-card border-border text-ink hover:bg-muted",
            )}
          >
            {it.bottom ? (
              <>
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider",
                    active ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}
                >
                  {it.top}
                </span>
                <span className="text-base font-bold leading-tight">{it.bottom}</span>
              </>
            ) : (
              <span className="text-sm font-bold leading-tight whitespace-nowrap">
                {it.top}
              </span>
            )}
            {it.dot && (
              <span
                className={cn(
                  "absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full",
                  active ? "bg-primary-foreground" : "bg-primary",
                )}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}