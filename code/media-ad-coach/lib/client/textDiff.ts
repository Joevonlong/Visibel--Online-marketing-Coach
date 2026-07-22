// FEA-106: a tiny word-level diff for the improvement showcase. Frontend-only
// (no imports, no deps) so it stays trivially unit-testable under vitest with
// relative imports. Powers the color-coded before -> after copy reveal: added
// words carry the red/rust accent, removed words are struck in the before line,
// unchanged copy stays quiet.

export type DiffKind = "unchanged" | "added" | "removed";

export type DiffSegment = {
  value: string;
  kind: DiffKind;
};

/** Split into comparable word tokens, dropping surrounding whitespace. */
function tokenize(input: string): string[] {
  const trimmed = input.trim();
  return trimmed.length === 0 ? [] : trimmed.split(/\s+/);
}

/** Merge adjacent same-kind words back into readable segments. */
function coalesce(ops: { kind: DiffKind; word: string }[]): DiffSegment[] {
  const segments: DiffSegment[] = [];
  for (const op of ops) {
    const last = segments[segments.length - 1];
    if (last && last.kind === op.kind) {
      last.value += ` ${op.word}`;
    } else {
      segments.push({ kind: op.kind, value: op.word });
    }
  }
  return segments;
}

/**
 * Word-level diff of `before` -> `after` as ordered segments. `removed`
 * segments come from `before`, `added` from `after`, `unchanged` from both.
 * Uses a standard longest-common-subsequence walk so a word inserted in the
 * middle is marked `added` without disturbing the words around it.
 */
export function diffWords(before: string, after: string): DiffSegment[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const m = a.length;
  const n = b.length;

  // dp[i][j] = LCS length of a[i:] and b[j:].
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: { kind: DiffKind; word: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ kind: "unchanged", word: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: "removed", word: a[i] });
      i++;
    } else {
      ops.push({ kind: "added", word: b[j] });
      j++;
    }
  }
  while (i < m) ops.push({ kind: "removed", word: a[i++] });
  while (j < n) ops.push({ kind: "added", word: b[j++] });

  return coalesce(ops);
}

/** Segments for rendering the AFTER line: unchanged + added (no removed). */
export function diffAfter(before: string, after: string): DiffSegment[] {
  return diffWords(before, after).filter((s) => s.kind !== "removed");
}

/** Segments for rendering the BEFORE line: unchanged + removed (no added). */
export function diffBefore(before: string, after: string): DiffSegment[] {
  return diffWords(before, after).filter((s) => s.kind !== "added");
}

/** True when `after` introduces at least one new word versus `before` — used
 *  to decide whether a diffed line is worth emphasizing at all. */
export function hasAddedWords(before: string, after: string): boolean {
  return diffWords(before, after).some((s) => s.kind === "added");
}
