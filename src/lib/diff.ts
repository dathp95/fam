/** Word-level comparison (LCS) and scoring. */

export type DiffKind = 'ok' | 'miss' | 'extra'
export type DiffOp = readonly [kind: DiffKind, word: string]

export interface DiffResult {
  ops: DiffOp[]
  /** Length of the longest common subsequence. */
  lcs: number
}

export interface ScoreResult {
  ops: DiffOp[]
  score: number
  xp: number
}

export const HINT_PENALTY = 10

/** ok = word matched, miss = in reference but not typed, extra = typed but not in reference. */
export function diffWords(ref: string[], user: string[]): DiffResult {
  const n = ref.length
  const m = user.length
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        ref[i - 1] === user[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const ops: DiffOp[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ref[i - 1] === user[j - 1]) {
      ops.push(['ok', ref[i - 1]])
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push(['extra', user[j - 1]])
      j--
    } else {
      ops.push(['miss', ref[i - 1]])
      i--
    }
  }
  return { ops: ops.reverse(), lcs: dp[n][m] }
}

/** Score 0–100 minus 10 per hint used; XP = score/10, +5 bonus for a perfect no-hint answer. */
export function scoreAnswer(ref: string[], user: string[], hints: number): ScoreResult {
  const { ops, lcs } = diffWords(ref, user)
  const raw = Math.round((100 * lcs) / Math.max(ref.length, user.length, 1))
  const score = Math.max(0, raw - hints * HINT_PENALTY)
  const xp = Math.round(score / 10) + (score === 100 && hints === 0 ? 5 : 0)
  return { ops, score, xp }
}

/** Reveal the first `revealed` words, mask the rest as "f___". */
export function maskHint(words: string[], revealed: number): string {
  return words
    .map((w, idx) => (idx < revealed ? w : w[0] + '_'.repeat(Math.max(1, w.length - 1))))
    .join('  ')
}
