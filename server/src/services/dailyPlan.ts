export const DAILY_PLAN_VERSION = 2 as const;
export const DAILY_PLAN_MAX_ITEMS = 20;
export const DAILY_PLAN_MAX_NEW_ITEMS = 10;

export type DailyPlanCandidate = {
  id: string;
  createdAt: string;
  updatedAt?: string;
  isImportant?: boolean;
  lookupStats?: {
    lastLookedUpAt?: string;
  };
  reviewState: {
    status?: string;
    wrongCount?: number;
    lastResult?: "correct" | "wrong";
    focus?: boolean;
    lastReviewedAt?: string;
    nextReviewAt?: string;
  };
};

export type DailyPlanV2 = {
  version?: typeof DAILY_PLAN_VERSION;
  date: string;
  dueItemIds: string[];
  reviewItemIds?: string[];
  newItemIds?: string[];
  completedItemIds: string[];
  createdAt: string;
  completedAt?: string;
};

export type DailyPlanPools = {
  reviewDue: DailyPlanCandidate[];
  pending: DailyPlanCandidate[];
};

export type DailyPlanSummary = {
  total: number;
  reviewCount: number;
  newCount: number;
  reviewPoolSize: number;
  pendingPoolSize: number;
};

export function partitionDailyPlanCandidates(
  items: DailyPlanCandidate[],
  date: string
): DailyPlanPools {
  const reviewDue: DailyPlanCandidate[] = [];
  const pending: DailyPlanCandidate[] = [];

  for (const item of items) {
    if (!item.reviewState.lastReviewedAt) {
      pending.push(item);
      continue;
    }
    if (item.reviewState.nextReviewAt && item.reviewState.nextReviewAt <= date) {
      reviewDue.push(item);
    }
  }

  return {
    reviewDue: reviewDue.sort(compareReviewCandidates),
    pending: pending.sort(comparePendingCandidates)
  };
}

export function createDailyPlanV2(
  items: DailyPlanCandidate[],
  date: string,
  createdAt: string
): DailyPlanV2 {
  const pools = partitionDailyPlanCandidates(items, date);
  const reviewItems = pools.reviewDue.slice(0, DAILY_PLAN_MAX_ITEMS);
  const remainingCapacity = DAILY_PLAN_MAX_ITEMS - reviewItems.length;
  const newLimit = Math.min(DAILY_PLAN_MAX_NEW_ITEMS, remainingCapacity);
  const newItems = selectPendingItems(pools.pending, newLimit);
  const reviewItemIds = reviewItems.map((item) => item.id);
  const newItemIds = newItems.map((item) => item.id);

  return {
    version: DAILY_PLAN_VERSION,
    date,
    dueItemIds: [...reviewItemIds, ...newItemIds],
    reviewItemIds,
    newItemIds,
    completedItemIds: [],
    createdAt
  };
}

export function summarizeDailyPlan(
  plan: DailyPlanV2,
  pools?: DailyPlanPools
): DailyPlanSummary {
  return {
    total: plan.dueItemIds.length,
    reviewCount: plan.reviewItemIds?.length ?? 0,
    newCount: plan.newItemIds?.length ?? 0,
    reviewPoolSize: pools?.reviewDue.length ?? plan.reviewItemIds?.length ?? 0,
    pendingPoolSize: pools?.pending.length ?? plan.newItemIds?.length ?? 0
  };
}

export function getFrozenPlanPendingIds(plan: DailyPlanV2): string[] {
  const completed = new Set(plan.completedItemIds);
  return plan.dueItemIds.filter((itemId) => !completed.has(itemId));
}

export function selectFrozenPlanItems<T extends { id: string }>(
  plan: DailyPlanV2,
  items: T[]
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return getFrozenPlanPendingIds(plan)
    .map((itemId) => byId.get(itemId))
    .filter((item): item is T => Boolean(item));
}

function selectPendingItems(
  pending: DailyPlanCandidate[],
  limit: number
): DailyPlanCandidate[] {
  if (limit <= 0) return [];

  const important = pending.filter((item) => item.isImportant);
  const ordinary = pending.filter((item) => !item.isImportant);
  const selected = important.slice(0, limit);
  const ordinarySlots = limit - selected.length;
  if (ordinarySlots <= 0) return selected;

  const oldestSlots = ordinarySlots >= 5 ? Math.max(1, Math.floor(ordinarySlots * 0.2)) : 0;
  const recentSlots = ordinarySlots - oldestSlots;
  const recent = ordinary.slice(0, recentSlots);
  const recentIds = new Set(recent.map((item) => item.id));
  const oldest = [...ordinary]
    .sort((a, b) => compareIso(a.createdAt, b.createdAt) || a.id.localeCompare(b.id))
    .filter((item) => !recentIds.has(item.id))
    .slice(0, oldestSlots);

  return [...selected, ...recent, ...oldest].slice(0, limit);
}

function compareReviewCandidates(a: DailyPlanCandidate, b: DailyPlanCandidate): number {
  const focusDifference = Number(isFocusCandidate(b)) - Number(isFocusCandidate(a));
  if (focusDifference !== 0) return focusDifference;
  const wrongDifference = Number(b.reviewState.lastResult === "wrong")
    - Number(a.reviewState.lastResult === "wrong");
  if (wrongDifference !== 0) return wrongDifference;
  const dueDifference = compareIso(
    a.reviewState.nextReviewAt ?? "9999-12-31",
    b.reviewState.nextReviewAt ?? "9999-12-31"
  );
  if (dueDifference !== 0) return dueDifference;
  const wrongCountDifference = (b.reviewState.wrongCount ?? 0) - (a.reviewState.wrongCount ?? 0);
  return wrongCountDifference || a.id.localeCompare(b.id);
}

function comparePendingCandidates(a: DailyPlanCandidate, b: DailyPlanCandidate): number {
  const importantDifference = Number(Boolean(b.isImportant)) - Number(Boolean(a.isImportant));
  if (importantDifference !== 0) return importantDifference;
  const lookupDifference = compareIso(
    b.lookupStats?.lastLookedUpAt ?? b.createdAt,
    a.lookupStats?.lastLookedUpAt ?? a.createdAt
  );
  return lookupDifference || b.id.localeCompare(a.id);
}

function isFocusCandidate(item: DailyPlanCandidate): boolean {
  return item.reviewState.focus === true;
}

function compareIso(a: string, b: string): number {
  return a.localeCompare(b);
}
