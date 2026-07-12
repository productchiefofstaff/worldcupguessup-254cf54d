const STAGE_LABELS: Record<string, string> = {
  "Round of 32": "R32",
  "Round of 16": "R16",
  "Quarter-final": "QF",
  "Quarter final": "QF",
  "Quarter Final": "QF",
  "Semi-final": "SF",
  "Semi final": "SF",
  "Semi Final": "SF",
  "Third-place Play-off": "3rd Place",
  "Third Place Play-off": "3rd Place",
  "Third-place": "3rd Place",
};

export function stageLabel(stage: string | null | undefined): string {
  if (!stage) return "";
  return STAGE_LABELS[stage] ?? stage;
}
