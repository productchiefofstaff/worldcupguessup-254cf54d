import { flagImageUrl, flagFor } from "@/lib/flags";
import { cn } from "@/lib/utils";

type Props = {
  team: string;
  className?: string;
  /** Approx rendered height in px; used to pick the source resolution. */
  size?: 20 | 40 | 60 | 80;
};

/**
 * Renders a country flag as an image (works on desktop where emoji flags
 * don't render — e.g. Windows Chrome). Falls back to the emoji glyph if no
 * ISO code is known for the team.
 */
export function Flag({ team, className, size = 40 }: Props) {
  const src = flagImageUrl(team, size);
  if (!src) {
    const emoji = flagFor(team);
    if (!emoji) return null;
    return (
      <span className={cn("leading-none", className)} aria-hidden>
        {emoji}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      className={cn("inline-block h-[1em] w-auto rounded-[2px] object-cover align-[-0.15em]", className)}
    />
  );
}