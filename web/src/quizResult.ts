export type QuizExample = {
  sentence: string;
  translation?: string;
};

export type QuizResultQuestion = {
  itemId: string;
  term: string;
  correctDefinition: string;
  options: string[];
  phonetic?: string;
  legalContext?: string;
  examples: QuizExample[];
};

export type QuizResultFixtureMode = "correct" | "wrong" | "missing";

export function quizResultFixture(mode: QuizResultFixtureMode): QuizResultQuestion {
  const hasDetails = mode !== "missing";
  return {
    itemId: `fixture-${mode}`,
    term: "precedent",
    correctDefinition: "A prior judicial decision used as authority when deciding a later case.",
    options: [
      "A prior judicial decision used as authority when deciding a later case.",
      "A private agreement that ends a criminal prosecution.",
      "A statute that automatically expires after one year.",
      "A court officer responsible for collecting taxes."
    ],
    phonetic: "/ˈpresɪdənt/",
    legalContext: hasDetails
      ? "在判例法体系中，先例用于指导法院处理事实或法律问题相近的后续案件。"
      : undefined,
    examples: hasDetails
      ? [{
          sentence: "The court followed the precedent established in the earlier appeal.",
          translation: "法院遵循了先前上诉案件确立的先例。"
        }]
      : []
  };
}

export function quizResultFallbacks(question: QuizResultQuestion): {
  legalContext: string;
  examples: QuizExample[];
  hasLegalContext: boolean;
  hasExamples: boolean;
} {
  const legalContext = question.legalContext?.trim() ?? "";
  const examples = question.examples.filter((example) => example.sentence.trim());
  return {
    legalContext: legalContext || "暂无法律语境",
    examples,
    hasLegalContext: Boolean(legalContext),
    hasExamples: examples.length > 0
  };
}
