export type FallbackQualityDecision = "confirmed" | "repair" | "pending-review";

export type FallbackQualityAudit = {
  term: string;
  expectedPartOfSpeech: string;
  decision: FallbackQualityDecision;
  reasons: string[];
  repairedDefinition?: string;
  repairedChineseDefinition?: string;
};

type CuratedFallbackRule = Omit<FallbackQualityAudit, "term">;

const curatedFallbackRules: Record<string, CuratedFallbackRule> = {
  authoritative: {
    expectedPartOfSpeech: "adjective",
    decision: "confirmed",
    reasons: ["释义、词性和法律语境一致。"]
  },
  capacity: {
    expectedPartOfSpeech: "noun",
    decision: "repair",
    reasons: ["现有释义是一般物理容量，未表达词条所用的法律行为能力。"],
    repairedDefinition: "The legal ability of a person or entity to hold rights, incur duties, or enter into binding transactions.",
    repairedChineseDefinition: "法律行为能力；个人或实体享有权利、承担义务或订立有约束力交易的资格。"
  },
  consent: {
    expectedPartOfSpeech: "noun",
    decision: "confirmed",
    reasons: ["释义与自愿同意的法律语境一致。"]
  },
  "court-martial": {
    expectedPartOfSpeech: "noun",
    decision: "confirmed",
    reasons: ["释义、词头和军事法律语境一致。"]
  },
  devoted: {
    expectedPartOfSpeech: "adjective",
    decision: "confirmed",
    reasons: ["释义与“专用于”的法律语境一致。"]
  },
  inequitable: {
    expectedPartOfSpeech: "adjective",
    decision: "confirmed",
    reasons: ["释义与衡平法上的不公平含义一致。"]
  },
  infractions: {
    expectedPartOfSpeech: "plural noun",
    decision: "confirmed",
    reasons: ["复数词形、轻微违法释义和例句一致。"]
  },
  judicial: {
    expectedPartOfSpeech: "adjective",
    decision: "repair",
    reasons: ["现有释义描述 judicial branch 这一名词概念，不是形容词 judicial。"],
    repairedDefinition: "Relating to courts, judges, or the administration of justice.",
    repairedChineseDefinition: "司法的；与法院、法官或司法行政有关的。"
  },
  municipal: {
    expectedPartOfSpeech: "adjective",
    decision: "repair",
    reasons: ["现有释义实际对应 municipal bond，词头和词性均不匹配。"],
    repairedDefinition: "Relating to a city, town, or other local government, including its powers, laws, and institutions.",
    repairedChineseDefinition: "市政的；与城市、城镇或其他地方政府及其权力、法规和机构有关的。"
  },
  postpone: {
    expectedPartOfSpeech: "verb",
    decision: "confirmed",
    reasons: ["动词释义与延后审判或听证的法律语境一致。"]
  },
  substitute: {
    expectedPartOfSpeech: "noun",
    decision: "confirmed",
    reasons: ["当前保存义项为名词，释义和法律语境一致。"]
  },
  tribunals: {
    expectedPartOfSpeech: "plural noun",
    decision: "confirmed",
    reasons: ["复数词形、裁判机构释义和法律语境一致。"]
  },
  venue: {
    expectedPartOfSpeech: "noun",
    decision: "repair",
    reasons: ["现有释义是演出或体育场地，不是诉讼中的审理地点。"],
    repairedDefinition: "The legally proper place or jurisdiction in which a case is heard.",
    repairedChineseDefinition: "审判地点；依法适合审理案件的地点或司法管辖区。"
  }
};

export const CURATED_FALLBACK_TERMS = Object.freeze(
  Object.keys(curatedFallbackRules)
);

export function auditFallbackDictionaryItem(item: {
  term: string;
  definition: string;
  legalContext?: string;
}): FallbackQualityAudit {
  const term = item.term.trim().toLowerCase();
  const curated = curatedFallbackRules[term];
  if (!curated) {
    return {
      term: item.term,
      expectedPartOfSpeech: "unknown",
      decision: "pending-review",
      reasons: ["没有经过人工确认的词性与法律义基准，暂停出题，避免自动猜改。"]
    };
  }

  const reasons = [...curated.reasons];
  if (!item.legalContext?.trim()) {
    reasons.push("缺少法律语境。");
    return {
      term: item.term,
      expectedPartOfSpeech: curated.expectedPartOfSpeech,
      decision: "pending-review",
      reasons
    };
  }

  return {
    term: item.term,
    ...curated,
    reasons
  };
}
