/**
 * The shape /api/predictions/latest serves, and how to tell which league a
 * prediction describes.
 *
 * Both consumers (CompactDashboard, the model-picks page) previously kept
 * their own copy of this interface, and both copies had drifted: neither
 * declared `source`, which the endpoint has always sent. That omission is what
 * let model-picks hardcode 'NFL' for every prediction and silently drop the
 * entire college half. One definition so the next field is added once.
 */
export interface ELOPrediction {
  homeTeam: string
  awayTeam: string
  predictedWinner: 'home' | 'away'
  winProbability: number
  spread?: number
  /** Which upstream produced this: 'nfelo' (NFL) or 'warren-nolan' (college). */
  source?: string
  confidence?: string
}

/**
 * The league a prediction describes. Each upstream covers exactly one league,
 * so the source names it without guessing from the team name — which matters,
 * because guessing lets an NFL fuzzy match capture a college team.
 *
 * Returns undefined when the source is unrecognised, leaving the caller to
 * decide rather than defaulting to a league that may be wrong.
 */
export function predictionLeague(pred: ELOPrediction): 'NFL' | 'NCAAF' | undefined {
  if (pred.source === 'warren-nolan') return 'NCAAF'
  if (pred.source === 'nfelo') return 'NFL'
  return undefined
}
