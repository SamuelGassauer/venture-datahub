export type DedupEntityType = "company" | "investor" | "round";

export type DedupPair = {
  entityType: DedupEntityType;
  leftKey: string;
  rightKey: string;
  tier: 1 | 2 | 3;
  score: number;
  reasons: Record<string, unknown>;
  leftSnapshot: Record<string, unknown>;
  rightSnapshot: Record<string, unknown>;
};

export const TIER2_THRESHOLD = 0.85;
export const TIER3_THRESHOLD = 0.92;
export const ROUND_NAME_THRESHOLD = 0.8;
export const ROUND_WINDOW_DAYS = 30;
