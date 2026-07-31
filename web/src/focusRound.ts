export type FocusProgress = {
  total: number;
  roundId?: string;
  attemptCount: number;
  focusRoundItems: number;
  attemptedItemIds: string[];
};

export function firstUnattemptedQuestionIndex(
  itemIds: string[],
  attemptedItemIds: string[],
  startAfter = -1
): number {
  const attempted = new Set(attemptedItemIds);
  for (let index = startAfter + 1; index < itemIds.length; index += 1) {
    if (!attempted.has(itemIds[index])) return index;
  }
  for (let index = 0; index <= startAfter && index < itemIds.length; index += 1) {
    if (!attempted.has(itemIds[index])) return index;
  }
  return -1;
}

export function recordFocusAttempt(progress: FocusProgress, itemId: string): FocusProgress {
  if (progress.attemptedItemIds.includes(itemId)) return progress;
  const attemptedItemIds = [...progress.attemptedItemIds, itemId];
  return {
    ...progress,
    attemptedItemIds,
    attemptCount: attemptedItemIds.length
  };
}

export function isFocusRoundComplete(progress: FocusProgress | undefined): boolean {
  return Boolean(progress && progress.total > 0 && progress.attemptCount >= progress.total);
}
