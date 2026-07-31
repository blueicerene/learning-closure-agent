export type QuizProgressMode = "due" | "all" | "wrong" | "focus";

export type DailyPlanProgress = {
  dailyPlanTotal: number;
  dailyPlanCompleted: number;
};

export function quizProgress(
  mode: QuizProgressMode,
  localCompleted: number,
  localTotal: number,
  dailyPlan: DailyPlanProgress
): { completed: number; total: number } {
  if (mode !== "due") {
    return {
      completed: Math.max(0, localCompleted),
      total: Math.max(0, localTotal)
    };
  }

  const total = Math.max(0, dailyPlan.dailyPlanTotal);
  return {
    completed: Math.min(total, Math.max(0, dailyPlan.dailyPlanCompleted)),
    total
  };
}
