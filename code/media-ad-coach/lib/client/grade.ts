// FEA-109: the shared red -> amber -> green grading used by the score header
// and every criterion bar. Pure + frontend-owned so it stays unit-testable.
// Colour is never the only signal — callers pair the grade with its numeric
// value and the word label below.

export type Grade = "low" | "mid" | "high";

/** Grade a 0–100 percentage. <40 alarming, 40–70 middling, >=70 healthy. */
export function gradeOf(percent: number): Grade {
  const clamped = Math.max(0, Math.min(100, percent));
  if (clamped < 40) return "low";
  if (clamped < 70) return "mid";
  return "high";
}

export const GRADE_LABEL: Record<Grade, string> = {
  low: "Weak",
  mid: "Fair",
  high: "Strong",
};

/** Tailwind text-colour class for a grade (tokens live in app/globals.css). */
export const GRADE_TEXT_CLASS: Record<Grade, string> = {
  low: "text-grade-low",
  mid: "text-grade-mid",
  high: "text-grade-high",
};

/** Tailwind background-colour class for a grade. */
export const GRADE_BG_CLASS: Record<Grade, string> = {
  low: "bg-grade-low",
  mid: "bg-grade-mid",
  high: "bg-grade-high",
};
