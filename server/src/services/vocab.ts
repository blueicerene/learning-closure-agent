import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

export type VocabStatus = "new" | "learning" | "review" | "mastered";
export type VocabResult = "correct" | "wrong";

export type ReviewState = {
  status: VocabStatus;
  correctStreak: number;
  wrongCount: number;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  lastResult?: VocabResult;
};

export type VocabItem = {
  id: string;
  term: string;
  definition: string;
  chineseDefinition?: string;
  legalContext?: string;
  lookupQuality?: "ai-legal" | "legal-glossary" | "saved" | "reference" | "dictionary";
  sourceLabel?: string;
  lookupWarning?: string;
  phonetic?: string;
  pronunciation?: string;
  legalNote?: LegalEnglishNote;
  sourceText: string;
  createdAt: string;
  updatedAt: string;
  reviewState: ReviewState;
};

export type VocabStore = {
  version: "v0.1";
  updatedAt: string;
  items: VocabItem[];
};

export type ImportFailure = {
  line: number;
  text: string;
  reason: string;
};

export type ImportResult = {
  imported: number;
  updated: number;
  failed: ImportFailure[];
  items: VocabItem[];
};

export type VocabReviewQuestion = {
  itemId: string;
  term: string;
  correctDefinition: string;
  options: string[];
  reviewState: ReviewState;
};

export type VocabReviewResponse = {
  date: string;
  canStart: boolean;
  reason?: string;
  questions: VocabReviewQuestion[];
};

export type VocabStats = {
  total: number;
  dueToday: number;
  tomorrow: number;
  wrong: number;
  learning: number;
  reviewed: number;
  mastered: number;
  needsReview: number;
};

export type QualityBackfillResult = {
  scanned: number;
  updated: number;
  needsReview: number;
  legalGlossary: number;
  saved: number;
};

export type QualityActionResult = {
  item: VocabItem;
  action: "marked-ok" | "rechecked" | "updated";
};

export type VocabItemUpdate = {
  term: string;
  definition: string;
  chineseDefinition?: string;
  legalContext?: string;
  phonetic?: string;
  pronunciation?: string;
};

export type ReviewMode = "due" | "all" | "wrong";

export type DictionaryEntry = {
  term: string;
  definition: string;
  chineseDefinition?: string;
  legalContext?: string;
  lookupQuality?: "ai-legal" | "legal-glossary" | "saved" | "reference" | "dictionary";
  sourceLabel?: string;
  lookupWarning?: string;
  phonetic?: string;
  pronunciation?: string;
  audioUrl?: string;
  legalNote?: LegalEnglishNote;
};

export type DictionaryLookupResult = DictionaryEntry & {
  found: boolean;
  source: "online";
};

export type SaveDictionaryEntryResult = {
  item: VocabItem;
  created: boolean;
};

export type LegalEnglishNote = {
  chineseMeaning: string;
  legalRegister: string;
  contextExplanation: string;
  pattern?: string;
  examples: {
    sentence: string;
    translation: string;
  }[];
  comparison?: {
    term: string;
    meaning: string;
    usage: string;
  }[];
};

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const emptyStore: VocabStore = {
  version: "v0.1",
  updatedAt: "",
  items: []
};
const dictionaryLookupCache = new Map<string, DictionaryEntry | null>();

const knownChineseDefinitions: Record<string, string> = {
  "maritime law": "海商法；海事法",
  "admiralty law": "海商法；海事法",
  jury: "陪审团",
  juror: "陪审员",
  "trial by jury": "陪审团审判",
  judge: "法官",
  court: "法院；法庭",
  tribunal: "裁判机构；审裁处",
  tribunals: "裁判机构；审裁处",
  bail: "保释；保释金",
  "bail hearing": "保释听证；保释聆讯",
  "bail hearings": "保释听证；保释聆讯",
  hearing: "听证；审理",
  hearings: "听证；审理",
  adjourn: "休庭；延期；推迟审理",
  adjourned: "已休庭；已延期；已推迟审理",
  adjournment: "休庭；延期审理",
  postpone: "推迟；延期",
  postponed: "已推迟；已延期",
  layperson: "非法律专业人士；普通人",
  laypeople: "非法律专业人士；普通人",
  layman: "非专业人士；普通人",
  laywoman: "非专业人士；普通人",
  plaintiff: "原告",
  defendant: "被告",
  appellant: "上诉人",
  respondent: "被上诉人；答辩人",
  claimant: "请求人；索赔人",
  counsel: "律师；法律顾问",
  panel: "合议庭；审判小组",
  panels: "合议庭；审判小组",
  "panel of judges": "合议庭；审判小组",
  "panels of judges": "合议庭；审判小组",
  precedent: "判例；先例",
  statute: "成文法；法规",
  regulation: "规章；条例",
  jurisdiction: "管辖权；司法管辖区",
  "quasi-criminal matter": "准刑事事项",
  "quasi-criminal matters": "准刑事事项",
  warrant: "令状；搜查令；逮捕令",
  warrants: "令状；搜查令；逮捕令",
  wiretap: "电话监听；通讯监听",
  "wiretap warrant": "通讯监听令；电话监听令",
  "wiretap warrants": "通讯监听令；电话监听令",
  "sign wiretap warrant": "签发通讯监听令",
  "sign wiretap warrants": "签发通讯监听令",
  imposition: "施加；征收；处罚的施加",
  "imposition of punishment": "处罚的施加；惩罚的施加",
  punishment: "处罚；惩罚",
  penalty: "处罚；罚金；罚则",
  fine: "罚款",
  infraction: "违规；违法行为",
  infractions: "违规；违法行为",
  "license infraction": "执照违规",
  "license infractions": "执照违规",
  "parking ticket": "停车罚单",
  "parking tickets": "停车罚单",
  impartial: "公正的；不偏不倚的",
  impartiality: "公正性；不偏不倚",
  independent: "独立的",
  "impartial tribunal": "公正的审裁机构；公正的法庭",
  "independent and impartial tribunal": "独立且公正的法庭；独立且公正的审裁机构",
  "court of appeal": "上诉法院",
  "courts of appeal": "上诉法院",
  "new trial": "重新审判",
  "order a new trial": "命令重新审判；发回重审",
  authoritative: "权威的；有权威依据的",
  hierarchy: "等级制度；层级结构",
  ergo: "因此；所以；由此可见",
  "federal paramountcy": "联邦优先原则",
  "paramountcy (canada)": "加拿大宪法中的联邦优先原则",
  "doctrine of federal paramountcy": "联邦优先原则",
  "interjurisdictional immunity": "管辖权间豁免原则",
  "provincial law": "省级法律",
  "federal law": "联邦法律",
  inoperative: "不发生效力的；不可执行的",
  promulgated: "正式颁布；公布",
  legislature: "立法机关",
  parliament: "议会",
  lawful: "合法的；依法的",
  legality: "合法性",
  lawfulness: "合法性；守法性",
  legal: "法律的；合法的",
  legitimate: "正当的；合法的",
  merits: "案件实体问题；实质理由",
  "enabling act": "授权法",
  "by convention": "按照宪政惯例",
  "discretionary decision": "自由裁量决定",
  "designated agents": "指定代理人",
  "executive power": "行政权",
  "strike down laws": "宣告法律无效",
  "sever laws": "切除无效部分",
  "reinterpret laws": "重新解释法律",
  tavern: "酒馆；持牌酒类营业场所",
  auctioneer: "拍卖师；拍卖商",
  solemnization: "依法举行婚礼；正式缔结",
  charity: "慈善机构；慈善事业",
  "charity / charities": "慈善机构；慈善事业"
};

const builtInDictionary: Record<string, DictionaryEntry> = {
  "strike down laws": {
    term: "strike down laws",
    definition: "To declare that legislation is invalid and has no legal effect.",
    pronunciation: "strike down laws"
  },
  "sever laws": {
    term: "sever laws",
    definition: "To remove an invalid part of a law while leaving the rest in force.",
    pronunciation: "SEV-er laws"
  },
  "reinterpret laws": {
    term: "reinterpret laws",
    definition: "To give a law a new legal meaning so it can operate validly.",
    pronunciation: "ree-in-TUR-prit laws"
  },
  layperson: {
    term: "layperson",
    definition: "A person who is not a lawyer or specialist in the relevant legal field.",
    phonetic: "/ˈleɪˌpɜːrsən/",
    pronunciation: "LAY-pur-suhn"
  },
  imposition: {
    term: "imposition",
    definition: "The act of imposing a duty, penalty, tax, or legal consequence.",
    phonetic: "/ˌɪmpəˈzɪʃən/",
    pronunciation: "im-puh-ZISH-un"
  },
  impartial: {
    term: "impartial",
    definition: "Treating all parties equally and without bias, especially in a judicial or decision-making role.",
    phonetic: "/ɪmˈpɑːrʃəl/",
    pronunciation: "im-PAR-shuhl"
  },
  bail: {
    term: "bail",
    definition: "The temporary release of an accused person before trial, often subject to conditions or security.",
    phonetic: "/beɪl/",
    pronunciation: "bail"
  },
  "bail hearing": {
    term: "bail hearing",
    definition: "A court hearing where a judge decides whether an accused person should be released before trial and on what conditions.",
    pronunciation: "bail hearing"
  },
  "bail hearings": {
    term: "bail hearings",
    definition: "Court hearings where judges decide whether accused persons should be released before trial and on what conditions.",
    pronunciation: "bail hearings"
  },
  "independent and impartial tribunal": {
    term: "independent and impartial tribunal",
    definition: "A court or decision-maker that is free from outside influence and treats the parties without bias.",
    pronunciation: "in-duh-PEN-duhnt and im-PAR-shuhl try-BYOO-nuhl"
  },
  "court of appeal": {
    term: "court of appeal",
    definition: "A higher court that reviews decisions made by lower courts.",
    pronunciation: "court of appeal"
  },
  "new trial": {
    term: "new trial",
    definition: "A fresh trial ordered after a court sets aside or reopens an earlier trial result.",
    pronunciation: "new trial"
  },
  "promulgated": {
    term: "promulgated",
    definition: "Formally issued or officially put into legal effect.",
    phonetic: "/ˈprɑːməlˌɡeɪtɪd/",
    pronunciation: "PRAH-muhl-gay-tid"
  },
  "duly": {
    term: "duly",
    definition: "Done properly, lawfully, and in accordance with required procedure.",
    phonetic: "/ˈduːli/",
    pronunciation: "DOO-lee"
  },
  "legislature": {
    term: "legislature",
    definition: "The law-making body of a jurisdiction.",
    phonetic: "/ˈledʒɪsleɪtʃər/",
    pronunciation: "LEJ-is-lay-cher"
  },
  "unicameral representative legislature": {
    term: "unicameral representative legislature",
    definition: "A representative law-making body made up of a single chamber.",
    pronunciation: "yoo-ni-KAM-er-ul rep-ri-ZEN-tuh-tiv LEJ-is-lay-cher"
  },
  "merits": {
    term: "merits",
    definition: "The substantive legal issues in a case, rather than procedural matters.",
    phonetic: "/ˈmerɪts/",
    pronunciation: "MAIR-its"
  },
  "enabling act": {
    term: "enabling Act",
    definition: "A statute that grants authority to make rules or exercise powers.",
    pronunciation: "en-AY-bling act"
  },
  "by convention": {
    term: "by convention",
    definition: "According to an accepted constitutional practice rather than a written rule.",
    pronunciation: "by kun-VEN-shun"
  },
  "discretionary decision": {
    term: "discretionary decision",
    definition: "A decision made by an official who has legal authority to choose between options.",
    pronunciation: "dis-KRESH-uh-nair-ee dih-SIZH-un"
  },
  "designated agents": {
    term: "designated agents",
    definition: "Persons formally appointed to act on behalf of another person or authority.",
    pronunciation: "DEZ-ig-nay-tid AY-jents"
  },
  "panel": {
    term: "panel",
    definition: "A group of judges or decision-makers who hear and decide a case together.",
    chineseDefinition: "合议庭；审判小组"
  },
  "panels": {
    term: "panels",
    definition: "Groups of judges or decision-makers who hear and decide cases together.",
    chineseDefinition: "合议庭；审判小组"
  },
  "panel of judges": {
    term: "panel of judges",
    definition: "A group of judges assigned to hear and decide a case together.",
    chineseDefinition: "合议庭；审判小组"
  },
  "panels of judges": {
    term: "panels of judges",
    definition: "Groups of judges assigned to hear and decide cases together.",
    chineseDefinition: "合议庭；审判小组"
  },
  "quasi-criminal matter": {
    term: "quasi-criminal matter",
    definition: "A regulatory or statutory matter that is not a true criminal prosecution but may involve penalties or enforcement proceedings.",
    chineseDefinition: "准刑事事项"
  },
  "quasi-criminal matters": {
    term: "quasi-criminal matters",
    definition: "Regulatory or statutory matters that are not true criminal prosecutions but may involve penalties or enforcement proceedings.",
    chineseDefinition: "准刑事事项"
  },
  "wiretap": {
    term: "wiretap",
    definition: "An interception of telephone or electronic communications, usually requiring legal authorization.",
    chineseDefinition: "电话监听；通讯监听"
  },
  "wiretap warrant": {
    term: "wiretap warrant",
    definition: "A judicial authorization permitting law enforcement to intercept communications.",
    chineseDefinition: "通讯监听令；电话监听令"
  },
  "wiretap warrants": {
    term: "wiretap warrants",
    definition: "Judicial authorizations permitting law enforcement to intercept communications.",
    chineseDefinition: "通讯监听令；电话监听令"
  },
  "sign wiretap warrant": {
    term: "sign wiretap warrant",
    definition: "To formally authorize a wiretap warrant by signing it.",
    chineseDefinition: "签发通讯监听令"
  },
  "sign wiretap warrants": {
    term: "sign wiretap warrants",
    definition: "To formally authorize wiretap warrants by signing them.",
    chineseDefinition: "签发通讯监听令"
  },
  "vet": {
    term: "vet",
    definition: "To examine a person or application carefully before approval.",
    phonetic: "/vet/",
    pronunciation: "vet"
  },
  "vet (vets applicants)": {
    term: "vet (vets applicants)",
    definition: "To examine applicants carefully before approving or accepting them.",
    pronunciation: "vet applicants"
  },
  "legal": {
    term: "legal",
    definition: "Permitted by law or connected with the law.",
    phonetic: "/ˈliːɡəl/",
    pronunciation: "LEE-gul"
  },
  "lawful": {
    term: "lawful",
    definition: "Authorized by law and not prohibited by legal rules.",
    phonetic: "/ˈlɔːfəl/",
    pronunciation: "LAW-ful"
  },
  "legitimate": {
    term: "legitimate",
    definition: "Proper, justified, or recognized as valid under law.",
    phonetic: "/lɪˈdʒɪtəmət/",
    pronunciation: "li-JIT-uh-mit"
  },
  "legality": {
    term: "legality",
    definition: "The quality of being permitted or valid under law.",
    phonetic: "/liːˈɡæləti/",
    pronunciation: "lee-GAL-uh-tee"
  },
  "lawfulness": {
    term: "lawfulness",
    definition: "The condition of complying with the law.",
    pronunciation: "LAW-ful-ness"
  },
  "executive power": {
    term: "executive power",
    definition: "The authority to administer and enforce laws through government action.",
    pronunciation: "ig-ZEK-yuh-tiv POW-er"
  },
  "parliament": {
    term: "Parliament",
    definition: "The legislative body that makes statutes in a parliamentary system.",
    phonetic: "/ˈpɑːrləmənt/",
    pronunciation: "PAR-luh-ment"
  },
  "charity": {
    term: "charity",
    definition: "An organization or activity established for legally recognized charitable purposes.",
    phonetic: "/ˈtʃærəti/",
    pronunciation: "CHAIR-uh-tee"
  },
  "charity / charities": {
    term: "charity / charities",
    definition: "Organizations or activities established for legally recognized charitable purposes.",
    pronunciation: "CHAIR-uh-tee / CHAIR-uh-teez"
  },
  "tavern": {
    term: "tavern",
    definition: "A place licensed or regulated for selling alcoholic drinks to the public.",
    phonetic: "/ˈtævərn/",
    pronunciation: "TAV-ern"
  },
  "auctioneer": {
    term: "auctioneer",
    definition: "A person who conducts public sales by accepting bids from buyers.",
    phonetic: "/ˌɔːkʃəˈnɪr/",
    pronunciation: "awk-shuh-NEER"
  },
  "solemnization": {
    term: "solemnization",
    definition: "The formal performance of a ceremony, especially a marriage ceremony, in the manner required by law.",
    phonetic: "/ˌsɑːləmnəˈzeɪʃən/",
    pronunciation: "sah-lum-nuh-ZAY-shun"
  },
  "ergo": {
    term: "ergo",
    definition: "Therefore; as a result.",
    phonetic: "/ˈɜːrɡoʊ/",
    pronunciation: "ER-go"
  }
};

const legalEnglishNotes: Record<string, LegalEnglishNote> = {
  "bail hearings": {
    chineseMeaning: "保释听证；保释聆讯",
    legalRegister: "Criminal procedure term. In Canadian criminal law, this usually refers to the court hearing where release before trial is considered.",
    contextExplanation: "A bail hearing is not the trial itself. The judge or justice decides whether the accused should stay in custody or be released before trial, and if released, what conditions should apply.",
    pattern: "bail hearing = hearing about pre-trial release, not a hearing about guilt.",
    examples: [
      {
        sentence: "At bail hearings, the court considers whether the accused can be released safely before trial.",
        translation: "在保释听证中，法院会考虑被告人在审判前是否可以安全获释。"
      },
      {
        sentence: "The Crown may oppose release at a bail hearing if there are concerns about public safety or attendance in court.",
        translation: "如果担心公共安全或被告人不会出庭，控方可能会在保释听证中反对释放。"
      }
    ],
    comparison: [
      {
        term: "bail",
        meaning: "保释；保释金",
        usage: "The release arrangement or security."
      },
      {
        term: "bail hearing",
        meaning: "保释听证",
        usage: "The court process for deciding release before trial."
      },
      {
        term: "trial",
        meaning: "审判",
        usage: "The proceeding where guilt or liability is determined."
      }
    ]
  },
  "bail hearing": {
    chineseMeaning: "保释听证；保释聆讯",
    legalRegister: "Criminal procedure term. In Canadian criminal law, this usually refers to the court hearing where release before trial is considered.",
    contextExplanation: "A bail hearing is not the trial itself. The judge or justice decides whether the accused should stay in custody or be released before trial, and if released, what conditions should apply.",
    pattern: "bail hearing = hearing about pre-trial release, not a hearing about guilt.",
    examples: [
      {
        sentence: "The accused appeared for a bail hearing the morning after arrest.",
        translation: "被告人在被捕后的第二天上午出席了保释听证。"
      }
    ],
    comparison: [
      {
        term: "bail",
        meaning: "保释；保释金",
        usage: "The release arrangement or security."
      },
      {
        term: "trial",
        meaning: "审判",
        usage: "The proceeding where guilt or liability is determined."
      }
    ]
  },
  ergo: {
    chineseMeaning: "因此；所以；由此可见",
    legalRegister: "Formal legal English with Latin roots. Common in logic, philosophy, legal reasoning, case analysis, and constitutional reasoning.",
    contextExplanation: "`ergo federal` means `therefore federal`: the speaker is concluding that the matter falls within federal jurisdiction.",
    pattern: "A, ergo B. = A, therefore B.",
    examples: [
      {
        sentence: "Immigration is listed under s.91, ergo it falls within federal jurisdiction.",
        translation: "移民事务列于《1867年宪法法案》第91条，因此属于联邦管辖。"
      },
      {
        sentence: "The matter concerns a national regulatory scheme, ergo federal.",
        translation: "该事项涉及全国性监管方案，因此属于联邦权限。"
      }
    ],
    comparison: [
      {
        term: "therefore",
        meaning: "因此",
        usage: "Most common and neutral."
      },
      {
        term: "thus",
        meaning: "因此",
        usage: "Common in academic writing."
      },
      {
        term: "hence",
        meaning: "因此",
        usage: "Formal or academic."
      },
      {
        term: "ergo",
        meaning: "因此；由此可见",
        usage: "Formal, logical, legal, philosophical; has a Latin flavor."
      }
    ]
  }
};

export async function getVocabItems(): Promise<{ items: VocabItem[]; stats: VocabStats }> {
  const store = await readStore();
  return {
    items: sortItems(store.items),
    stats: getStats(store.items, todayKey())
  };
}

export async function backfillVocabQuality(): Promise<QualityBackfillResult> {
  const store = await readStore();
  let updated = 0;
  let needsReview = 0;
  let legalGlossary = 0;
  let saved = 0;

  for (const item of store.items) {
    const inferred = inferLegacyQuality(item);
    const changed = item.lookupQuality !== inferred.lookupQuality
      || item.sourceLabel !== inferred.sourceLabel
      || item.lookupWarning !== inferred.lookupWarning;

    if (changed) {
      item.lookupQuality = inferred.lookupQuality;
      item.sourceLabel = inferred.sourceLabel;
      item.lookupWarning = inferred.lookupWarning;
      item.updatedAt = new Date().toISOString();
      updated += 1;
    }

    if (needsDefinitionReview(item)) needsReview += 1;
    if (item.lookupQuality === "legal-glossary") legalGlossary += 1;
    if (item.lookupQuality === "saved") saved += 1;
  }

  if (updated > 0) {
    store.updatedAt = new Date().toISOString();
    await writeStore(store);
  }

  return {
    scanned: store.items.length,
    updated,
    needsReview,
    legalGlossary,
    saved
  };
}

export async function importVocabText(text: string): Promise<ImportResult> {
  const parsed = parseVocabText(text);
  const store = await readStore();
  const now = new Date().toISOString();
  const existingByTerm = new Map(store.items.map((item) => [normalizeTerm(item.term), item]));
  const importedItems: VocabItem[] = [];
  let imported = 0;
  let updated = 0;

  for (const entry of parsed.entries) {
    const normalized = normalizeTerm(entry.term);
    const existing = existingByTerm.get(normalized);

    if (existing) {
      existing.term = entry.term;
      existing.definition = entry.definition;
      existing.chineseDefinition = entry.chineseDefinition || existing.chineseDefinition || getKnownChineseDefinition(entry.term);
      existing.legalContext = entry.legalContext || existing.legalContext;
      existing.phonetic = entry.phonetic;
      existing.pronunciation = entry.pronunciation;
      existing.legalNote = entry.legalNote;
      existing.sourceText = entry.sourceText;
      existing.updatedAt = now;
      importedItems.push(existing);
      updated += 1;
      continue;
    }

    const item: VocabItem = {
      id: randomUUID(),
      term: entry.term,
      definition: entry.definition,
      chineseDefinition: entry.chineseDefinition,
      legalContext: entry.legalContext,
      phonetic: entry.phonetic,
      pronunciation: entry.pronunciation,
      legalNote: entry.legalNote,
      sourceText: entry.sourceText,
      createdAt: now,
      updatedAt: now,
      reviewState: createNewReviewState()
    };
    store.items.push(item);
    existingByTerm.set(normalized, item);
    importedItems.push(item);
    imported += 1;
  }

  store.updatedAt = now;
  await writeStore(store);

  return {
    imported,
    updated,
    failed: parsed.failed,
    items: importedItems
  };
}

export async function lookupDictionaryTerm(term: string): Promise<DictionaryLookupResult> {
  const normalizedTerm = trimCell(term);
  const existingEntry = await findSavedDictionaryEntry(normalizedTerm);
  if (existingEntry) {
    const enrichedEntry = await ensureChineseDefinition(existingEntry);
    if (!existingEntry.chineseDefinition && enrichedEntry.chineseDefinition) {
      await updateStoredChineseDefinition(existingEntry.term, enrichedEntry.chineseDefinition);
    }

    return {
      ...enrichedEntry,
      found: true,
      source: "online",
      lookupQuality: enrichedEntry.lookupQuality || "saved",
      sourceLabel: enrichedEntry.sourceLabel || "Saved review item"
    };
  }

  const entry = await fetchOnlineDictionaryEntry(normalizedTerm);

  if (!entry) {
    return {
      term: normalizedTerm,
      definition: "",
      found: false,
      source: "online"
    };
  }

  const enrichedEntry = await ensureChineseDefinition(entry);
  const lookupQuality = enrichedEntry.lookupQuality || "dictionary";

  return {
    ...enrichedEntry,
    found: true,
    source: "online",
    lookupQuality,
    sourceLabel: enrichedEntry.sourceLabel || "Fallback dictionary",
    lookupWarning: enrichedEntry.lookupWarning || getDefaultLookupWarning(lookupQuality)
  };
}

function getDefaultLookupWarning(quality?: DictionaryEntry["lookupQuality"]): string | undefined {
  if (quality === "dictionary") return "This is a fallback definition. Legal meaning may need AI legal lookup.";
  if (quality === "reference") return "This is a reference summary, not a concise dictionary definition.";
  return undefined;
}

async function findSavedDictionaryEntry(term: string): Promise<DictionaryEntry | null> {
  const normalized = normalizeTerm(term);
  if (!normalized) return null;

  const builtInEntry = getBuiltInEntry(normalized);
  if (builtInEntry && shouldPreferBuiltInEntry(normalized)) {
    return {
      ...builtInEntry,
      chineseDefinition: builtInEntry.chineseDefinition || getKnownChineseDefinition(normalized),
      legalNote: builtInEntry.legalNote || getLegalEnglishNote(normalized),
      lookupQuality: "legal-glossary",
      sourceLabel: "Built-in legal glossary"
    };
  }

  const store = await readStore();
  const existing = store.items.find((item) => normalizeTerm(item.term) === normalized);
  if (!existing?.definition) return null;

  return {
    term: existing.term,
    definition: existing.definition,
    chineseDefinition: existing.chineseDefinition || getKnownChineseDefinition(existing.term),
    legalContext: existing.legalContext || existing.legalNote?.contextExplanation,
    lookupQuality: "saved",
    sourceLabel: "Saved review item",
    phonetic: existing.phonetic,
    pronunciation: existing.pronunciation,
    legalNote: existing.legalNote
  };
}

async function ensureChineseDefinition(entry: DictionaryEntry): Promise<DictionaryEntry> {
  if (entry.chineseDefinition?.trim()) return entry;

  return {
    ...entry,
    chineseDefinition: await getChineseDefinition(entry.term, entry.definition)
  };
}

async function updateStoredChineseDefinition(term: string, chineseDefinition: string): Promise<void> {
  const normalized = normalizeTerm(term);
  if (!normalized || !chineseDefinition.trim()) return;

  const store = await readStore();
  const existing = store.items.find((item) => normalizeTerm(item.term) === normalized);
  if (!existing || existing.chineseDefinition) return;

  existing.chineseDefinition = chineseDefinition;
  existing.updatedAt = new Date().toISOString();
  store.updatedAt = existing.updatedAt;
  await writeStore(store);
}

export async function saveDictionaryTerm(term: string): Promise<SaveDictionaryEntryResult> {
  const entry = await fetchOnlineDictionaryEntry(term);
  if (!entry) {
    throw new Error("Online dictionary term not found");
  }

  return saveDictionaryEntry(entry);
}

export async function saveDictionaryEntry(entry: DictionaryEntry): Promise<SaveDictionaryEntryResult> {
  if (isClearlyNonLegalReference(entry.term, entry.definition)) {
    throw new Error("Lookup result does not look like a legal English term");
  }

  const store = await readStore();
  const now = new Date().toISOString();
  const normalized = normalizeTerm(entry.term);
  const existing = store.items.find((item) => normalizeTerm(item.term) === normalized);
  const chineseDefinition = entry.chineseDefinition || await getChineseDefinition(entry.term, entry.definition);

  if (existing) {
    existing.term = entry.term;
    existing.definition = entry.definition;
    existing.chineseDefinition = chineseDefinition || existing.chineseDefinition;
    existing.legalContext = entry.legalContext || existing.legalContext || entry.legalNote?.contextExplanation;
    existing.lookupQuality = entry.lookupQuality || existing.lookupQuality;
    existing.sourceLabel = entry.sourceLabel || existing.sourceLabel;
    existing.lookupWarning = entry.lookupWarning || existing.lookupWarning || getDefaultLookupWarning(existing.lookupQuality);
    existing.phonetic = entry.phonetic;
    existing.pronunciation = entry.pronunciation;
    existing.legalNote = entry.legalNote;
    existing.updatedAt = now;
    if (!existing.reviewState.nextReviewAt) {
      existing.reviewState = createTomorrowReviewState(now);
    }
    store.updatedAt = now;
    await writeStore(store);
    return { item: existing, created: false };
  }

  const item: VocabItem = {
    id: randomUUID(),
    term: entry.term,
    definition: entry.definition,
    chineseDefinition,
    legalContext: entry.legalContext || entry.legalNote?.contextExplanation,
    lookupQuality: entry.lookupQuality,
    sourceLabel: entry.sourceLabel,
    lookupWarning: entry.lookupWarning || getDefaultLookupWarning(entry.lookupQuality),
    phonetic: entry.phonetic,
    pronunciation: entry.pronunciation,
    legalNote: entry.legalNote,
    sourceText: entry.term,
    createdAt: now,
    updatedAt: now,
    reviewState: createTomorrowReviewState(now)
  };

  store.items.push(item);
  store.updatedAt = now;
  await writeStore(store);
  return { item, created: true };
}

export async function markVocabQualityOk(itemId: string): Promise<QualityActionResult> {
  const store = await readStore();
  const item = store.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error("Vocabulary item not found");
  }

  const now = new Date().toISOString();
  item.lookupQuality = "saved";
  item.sourceLabel = "Manually confirmed";
  item.lookupWarning = undefined;
  item.updatedAt = now;
  store.updatedAt = now;
  await writeStore(store);

  return { item, action: "marked-ok" };
}

export async function recheckVocabItem(itemId: string): Promise<QualityActionResult> {
  const store = await readStore();
  const item = store.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error("Vocabulary item not found");
  }

  const entry = await fetchOnlineDictionaryEntry(item.term);
  if (!entry) {
    throw new Error("No updated dictionary result found");
  }
  if (isClearlyNonLegalReference(entry.term, entry.definition)) {
    throw new Error("Updated lookup result does not look like a legal English term");
  }

  const now = new Date().toISOString();
  const chineseDefinition = entry.chineseDefinition || await getChineseDefinition(entry.term, entry.definition);
  item.term = entry.term;
  item.definition = entry.definition;
  item.chineseDefinition = chineseDefinition;
  item.legalContext = entry.legalContext || entry.legalNote?.contextExplanation;
  item.lookupQuality = entry.lookupQuality;
  item.sourceLabel = entry.sourceLabel;
  item.lookupWarning = entry.lookupWarning || getDefaultLookupWarning(entry.lookupQuality);
  item.phonetic = entry.phonetic;
  item.pronunciation = entry.pronunciation;
  item.legalNote = entry.legalNote;
  item.updatedAt = now;
  store.updatedAt = now;
  await writeStore(store);

  return { item, action: "rechecked" };
}

export async function updateVocabItem(itemId: string, update: VocabItemUpdate): Promise<QualityActionResult> {
  const term = trimCell(update.term);
  const definition = cleanEnglishDefinition(update.definition);
  if (!term || !definition) {
    throw new Error("term and English definition are required");
  }

  const store = await readStore();
  const item = store.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error("Vocabulary item not found");
  }

  const now = new Date().toISOString();
  item.term = term;
  item.definition = definition;
  item.chineseDefinition = update.chineseDefinition?.trim() || item.chineseDefinition;
  item.legalContext = update.legalContext?.trim() || item.legalContext;
  item.phonetic = update.phonetic?.trim() || item.phonetic;
  item.pronunciation = update.pronunciation?.trim() || item.pronunciation;
  item.lookupQuality = "saved";
  item.sourceLabel = "Manually confirmed";
  item.lookupWarning = undefined;
  item.updatedAt = now;
  store.updatedAt = now;
  await writeStore(store);

  return { item, action: "updated" };
}

export async function deleteVocabItem(itemId: string): Promise<{ deleted: boolean }> {
  const store = await readStore();
  const nextItems = store.items.filter((item) => item.id !== itemId);
  if (nextItems.length === store.items.length) {
    return { deleted: false };
  }

  store.items = nextItems;
  store.updatedAt = new Date().toISOString();
  await writeStore(store);
  return { deleted: true };
}

export async function getVocabReview(date = todayKey(), mode: ReviewMode = "due"): Promise<VocabReviewResponse> {
  const store = await readStore();
  const reviewableItems = store.items.filter(hasEnglishDefinition);
  const definitions = uniqueDefinitions(reviewableItems);

  if (definitions.length < 4) {
    return {
      date,
      canStart: false,
      reason: "Need at least 4 vocabulary items with different definitions before starting a multiple-choice quiz.",
      questions: []
    };
  }

  const dueItems = reviewableItems
    .filter((item) => {
      if (mode === "all") return true;
      if (mode === "wrong") return isWrongQueueItem(item);
      return isDue(item, date);
    })
    .sort((a, b) => reviewPriority(a, date) - reviewPriority(b, date));

  const emptyReason = {
    all: "No vocabulary items are available for practice.",
    due: "No vocabulary items are due for review today.",
    wrong: "No wrong queue items are available for review."
  }[mode];

  return {
    date,
    canStart: dueItems.length > 0,
    reason: dueItems.length > 0 ? undefined : emptyReason,
    questions: dueItems.map((item) => createQuestion(item, reviewableItems, date))
  };
}

export async function recordVocabAnswer(request: {
  itemId: string;
  selectedDefinition: string;
  correctDefinition: string;
  isCorrect: boolean;
  answeredAt?: string;
}): Promise<VocabItem> {
  const store = await readStore();
  const item = store.items.find((candidate) => candidate.id === request.itemId);
  if (!item) {
    throw new Error("Vocabulary item not found");
  }

  if (request.correctDefinition.trim() !== item.definition) {
    throw new Error("Correct definition does not match this vocabulary item");
  }

  const answeredAt = request.answeredAt ?? new Date().toISOString();
  const answeredDate = dateKey(answeredAt);
  const nextState = request.isCorrect
    ? nextCorrectState(item.reviewState, answeredDate)
    : nextWrongState(item.reviewState, answeredDate);

  item.reviewState = nextState;
  item.updatedAt = answeredAt;
  store.updatedAt = answeredAt;
  await writeStore(store);

  return item;
}

export function parseVocabText(text: string): {
  entries: { term: string; definition: string; chineseDefinition?: string; legalContext?: string; phonetic?: string; pronunciation?: string; legalNote?: LegalEnglishNote; sourceText: string }[];
  failed: ImportFailure[];
} {
  const entries: { term: string; definition: string; chineseDefinition?: string; legalContext?: string; phonetic?: string; pronunciation?: string; legalNote?: LegalEnglishNote; sourceText: string }[] = [];
  const failed: ImportFailure[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line, index) => ({ line: normalizeLine(line), number: index + 1 }))
    .filter((item) => item.line.length > 0);

  for (const { line, number } of lines) {
    const parsed = parseLine(line);
    if (!parsed) {
      failed.push({
        line: number,
        text: line,
        reason: "Expected `term - definition`, `term: definition`, CSV, or TSV."
      });
      continue;
    }

    if (!parsed.term || !parsed.definition) {
      failed.push({
        line: number,
        text: line,
        reason: "Both term and definition are required."
      });
      continue;
    }

    entries.push({
      ...parsed,
      sourceText: line
    });
  }

  return { entries, failed };
}

function parseLine(line: string): { term: string; definition: string; legalContext?: string; phonetic?: string; pronunciation?: string; legalNote?: LegalEnglishNote } | null {
  const clean = line
    .replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, "")
    .replace(/^["']|["']$/g, "")
    .trim();

  if (!clean) return null;

  const markdownCells = parseMarkdownTableRow(clean);
  if (markdownCells.length >= 2) {
    return normalizeEntry(markdownCells[0], selectDefinitionCell(markdownCells.slice(1)));
  }

  const tabParts = clean.split("\t").map((part) => trimCell(part)).filter(Boolean);
  if (tabParts.length >= 2) {
    return normalizeEntry(tabParts[0], selectDefinitionCell(tabParts.slice(1)));
  }

  const csvParts = splitCsvLine(clean);
  if (csvParts.length >= 2) {
    return normalizeEntry(csvParts[0], selectDefinitionCell(csvParts.slice(1)));
  }

  const dashMatch = clean.match(/^(.+?)\s+[–—-]\s+(.+)$/);
  if (dashMatch) {
    return normalizeEntry(dashMatch[1], dashMatch[2]);
  }

  const colonMatch = clean.match(/^([^:：]+)[:：]\s*(.+)$/);
  if (colonMatch) {
    return normalizeEntry(colonMatch[1], colonMatch[2]);
  }

  return null;
}

function parseMarkdownTableRow(line: string): string[] {
  if (!line.includes("|")) return [];

  const cells = line
    .split("|")
    .map((cell) => trimMarkdownCell(cell))
    .filter(Boolean);

  const isSeparator = cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  return isSeparator ? [] : cells;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(trimCell(current));
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(trimCell(current));
  return cells.filter(Boolean);
}

function normalizeEntry(term = "", definition = ""): { term: string; definition: string; legalContext?: string; phonetic?: string; pronunciation?: string; legalNote?: LegalEnglishNote } {
  const normalizedTerm = trimCell(term);
  const cleanedDefinition = cleanEnglishDefinition(definition);
  const builtInEntry = getBuiltInEntry(normalizedTerm);

  return {
    term: normalizedTerm,
    definition: builtInEntry?.definition || cleanedDefinition || "",
    legalContext: builtInEntry?.legalContext || getLegalEnglishNote(normalizedTerm)?.contextExplanation,
    phonetic: builtInEntry?.phonetic,
    pronunciation: builtInEntry?.pronunciation,
    legalNote: getLegalEnglishNote(normalizedTerm)
  };
}

function selectDefinitionCell(cells: string[]): string {
  const cleaned = cells.map((cell) => cleanEnglishDefinition(cell)).filter(Boolean);
  return cleaned.find((cell) => isLikelyEnglishExplanation(cell)) ?? cleaned[0] ?? "";
}

function cleanEnglishDefinition(value: string): string {
  const raw = trimCell(value);
  if (isLegalCategoryLabel(raw)) return "";

  const trimmed = raw
    .replace(/\([^)]*[\u3400-\u9fff][^)]*\)/g, "")
    .replace(/（[^）]*[\u3400-\u9fff][^）]*）/g, "")
    .replace(/[\u3400-\u9fff][\u3400-\u9fff\s；;，,、。:：()（）-]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!trimmed || containsCjk(trimmed) || !/[a-z]/i.test(trimmed) || !isLikelyEnglishExplanation(trimmed) || looksTruncatedDefinition(trimmed)) {
    return "";
  }

  return trimmed;
}

function isLegalCategoryLabel(value: string): boolean {
  const words = value
    .toLowerCase()
    .replace(/[&/|,;:()（）-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (words.length === 0 || words.length > 8) return false;

  const categoryWords = new Set([
    "administrative",
    "charter",
    "constitutional",
    "contract",
    "criminal",
    "division",
    "drafting",
    "english",
    "equity",
    "evidence",
    "family",
    "general",
    "judicial",
    "jurisdiction",
    "law",
    "legal",
    "legislative",
    "licensing",
    "litigation",
    "powers",
    "procedure",
    "process",
    "property",
    "remedies",
    "review",
    "tort"
  ]);

  return words.every((word) => categoryWords.has(word));
}

function isLikelyEnglishExplanation(value: string): boolean {
  const words = value.match(/[a-z]+/gi) ?? [];
  return words.length >= 3;
}

function trimCell(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").replace(/\s+/g, " ");
}

function trimMarkdownCell(value: string): string {
  return trimCell(value)
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function normalizeLine(line: string): string {
  return line.replace(/\u00a0/g, " ").trim();
}

function createQuestion(item: VocabItem, items: VocabItem[], date: string): VocabReviewQuestion {
  const distractors = stableShuffle(
    uniqueDefinitions(items.filter((candidate) => candidate.id !== item.id)),
    `${item.id}:${date}`
  ).slice(0, 3);

  return {
    itemId: item.id,
    term: item.term,
    correctDefinition: item.definition,
    options: stableShuffle([item.definition, ...distractors], `${date}:${item.id}:options`),
    reviewState: item.reviewState
  };
}

function nextCorrectState(current: ReviewState, answeredDate: string): ReviewState {
  const correctStreak = current.correctStreak + 1;
  const interval = correctStreak >= 4 ? 30 : [0, 3, 7, 14][correctStreak] ?? 30;

  return {
    status: correctStreak >= 4 ? "mastered" : "review",
    correctStreak,
    wrongCount: current.wrongCount,
    lastReviewedAt: answeredDate,
    nextReviewAt: addDays(answeredDate, interval),
    lastResult: "correct"
  };
}

function nextWrongState(current: ReviewState, answeredDate: string): ReviewState {
  return {
    status: "learning",
    correctStreak: 0,
    wrongCount: current.wrongCount + 1,
    lastReviewedAt: answeredDate,
    nextReviewAt: addDays(answeredDate, 1),
    lastResult: "wrong"
  };
}

function createNewReviewState(): ReviewState {
  return {
    status: "new",
    correctStreak: 0,
    wrongCount: 0
  };
}

function createTomorrowReviewState(now: string): ReviewState {
  return {
    status: "learning",
    correctStreak: 0,
    wrongCount: 0,
    nextReviewAt: addDays(dateKey(now), 1)
  };
}

async function readStore(): Promise<VocabStore> {
  try {
    const raw = await readFile(getVocabPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<VocabStore>;

    return {
      version: "v0.1",
      updatedAt: parsed.updatedAt ?? "",
      items: Array.isArray(parsed.items) ? parsed.items.map(normalizeItem).filter(Boolean) : []
    };
  } catch {
    return { ...emptyStore, items: [] };
  }
}

async function writeStore(store: VocabStore): Promise<void> {
  const vocabPath = getVocabPath();
  await mkdir(path.dirname(vocabPath), { recursive: true });
  await writeFile(vocabPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function normalizeItem(item: unknown): VocabItem {
  const candidate = item as Partial<VocabItem>;
  const term = String(candidate.term || "").trim();
  const builtInEntry = getBuiltInEntry(term);
  const definition = cleanEnglishDefinition(String(candidate.definition || ""))
    || builtInEntry?.definition
    || "";

  return {
    id: String(candidate.id || randomUUID()),
    term,
    definition,
    chineseDefinition: candidate.chineseDefinition || getKnownChineseDefinition(term),
    legalContext: candidate.legalContext || candidate.legalNote?.contextExplanation || builtInEntry?.legalContext,
    lookupQuality: candidate.lookupQuality,
    sourceLabel: candidate.sourceLabel,
    lookupWarning: candidate.lookupWarning || getDefaultLookupWarning(candidate.lookupQuality),
    phonetic: candidate.phonetic || builtInEntry?.phonetic,
    pronunciation: candidate.pronunciation || builtInEntry?.pronunciation,
    legalNote: candidate.legalNote || getLegalEnglishNote(term),
    sourceText: String(candidate.sourceText || ""),
    createdAt: String(candidate.createdAt || new Date().toISOString()),
    updatedAt: String(candidate.updatedAt || new Date().toISOString()),
    reviewState: {
      status: candidate.reviewState?.status ?? "new",
      correctStreak: Number(candidate.reviewState?.correctStreak ?? 0),
      wrongCount: Number(candidate.reviewState?.wrongCount ?? 0),
      lastReviewedAt: candidate.reviewState?.lastReviewedAt,
      nextReviewAt: candidate.reviewState?.nextReviewAt,
      lastResult: candidate.reviewState?.lastResult
    }
  };
}

function getStats(items: VocabItem[], date: string): VocabStats {
  const tomorrow = addDays(date, 1);
  return {
    total: items.length,
    dueToday: items.filter((item) => hasEnglishDefinition(item) && isDue(item, date)).length,
    tomorrow: items.filter((item) => item.reviewState.nextReviewAt === tomorrow).length,
    wrong: items.filter(isWrongQueueItem).length,
    learning: items.filter((item) => item.reviewState.status !== "mastered").length,
    reviewed: items.filter((item) => Boolean(item.reviewState.lastReviewedAt)).length,
    mastered: items.filter((item) => item.reviewState.status === "mastered").length,
    needsReview: items.filter(needsDefinitionReview).length
  };
}

function needsDefinitionReview(item: VocabItem): boolean {
  return item.lookupQuality === "dictionary" || item.lookupQuality === "reference";
}

function inferLegacyQuality(item: VocabItem): Pick<VocabItem, "lookupQuality" | "sourceLabel" | "lookupWarning"> {
  const builtInEntry = getBuiltInEntry(item.term);
  if (builtInEntry || item.legalNote) {
    return {
      lookupQuality: "legal-glossary",
      sourceLabel: "Built-in legal glossary",
      lookupWarning: undefined
    };
  }

  if (looksLikeReferenceFallback(item)) {
    return {
      lookupQuality: "reference",
      sourceLabel: "Reference fallback",
      lookupWarning: "This old entry looks like a reference summary or non-legal result. Review before using it in quizzes."
    };
  }

  if (item.legalContext) {
    return {
      lookupQuality: "saved",
      sourceLabel: "Saved review item",
      lookupWarning: undefined
    };
  }

  return {
    lookupQuality: "dictionary",
    sourceLabel: "Fallback dictionary",
    lookupWarning: "This old entry was saved before quality tracking. Review its legal meaning before relying on it."
  };
}

function looksLikeReferenceFallback(item: VocabItem): boolean {
  const definition = item.definition.trim();
  if (!definition) return true;
  if (isClearlyNonLegalReference(item.term, definition)) return true;
  if (definition.length > 260) return true;
  if (looksTruncatedDefinition(definition)) return true;
  return false;
}

function isWrongQueueItem(item: VocabItem): boolean {
  return item.reviewState.wrongCount > 0 && item.reviewState.status !== "mastered";
}

function isDue(item: VocabItem, date: string): boolean {
  if (item.reviewState.status === "new") return true;
  if (!item.reviewState.nextReviewAt) return false;
  return item.reviewState.nextReviewAt <= date;
}

function reviewPriority(item: VocabItem, date: string): number {
  if (item.reviewState.lastResult === "wrong") return 0;
  if (item.reviewState.nextReviewAt && item.reviewState.nextReviewAt < date) return 1;
  if (item.reviewState.status === "new") return 2;
  return 3;
}

function sortItems(items: VocabItem[]): VocabItem[] {
  return [...items].sort((a, b) => a.term.localeCompare(b.term));
}

function uniqueDefinitions(items: VocabItem[]): string[] {
  return [...new Set(items.map((item) => item.definition.trim()).filter(isQuizDefinitionUsable))];
}

function hasEnglishDefinition(item: VocabItem): boolean {
  return Boolean(item.definition) && !containsCjk(item.definition) && isLikelyEnglishExplanation(item.definition) && isQuizDefinitionUsable(item.definition);
}

function isQuizDefinitionUsable(definition: string): boolean {
  const cleanDefinition = definition.trim();
  return cleanDefinition.length >= 12 && !looksTruncatedDefinition(cleanDefinition);
}

function looksTruncatedDefinition(definition: string): boolean {
  const cleanDefinition = definition.trim();
  if (/\b(?:of|a|an|the|its|to|with|by|for|from|under|in|on|or|and|valid|legal|required)\s+\.$/i.test(cleanDefinition)) return true;
  if (/\b(?:of|a|an|the|its|to|with|by|for|from|under|in|on|or|and|valid|legal|required)\s+[,.]$/i.test(cleanDefinition)) return true;
  if (/\b(?:of a|of an|of the|for a|for an|for the|to a|to an|to the|in a|in an|in the)\s*\.$/i.test(cleanDefinition)) return true;
  if (/\s[,.]$/.test(cleanDefinition)) return true;
  return false;
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function stableShuffle(values: string[], seed: string): string[] {
  return [...values].sort((a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`));
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}

function getBuiltInEntry(term: string): DictionaryEntry | undefined {
  return builtInDictionary[normalizeTerm(term)];
}

function getLegalEnglishNote(term: string): LegalEnglishNote | undefined {
  return legalEnglishNotes[normalizeTerm(term)];
}

function shouldPreferBuiltInEntry(term: string): boolean {
  return [
    "strike down laws",
    "sever laws",
    "reinterpret laws",
    "layperson",
    "laypeople",
    "layman",
    "laywoman",
    "bail",
    "bail hearing",
    "bail hearings",
    "imposition",
    "impartial",
    "impartiality",
    "impartial tribunal",
    "independent and impartial tribunal",
    "court of appeal",
    "courts of appeal",
    "new trial",
    "order a new trial",
    "panel",
    "panels",
    "panel of judges",
    "panels of judges",
    "quasi-criminal matter",
    "quasi-criminal matters",
    "wiretap",
    "wiretap warrant",
    "wiretap warrants",
    "sign wiretap warrant",
    "sign wiretap warrants"
  ].includes(normalizeTerm(term));
}

function shouldUseReferenceFallback(term: string): boolean {
  const words = normalizeTerm(term).split(" ").filter(Boolean);
  if (words.length < 2) return false;

  return words.some((word) => [
    "law",
    "legal",
    "court",
    "judge",
    "judges",
    "warrant",
    "warrants",
    "wiretap",
    "bail",
    "hearing",
    "hearings",
    "trial",
    "criminal",
    "accused",
    "release",
    "doctrine",
    "federal",
    "provincial",
    "constitutional",
    "jurisdiction",
    "tribunal",
    "parliament",
    "statute",
    "regulation"
  ].includes(word));
}

type RemoteDictionaryEntry = {
  word?: string;
  phonetic?: string;
  phonetics?: {
    text?: string;
    audio?: string;
  }[];
  meanings?: {
    partOfSpeech?: string;
    definitions?: {
      definition?: string;
    }[];
  }[];
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type OpenAILegalLookupPayload = {
  term?: string;
  englishDefinition?: string;
  chineseDefinition?: string;
  legalContext?: string;
  phonetic?: string;
  pronunciation?: string;
};

async function fetchOnlineDictionaryEntry(term: string): Promise<DictionaryEntry | null> {
  const normalizedTerm = trimCell(term);
  if (!normalizedTerm) return null;
  const cacheKey = normalizeTerm(normalizedTerm);
  if (dictionaryLookupCache.has(cacheKey)) {
    const cachedEntry = dictionaryLookupCache.get(cacheKey);
    if (!cachedEntry) return null;
    const enrichedCachedEntry = await ensureChineseDefinition(cachedEntry);
    if (enrichedCachedEntry.chineseDefinition && !cachedEntry.chineseDefinition) {
      dictionaryLookupCache.set(cacheKey, enrichedCachedEntry);
    }
    return enrichedCachedEntry;
  }

  const openAIEntry = await fetchOpenAILegalDictionaryEntry(normalizedTerm);
  if (openAIEntry) {
    dictionaryLookupCache.set(cacheKey, openAIEntry);
    return openAIEntry;
  }

  const directEntry = getBuiltInEntry(normalizedTerm);
  if (directEntry && shouldPreferBuiltInEntry(normalizedTerm)) {
    const entry = {
      ...directEntry,
      chineseDefinition: directEntry.chineseDefinition || getKnownChineseDefinition(normalizedTerm),
      legalNote: directEntry.legalNote || getLegalEnglishNote(normalizedTerm),
      lookupQuality: "legal-glossary" as const,
      sourceLabel: "Built-in legal glossary"
    };
    dictionaryLookupCache.set(cacheKey, entry);
    return entry;
  }

  const baseUrl = process.env.DICTIONARY_API_BASE_URL || "https://api.dictionaryapi.dev/api/v2/entries/en";
  let response: Response;
  try {
    response = await fetchWithTimeout(`${baseUrl}/${encodeURIComponent(normalizedTerm)}`, 1200);
  } catch {
    const fallbackEntry = shouldUseReferenceFallback(normalizedTerm)
      ? await fetchOnlineReferenceEntry(normalizedTerm)
      : null;
    dictionaryLookupCache.set(cacheKey, fallbackEntry);
    return fallbackEntry;
  }

  if (response.status === 404) {
    const referenceEntry = shouldUseReferenceFallback(normalizedTerm)
      ? await fetchOnlineReferenceEntry(normalizedTerm)
      : null;
    dictionaryLookupCache.set(cacheKey, referenceEntry);
    return referenceEntry;
  }
  if (!response.ok) {
    throw new Error(`Online dictionary lookup failed with status ${response.status}`);
  }

  const payload = await response.json() as RemoteDictionaryEntry[];
  const [firstEntry] = Array.isArray(payload) ? payload : [];
  if (!firstEntry) return null;

  const legalNote = getLegalEnglishNote(normalizedTerm);
  const builtInEntry = getBuiltInEntry(normalizedTerm);
  const phonetic = legalNote && builtInEntry?.phonetic
    ? builtInEntry.phonetic
    : firstEntry.phonetic
    || firstEntry.phonetics?.find((item) => item.text)?.text
    || undefined;
  const audioUrl = normalizeAudioUrl(firstEntry.phonetics?.find((item) => item.audio)?.audio);
  const definition = firstEntry.meanings
    ?.flatMap((meaning) => meaning.definitions ?? [])
    .find((item) => item.definition)
    ?.definition
    ?.trim();

  if (!definition) return null;

  const entry = await ensureChineseDefinition({
    term: firstEntry.word || normalizedTerm,
    definition,
    legalContext: legalNote?.contextExplanation,
    lookupQuality: "dictionary",
    sourceLabel: "Fallback dictionary",
    lookupWarning: "This is a fallback definition. Legal meaning may need AI legal lookup.",
    phonetic,
    pronunciation: phonetic,
    audioUrl,
    legalNote
  });
  dictionaryLookupCache.set(cacheKey, entry);
  return entry;
}

async function fetchOpenAILegalDictionaryEntry(term: string): Promise<DictionaryEntry | null> {
  if (!shouldUseOpenAILegalLookup()) return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const model = process.env.OPENAI_LEGAL_LOOKUP_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", 6000, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: [
              "You are a concise legal English bilingual dictionary for a Canadian law student.",
              "Return valid JSON only.",
              "Prefer the legal meaning of the term when it has a legal usage.",
              "If the term is not specifically legal, return the ordinary meaning in concise dictionary style.",
              "Do not include examples, exam tips, long classroom explanations, Markdown, or extra keys.",
              "The English definition must be one concise sentence.",
              "The Chinese definition must be concise and match the legal meaning when applicable.",
              "legalContext must be one short Chinese sentence explaining how this term is commonly understood in legal materials."
            ].join(" ")
          },
          {
            role: "user",
            content: `Term: ${term}\nReturn JSON with exactly these keys: term, englishDefinition, chineseDefinition, legalContext, phonetic, pronunciation.`
          }
        ]
      })
    });

    if (!response.ok) return null;

    const data = await response.json() as OpenAIChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as OpenAILegalLookupPayload;
    const definition = cleanEnglishDefinition(String(parsed.englishDefinition || ""));
    const chineseDefinition = String(parsed.chineseDefinition || "").trim();
    const legalContext = String(parsed.legalContext || "").trim();
    const returnedTerm = trimCell(String(parsed.term || term));

    if (!returnedTerm || !definition || !chineseDefinition || !legalContext || containsCjk(definition)) {
      return null;
    }

    return {
      term: returnedTerm,
      definition,
      chineseDefinition,
      legalContext,
      lookupQuality: "ai-legal",
      sourceLabel: "AI legal dictionary",
      phonetic: emptyToUndefined(parsed.phonetic),
      pronunciation: emptyToUndefined(parsed.pronunciation),
      legalNote: getLegalEnglishNote(returnedTerm) || getLegalEnglishNote(term)
    };
  } catch {
    return null;
  }
}

function shouldUseOpenAILegalLookup(): boolean {
  const flag = process.env.USE_OPENAI_LEGAL_LOOKUP;
  if (flag === "false") return false;
  if (flag === "true") return Boolean(process.env.OPENAI_API_KEY);
  return Boolean(process.env.OPENAI_API_KEY);
}

function emptyToUndefined(value: unknown): string | undefined {
  const text = String(value || "").trim();
  return text || undefined;
}

type WikipediaSearchResponse = {
  query?: {
    search?: {
      title?: string;
    }[];
  };
};

type WikipediaSummaryResponse = {
  title?: string;
  extract?: string;
};

type WikipediaLangLinksResponse = {
  query?: {
    pages?: Record<string, {
      langlinks?: {
        lang?: string;
        title?: string;
      }[];
    }>;
  };
};

type TranslationResponse = {
  responseData?: {
    translatedText?: string;
  };
};

type GoogleTranslationResponse = [
  [string, string, unknown, unknown][]?,
  unknown?
];

async function fetchOnlineReferenceEntry(term: string): Promise<DictionaryEntry | null> {
  try {
    const searchTerm = normalizeReferenceSearchTerm(term);
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=${encodeURIComponent(searchTerm)}`;
    const searchResponse = await fetchWithTimeout(searchUrl, 900);

    if (!searchResponse.ok) return null;

    const searchPayload = await searchResponse.json() as WikipediaSearchResponse;
    const title = searchPayload.query?.search?.[0]?.title;
    if (!title) return null;

    const summaryResponse = await fetchWithTimeout(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, 900);
    if (!summaryResponse.ok) return null;

    const summary = await summaryResponse.json() as WikipediaSummaryResponse;
    const definition = summary.extract?.trim();
    if (!definition) return null;
    if (!isLegalReferenceResult(term, summary.title || title, definition)) return null;

    return {
      term: summary.title || title,
      definition,
      chineseDefinition: await getChineseReferenceDefinition(summary.title || title) || await getChineseDefinition(term, definition),
      lookupQuality: "reference",
      sourceLabel: "Reference fallback",
      lookupWarning: "This is a reference summary, not a concise dictionary definition.",
      legalNote: getLegalEnglishNote(term)
    };
  } catch {
    return null;
  }
}

function isLegalReferenceResult(query: string, title: string, definition: string): boolean {
  const normalizedQuery = normalizeTerm(query);
  const haystack = `${title} ${definition}`.toLowerCase();
  if (isClearlyNonLegalReference(title, definition)) return false;
  const legalSignals = [
    "law",
    "legal",
    "court",
    "judge",
    "judicial",
    "jurisdiction",
    "constitutional",
    "statute",
    "case",
    "doctrine",
    "tribunal",
    "parliament",
    "federal",
    "provincial",
    "regulation",
    "criminal",
    "civil"
  ];

  if (legalSignals.some((signal) => haystack.includes(signal))) return true;

  const queryWords = normalizedQuery.split(" ").filter((word) => word.length > 2);
  const titleWords = normalizeTerm(title).split(" ");
  const titleOverlap = queryWords.filter((word) => titleWords.includes(word)).length;

  return queryWords.length > 0 && titleOverlap === queryWords.length;
}

function isClearlyNonLegalReference(title: string, definition: string): boolean {
  const haystack = `${title} ${definition}`.toLowerCase();
  const nonLegalSignals = [
    "television series",
    "reality comedy",
    "comedy series",
    "aired on",
    "abc from",
    "film",
    "song",
    "album",
    "video game",
    "podcast",
    "episode"
  ];

  return nonLegalSignals.some((signal) => haystack.includes(signal));
}

async function getChineseDefinition(term: string, definition: string): Promise<string | undefined> {
  return getKnownChineseDefinition(term)
    || getKnownChineseDefinition(getBaseTerm(term))
    || getFallbackChineseDefinition(term, definition)
    || await translateDefinitionToChinese(definition)
    || await translateDefinitionToChinese(term)
    || getFallbackChineseDefinition(term, definition);
}

function getKnownChineseDefinition(term: string): string | undefined {
  return knownChineseDefinitions[normalizeTerm(term)];
}

function getBaseTerm(term: string): string {
  const normalized = normalizeTerm(term);
  if (knownChineseDefinitions[normalized]) return normalized;
  if (normalized.endsWith("ied")) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith("ed")) return normalized.slice(0, -2);
  if (normalized.endsWith("ing")) return normalized.slice(0, -3);
  if (normalized.endsWith("s")) return normalized.slice(0, -1);
  return normalized;
}

function getFallbackChineseDefinition(term: string, definition: string): string | undefined {
  const normalizedTerm = normalizeTerm(term);
  const normalizedDefinition = normalizeTerm(definition).replace(/[.;:]$/g, "");
  const fallbackByDefinition: Record<string, string> = {
    "to postpone": "推迟；延期",
    "to delay": "延迟；延期",
    "to defer": "推迟；延后",
    "to decide": "裁定；决定",
    "to determine": "裁定；确定",
    "to authorize": "授权；批准",
    "to require": "要求；规定",
    "to prohibit": "禁止",
    "to permit": "允许；准许",
    "to allow": "允许；准许",
    "to revoke": "撤销；废止",
    "to repeal": "废除；撤销",
    "to enforce": "执行；强制执行",
    "to impose": "施加；征收；处以",
    "to appeal": "上诉",
    "to hear": "审理；听取",
    "to dismiss": "驳回；撤销",
    "to remand": "发回重审；还押",
    "to issue": "签发；发布",
    "to grant": "准予；授予",
    "to deny": "拒绝；驳回"
  };

  if (fallbackByDefinition[normalizedDefinition]) return fallbackByDefinition[normalizedDefinition];
  if (normalizedTerm.endsWith("ed")) {
    const base = getKnownChineseDefinition(getBaseTerm(normalizedTerm));
    if (base) return `已${base}`;
  }

  return undefined;
}

async function getChineseReferenceDefinition(title: string): Promise<string | undefined> {
  try {
    const langLinkUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&format=json&origin=*&lllang=zh&titles=${encodeURIComponent(title)}`;
    const langLinkResponse = await fetchWithTimeout(langLinkUrl, 800);
    if (!langLinkResponse.ok) return undefined;

    const langLinkPayload = await langLinkResponse.json() as WikipediaLangLinksResponse;
    const page = Object.values(langLinkPayload.query?.pages ?? {})[0];
    const zhTitle = page?.langlinks?.find((item) => item.lang === "zh")?.title;
    if (!zhTitle) return undefined;

    const summaryResponse = await fetchWithTimeout(`https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(zhTitle)}`, 800);
    if (!summaryResponse.ok) return zhTitle;

    const summary = await summaryResponse.json() as WikipediaSummaryResponse;
    const extract = summary.extract?.trim();
    return extract ? `${summary.title || zhTitle}：${extract}` : zhTitle;
  } catch {
    return undefined;
  }
}

async function translateDefinitionToChinese(definition: string): Promise<string | undefined> {
  const cleanDefinition = definition.trim();
  if (!cleanDefinition) return undefined;

  return await translateWithGoogle(cleanDefinition)
    || await translateWithMyMemory(cleanDefinition);
}

async function translateWithMyMemory(value: string): Promise<string | undefined> {
  const cleanValue = value.trim();
  if (!cleanValue) return undefined;

  try {
    const translationUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanValue.slice(0, 450))}&langpair=en|zh-CN`;
    const response = await fetchWithTimeout(translationUrl, 1200);
    if (!response.ok) return undefined;

    const payload = await response.json() as TranslationResponse;
    const translated = payload.responseData?.translatedText?.trim();
    return translated && translated !== cleanValue ? translated : undefined;
  } catch {
    return undefined;
  }
}

async function translateWithGoogle(value: string): Promise<string | undefined> {
  const cleanValue = value.trim();
  if (!cleanValue) return undefined;

  try {
    const translationUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(cleanValue.slice(0, 450))}`;
    const response = await fetchWithTimeout(translationUrl, 1200);
    if (!response.ok) return undefined;

    const payload = await response.json() as GoogleTranslationResponse;
    const translated = payload[0]
      ?.map((part) => part?.[0])
      .filter(Boolean)
      .join("")
      .trim();
    return translated && translated !== cleanValue ? translated : undefined;
  } catch {
    return undefined;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timeoutId = setTimeout(() => resolve(undefined), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeReferenceSearchTerm(term: string): string {
  return term
    .replace(/^doctrine of\s+/i, "")
    .replace(/^principle of\s+/i, "")
    .trim() || term;
}

function normalizeAudioUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}

function todayKey(): string {
  return dateKey(new Date().toISOString());
}

function dateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return todayKey();
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function getVocabPath(): string {
  return process.env.LEGAL_VOCAB_PATH
    || path.join(projectRoot, "output/legal-vocab.json");
}
