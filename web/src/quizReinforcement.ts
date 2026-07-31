export type ReinforcementQuestion = {
  itemId: string;
  attemptKind?: "plan" | "reinforcement" | "independent";
};

export function appendReinforcementQuestion<T extends ReinforcementQuestion>(
  questions: T[],
  currentQuestion: T,
  currentIndex: number,
  maximumQuestions = 20
): T[] {
  if (questions.length >= maximumQuestions) return questions;
  const alreadyQueued = questions.some((question, index) =>
    index > currentIndex
    && question.itemId === currentQuestion.itemId
    && question.attemptKind === "reinforcement"
  );
  if (alreadyQueued) return questions;
  return [...questions, { ...currentQuestion, attemptKind: "reinforcement" }];
}
