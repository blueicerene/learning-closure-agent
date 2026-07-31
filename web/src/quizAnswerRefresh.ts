type QuizAnswerRefreshLoaders = {
  month?: string;
  loadItems: () => Promise<void>;
  loadLearningStatus: () => Promise<void>;
  loadCalendar: (month?: string) => Promise<void>;
  loadFocusAvailability: () => Promise<void>;
};

export async function refreshAfterQuizAnswer({
  month,
  loadItems,
  loadLearningStatus,
  loadCalendar,
  loadFocusAvailability
}: QuizAnswerRefreshLoaders): Promise<void> {
  await Promise.all([
    loadItems(),
    loadLearningStatus(),
    loadCalendar(month),
    loadFocusAvailability()
  ]);
}
