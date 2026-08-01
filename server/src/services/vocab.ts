import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createDailyPlanV2,
  getFrozenPlanPendingIds,
  selectFrozenPlanItems,
  type DailyPlanV2
} from "./dailyPlan.js";

const legalVocabTimeZone = process.env.LEGAL_VOCAB_TIME_ZONE || "America/Toronto";

export type VocabStatus = "new" | "learning" | "review" | "mastered";
export type VocabResult = "correct" | "wrong";
export type LookupSource = "web" | "extension-selection" | "extension-image" | "desktop-image";
export type LookupQuality =
  | "oxford"
  | "cambridge"
  | "merriam-webster"
  | "ai-legal"
  | "legal-glossary"
  | "saved"
  | "reference"
  | "dictionary";

export type LookupStats = {
  count: number;
  firstLookedUpAt: string;
  lastLookedUpAt: string;
  historicalCountKnown: boolean;
  eventIds: string[];
  sources: Partial<Record<LookupSource, number>>;
};

export type ReviewState = {
  status: VocabStatus;
  correctStreak: number;
  wrongCount: number;
  wrongStreak?: number;
  memoryStrength?: number;
  easeFactor?: number;
  lastIntervalDays?: number;
  retentionTarget?: number;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  lastResult?: VocabResult;
  focus?: boolean;
  focusRecoveryCorrectCount?: number;
  focusRecoveryRoundId?: string;
  focusRoundAttempted?: boolean;
  focusRecoveryAttemptSessionId?: string;
  reinforcementPending?: boolean;
  reinforcementSessionId?: string;
};

export type QuestionQualityStatus = "eligible" | "pending-review";

export type QuestionQuality = {
  status: QuestionQualityStatus;
  reasons?: string[];
  evaluatedAt?: string;
};

export type VocabItem = {
  id: string;
  term: string;
  definition: string;
  chineseDefinition?: string;
  legalContext?: string;
  lookupQuality?: LookupQuality;
  sourceLabel?: string;
  lookupWarning?: string;
  phonetic?: string;
  pronunciation?: string;
  legalNote?: LegalEnglishNote;
  lookupStats?: LookupStats;
  isImportant: boolean;
  lemma?: string;
  partOfSpeech?: string;
  questionQuality?: QuestionQuality;
  retiredAt?: string;
  retiredReason?: string;
  lastAnswerSnapshot?: {
    occurredAt: string;
    result: VocabResult;
    previousReviewState: ReviewState;
    previousReviewEvent?: ReviewEvent;
  };
  sourceText: string;
  createdAt: string;
  updatedAt: string;
  reviewState: ReviewState;
};

export type VocabStore = {
  version: "v0.1";
  updatedAt: string;
  items: VocabItem[];
  lastReviewEvent?: ReviewEvent;
  activeQuestion?: QuizActivityEvent;
  dailyReviewPlans?: Record<string, DailyReviewPlan>;
  focusReviewRound?: FocusReviewRound;
  lookupTrackingStartedAt?: string;
};

export type FocusReviewRound = {
  id: string;
  createdAt: string;
  itemIds: string[];
  attemptedItemIds: string[];
  completedAt?: string;
};

export type ReviewEvent = {
  itemId: string;
  result: VocabResult;
  wrongStreak: number;
  occurredAt: string;
};

export type QuizActivityEvent = {
  itemId: string;
  occurredAt: string;
};

export type DailyReviewPlan = DailyPlanV2;

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
  phonetic?: string;
  legalContext?: string;
  examples: {
    sentence: string;
    translation?: string;
  }[];
  reviewState: ReviewState;
};

export type VocabReviewResponse = {
  date: string;
  canStart: boolean;
  reason?: string;
  questions: VocabReviewQuestion[];
  focusProgress?: {
    total: number;
    roundId?: string;
    attemptCount: number;
    focusRoundItems: number;
    attemptedItemIds: string[];
  };
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
  retired: number;
};

export type LearningStatus = {
  generatedAt: string;
  todayAdded: number;
  dueToday: number;
  learningStreakDays: number;
  dailyTestStreakDays: number;
  dailyPlanTotal: number;
  dailyPlanCompleted: number;
  masteryRate: number;
  mastered: number;
  total: number;
  repeatedWrong: number;
  petState: "idle" | "due" | "encourage" | "failure" | "focus";
  message: string;
  reviewUrl: string;
  recentReview?: ReviewEvent;
  activeQuestion?: QuizActivityEvent;
};

export type DailyPlanCalendarStatus = "complete" | "partial" | "empty";

export type DailyPlanCalendarDay = {
  date: string;
  status: DailyPlanCalendarStatus;
  total: number;
  completed: number;
  progress: number;
  hasPlan: boolean;
};

export type DailyPlanCalendar = {
  generatedAt: string;
  today: string;
  month: string;
  recentDays: DailyPlanCalendarDay[];
  monthDays: DailyPlanCalendarDay[];
};

export type QualityBackfillResult = {
  scanned: number;
  updated: number;
  needsReview: number;
  legalGlossary: number;
  saved: number;
};

export type FeedbackEnrichmentResult = {
  dryRun: boolean;
  requested: number;
  enriched: number;
  partial: number;
  unchanged: number;
  failed: number;
  items: {
    itemId: string;
    term: string;
    status: "enriched" | "partial" | "unchanged" | "failed";
    addedFields: ("phonetic" | "legalContext" | "examples")[];
    remainingFields?: ("phonetic" | "legalContext" | "examples")[];
    reason?: string;
  }[];
};

export type FeedbackEnrichmentAudit = {
  generatedAt: string;
  total: number;
  complete: number;
  missingAny: number;
  missingPhonetic: number;
  missingLegalContext: number;
  missingExamples: number;
  candidateItemIds: string[];
};

export type QualityActionResult = {
  item: VocabItem;
  action: "marked-ok" | "rechecked" | "updated" | "retired";
};

export type QuestionIssueResult = {
  item: VocabItem;
  latestWrongExempted: boolean;
};

export type VocabItemUpdate = {
  term: string;
  definition: string;
  chineseDefinition?: string;
  legalContext?: string;
  phonetic?: string;
  pronunciation?: string;
};

export type ReviewMode = "due" | "all" | "wrong" | "focus";

export type DictionaryEntry = {
  term: string;
  definition: string;
  chineseDefinition?: string;
  legalContext?: string;
  lookupQuality?: LookupQuality;
  sourceLabel?: string;
  lookupWarning?: string;
  phonetic?: string;
  pronunciation?: string;
  audioUrl?: string;
  legalNote?: LegalEnglishNote;
};

export type LookupEventInput = {
  eventId: string;
  source: LookupSource;
  occurredAt?: string;
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
let dictionarySaveQueue: Promise<void> = Promise.resolve();
let feedbackEnrichmentQueue: Promise<void> = Promise.resolve();
const queuedFeedbackItemIds = new Set<string>();
const exhaustedFeedbackItemIds = new Set<string>();
let feedbackEnrichmentWorkerStarted = false;
const AUTO_ENRICH_BATCH_SIZE = 5;
const AUTO_ENRICH_MAX_ATTEMPTS = 3;
const AUTO_ENRICH_RETRY_BASE_MS = 2_000;
const AUTO_ENRICH_SCAN_INTERVAL_MS = 30 * 60 * 1_000;

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

export type VocabDateContext = {
  learningDate: string;
  nextLearningDate: string;
};

export async function getVocabItems(): Promise<{
  items: VocabItem[];
  stats: VocabStats;
  dateContext: VocabDateContext;
}> {
  const store = await readStore();
  const dateContext = getVocabDateContext();
  return {
    items: sortItems(store.items),
    stats: getStats(store.items, dateContext.learningDate),
    dateContext
  };
}

export async function getLearningStatus(): Promise<LearningStatus> {
  const store = await readStore();
  const activeItems = store.items.filter((item) => !item.retiredAt);
  const now = new Date();
  const today = todayKey();
  const todayAdded = activeItems.filter((item) => dateKey(item.createdAt) === today).length;
  const rawDueToday = activeItems.filter((item) => isDue(item, today)).length;
  const mastered = activeItems.filter((item) => item.reviewState.status === "mastered").length;
  const repeatedWrong = activeItems.filter((item) =>
    item.reviewState.status !== "mastered"
    && item.reviewState.focus === true
  ).length;
  const dailyPlan = store.dailyReviewPlans?.[today];
  if (dailyPlan && reconcileUnreviewableDailyPlanItems(dailyPlan, activeItems, now.toISOString())) {
    store.updatedAt = now.toISOString();
    await writeStore(store);
  }
  const dueToday = isDailyPlanV2Enabled() && dailyPlan?.version === 2
    ? getFrozenPlanPendingIds(dailyPlan).length
    : rawDueToday;
  const recentReview = store.lastReviewEvent ?? inferLastReviewEvent(activeItems);
  const activeQuestion = store.activeQuestion;
  const activeQuestionAge = activeQuestion
    ? now.valueOf() - new Date(activeQuestion.occurredAt).valueOf()
    : Number.POSITIVE_INFINITY;
  const isQuestionActive = activeQuestionAge >= 0 && activeQuestionAge <= 30 * 60 * 1000;
  const recentAnswerAge = recentReview
    ? now.valueOf() - new Date(recentReview.occurredAt).valueOf()
    : Number.POSITIVE_INFINITY;
  const recentAnswerWindow = recentReview?.result === "correct" ? 4_000 : 5 * 60 * 1000;
  const isRecentAnswer = recentAnswerAge >= 0 && recentAnswerAge <= recentAnswerWindow;

  let petState: LearningStatus["petState"] = "idle";
  if (isQuestionActive) {
    petState = "due";
  } else if (isRecentAnswer && recentReview?.result === "wrong" && recentReview.wrongStreak >= 2) {
    petState = "focus";
  } else if (isRecentAnswer && recentReview?.result === "wrong") {
    petState = "failure";
  } else if (isRecentAnswer && recentReview?.result === "correct") {
    petState = "encourage";
  } else if (dueToday > 0) {
    petState = "due";
  }

  const message = {
    idle: todayAdded > 0 ? `今日新增 ${todayAdded}` : "拖图片查词",
    due: isQuestionActive ? "准备作答" : `待复习 ${dueToday}`,
    encourage: "答对了，继续！",
    failure: "答错了，再记一下",
    focus: `重点复习 ${repeatedWrong || 1}`
  }[petState];

  return {
    generatedAt: now.toISOString(),
    todayAdded,
    dueToday,
    learningStreakDays: calculateLearningStreak(activeItems, today),
    dailyTestStreakDays: calculateDailyTestStreak(store.dailyReviewPlans ?? {}, today),
    dailyPlanTotal: dailyPlan?.dueItemIds.length ?? dueToday,
    dailyPlanCompleted: dailyPlan?.completedItemIds.length ?? 0,
    masteryRate: activeItems.length === 0 ? 0 : Math.round((mastered / activeItems.length) * 100),
    mastered,
    total: activeItems.length,
    repeatedWrong,
    petState,
    message,
    recentReview: isRecentAnswer ? recentReview : undefined,
    activeQuestion: isQuestionActive ? activeQuestion : undefined,
    reviewUrl: dueToday > 0
      ? "http://127.0.0.1:5174/?view=quiz"
      : "http://127.0.0.1:5174/"
  };
}

export async function getDailyPlanCalendar(month?: string): Promise<DailyPlanCalendar> {
  const store = await readStore();
  const today = todayKey();
  const selectedMonth = month || today.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)) {
    throw new Error("月份格式应为 YYYY-MM。");
  }

  const plans = store.dailyReviewPlans ?? {};
  const recentDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index - 6);
    return summarizeDailyPlanCalendarDay(date, plans[date]);
  });
  const monthDays = Array.from({ length: daysInMonth(selectedMonth) }, (_, index) => {
    const date = `${selectedMonth}-${String(index + 1).padStart(2, "0")}`;
    return summarizeDailyPlanCalendarDay(date, plans[date]);
  });

  return {
    generatedAt: new Date().toISOString(),
    today,
    month: selectedMonth,
    recentDays,
    monthDays
  };
}

export function summarizeDailyPlanCalendarDay(
  date: string,
  plan?: DailyReviewPlan
): DailyPlanCalendarDay {
  const dueIds = [...new Set(plan?.dueItemIds ?? [])];
  const dueSet = new Set(dueIds);
  const completed = [...new Set(plan?.completedItemIds ?? [])]
    .filter((itemId) => dueSet.has(itemId))
    .length;
  const total = dueIds.length;
  const progress = total > 0 ? completed / total : 0;
  const status: DailyPlanCalendarStatus = total > 0 && completed >= total
    ? "complete"
    : total > 0 && progress >= 0.5
      ? "partial"
      : "empty";

  return {
    date,
    status,
    total,
    completed,
    progress: Math.round(progress * 100),
    hasPlan: total > 0
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

export async function getVocabFeedbackEnrichmentAudit(): Promise<FeedbackEnrichmentAudit> {
  const store = await readStore();
  const candidates = store.items.filter((item) => getMissingFeedbackFields(item).length > 0);
  return {
    generatedAt: new Date().toISOString(),
    total: store.items.length,
    complete: store.items.length - candidates.length,
    missingAny: candidates.length,
    missingPhonetic: store.items.filter((item) => getMissingFeedbackFields(item).includes("phonetic")).length,
    missingLegalContext: store.items.filter((item) => getMissingFeedbackFields(item).includes("legalContext")).length,
    missingExamples: store.items.filter((item) => getMissingFeedbackFields(item).includes("examples")).length,
    candidateItemIds: candidates.map((item) => item.id)
  };
}

export async function enrichVocabFeedbackDetails({
  itemIds,
  dryRun = true,
  resolveEntry = fetchOpenAILegalDictionaryEntry
}: {
  itemIds: string[];
  dryRun?: boolean;
  resolveEntry?: (term: string) => Promise<DictionaryEntry | null>;
}): Promise<FeedbackEnrichmentResult> {
  const uniqueItemIds = [...new Set(itemIds.map((itemId) => itemId.trim()).filter(Boolean))];
  if (uniqueItemIds.length === 0) {
    throw new Error("请提供需要补全的词条。");
  }
  if (uniqueItemIds.length > 50) {
    throw new Error("一次最多补全 50 个词条。");
  }

  const store = await readStore();
  const itemsById = new Map(store.items.map((item) => [item.id, item]));
  const resolvedEntries = new Map<string, DictionaryEntry>();
  const results: FeedbackEnrichmentResult["items"] = [];
  let enriched = 0;
  let partial = 0;
  let unchanged = 0;
  let failed = 0;

  for (const itemId of uniqueItemIds) {
    const item = itemsById.get(itemId);
    if (!item) {
      failed += 1;
      results.push({
        itemId,
        term: "",
        status: "failed",
        addedFields: [],
        reason: "没有找到这个词条。"
      });
      continue;
    }

    const missingBefore = getMissingFeedbackFields(item);
    const hasPhonetic = !missingBefore.includes("phonetic");
    const hasLegalContext = !missingBefore.includes("legalContext");
    const hasExamples = !missingBefore.includes("examples");
    if (missingBefore.length === 0) {
      unchanged += 1;
      results.push({
        itemId,
        term: item.term,
        status: "unchanged",
        addedFields: []
      });
      continue;
    }
    if (isClearlyNonLegalReference(item.term, item.definition)
        || /\b(?:not a standard english word|misspell(?:ing|ed))\b/i.test(item.definition)) {
      failed += 1;
      results.push({
        itemId,
        term: item.term,
        status: "failed",
        addedFields: [],
        reason: "词条本身需要先检查，未生成法律语境或例句。"
      });
      continue;
    }

    const entry = await resolveEntry(item.term);
    const entryContext = entry?.legalContext?.trim()
      || entry?.legalNote?.contextExplanation.trim()
      || "";
    const entryExamples = entry?.legalNote?.examples
      .filter((example) => example.sentence.trim())
      ?? [];
    if (!entry || !entryContext || entryExamples.length === 0) {
      failed += 1;
      results.push({
        itemId,
        term: item.term,
        status: "failed",
        addedFields: [],
        reason: "未获得可靠的法律语境与例句，词条保持原样。"
      });
      continue;
    }

    const addedFields: ("phonetic" | "legalContext" | "examples")[] = [];
    if (!hasPhonetic && (entry.phonetic || entry.pronunciation)) {
      item.phonetic = entry.phonetic || entry.pronunciation;
      item.pronunciation = entry.pronunciation || entry.phonetic;
      addedFields.push("phonetic");
    }
    if (!hasLegalContext) {
      item.legalContext = entryContext;
      addedFields.push("legalContext");
    }
    if (!hasExamples) {
      item.legalNote = mergeFeedbackLegalNote(item, entry, entryContext, entryExamples);
      addedFields.push("examples");
    }

    if (addedFields.length === 0) {
      failed += 1;
      results.push({
        itemId,
        term: item.term,
        status: "failed",
        addedFields: [],
        reason: "返回内容没有补齐当前缺失字段，词条保持原样。"
      });
      continue;
    }

    const remainingFields = getMissingFeedbackFields(item);
    resolvedEntries.set(itemId, entry);
    if (remainingFields.length > 0) {
      partial += 1;
    } else {
      enriched += 1;
    }
    results.push({
      itemId,
      term: item.term,
      status: remainingFields.length > 0 ? "partial" : "enriched",
      addedFields,
      remainingFields: remainingFields.length > 0 ? remainingFields : undefined,
      reason: remainingFields.length > 0
        ? "部分字段已补全，其余字段保持待补状态。"
        : undefined
    });
  }

  if (!dryRun && resolvedEntries.size > 0) {
    // AI calls may take several seconds. Re-read immediately before applying so
    // quiz, plan, and lookup activity that occurred while resolving is retained.
    const latestStore = await readStore();
    let applied = false;
    for (const [itemId, entry] of resolvedEntries) {
      const latestItem = latestStore.items.find((item) => item.id === itemId);
      if (!latestItem) continue;
      const missingFields = getMissingFeedbackFields(latestItem);
      if (missingFields.includes("phonetic")) {
        latestItem.phonetic = entry.phonetic || entry.pronunciation;
        latestItem.pronunciation = entry.pronunciation || entry.phonetic;
        applied = true;
      }
      const entryContext = entry.legalContext?.trim()
        || entry.legalNote?.contextExplanation.trim()
        || "";
      if (missingFields.includes("legalContext") && entryContext) {
        latestItem.legalContext = entryContext;
        applied = true;
      }
      if (missingFields.includes("examples") && entry.legalNote?.examples.length) {
        latestItem.legalNote = mergeFeedbackLegalNote(
          latestItem,
          entry,
          entryContext,
          entry.legalNote.examples
        );
        applied = true;
      }
    }
    if (applied) {
      latestStore.updatedAt = new Date().toISOString();
      await writeStore(latestStore);
    }
  }

  return {
    dryRun,
    requested: uniqueItemIds.length,
    enriched,
    partial,
    unchanged,
    failed,
    items: results
  };
}

function getMissingFeedbackFields(
  item: Pick<VocabItem, "phonetic" | "pronunciation" | "legalContext" | "legalNote">
): ("phonetic" | "legalContext" | "examples")[] {
  const missing: ("phonetic" | "legalContext" | "examples")[] = [];
  if (!String(item.phonetic || item.pronunciation || "").trim()) missing.push("phonetic");
  if (!String(item.legalContext || item.legalNote?.contextExplanation || "").trim()) {
    missing.push("legalContext");
  }
  const hasBilingualExample = item.legalNote?.examples.some((example) =>
    Boolean(example.sentence.trim() && example.translation.trim())
  );
  if (!hasBilingualExample) missing.push("examples");
  return missing;
}

export async function enrichCurrentDailyPlanFeedbackDetails(
  dryRun = true
): Promise<FeedbackEnrichmentResult> {
  const store = await readStore();
  const plan = store.dailyReviewPlans?.[todayKey()];
  if (!plan || plan.version !== 2) {
    throw new Error("今天还没有可补全的冻结计划。");
  }
  return enrichVocabFeedbackDetails({
    itemIds: plan.dueItemIds,
    dryRun
  });
}

export function scheduleVocabFeedbackEnrichment(itemId: string): void {
  const normalizedItemId = itemId.trim();
  if (!normalizedItemId || !shouldAutoEnrichVocabFeedback()) return;
  if (queuedFeedbackItemIds.has(normalizedItemId) || exhaustedFeedbackItemIds.has(normalizedItemId)) return;

  queuedFeedbackItemIds.add(normalizedItemId);
  feedbackEnrichmentQueue = feedbackEnrichmentQueue
    .then(() => runQueuedFeedbackEnrichment(normalizedItemId))
    .catch(() => undefined)
    .finally(() => queuedFeedbackItemIds.delete(normalizedItemId));
}

export async function startVocabFeedbackEnrichmentWorker(): Promise<void> {
  if (feedbackEnrichmentWorkerStarted || !shouldAutoEnrichVocabFeedback()) return;
  feedbackEnrichmentWorkerStarted = true;
  await scheduleNextFeedbackEnrichmentBatch();
  const timer = setInterval(() => {
    void scheduleNextFeedbackEnrichmentBatch();
  }, AUTO_ENRICH_SCAN_INTERVAL_MS);
  timer.unref();
}

export async function drainVocabFeedbackEnrichmentQueue(): Promise<void> {
  await feedbackEnrichmentQueue;
}

async function scheduleNextFeedbackEnrichmentBatch(): Promise<void> {
  const audit = await getVocabFeedbackEnrichmentAudit();
  audit.candidateItemIds
    .filter((itemId) => !queuedFeedbackItemIds.has(itemId) && !exhaustedFeedbackItemIds.has(itemId))
    .slice(0, AUTO_ENRICH_BATCH_SIZE)
    .forEach(scheduleVocabFeedbackEnrichment);
}

async function runQueuedFeedbackEnrichment(itemId: string): Promise<void> {
  for (let attempt = 1; attempt <= AUTO_ENRICH_MAX_ATTEMPTS; attempt += 1) {
    const result = await enrichVocabFeedbackDetails({ itemIds: [itemId], dryRun: false });
    const itemResult = result.items[0];
    if (itemResult?.status === "enriched" || itemResult?.status === "unchanged") {
      void scheduleNextFeedbackEnrichmentBatch();
      return;
    }
    if (attempt < AUTO_ENRICH_MAX_ATTEMPTS) {
      await delay(AUTO_ENRICH_RETRY_BASE_MS * (2 ** (attempt - 1)));
    }
  }
  exhaustedFeedbackItemIds.add(itemId);
  void scheduleNextFeedbackEnrichmentBatch();
}

function mergeFeedbackLegalNote(
  item: VocabItem,
  entry: DictionaryEntry,
  legalContext: string,
  examples: LegalEnglishNote["examples"]
): LegalEnglishNote {
  const existing = item.legalNote;
  const incoming = entry.legalNote;
  return {
    chineseMeaning:
      existing?.chineseMeaning
      || incoming?.chineseMeaning
      || item.chineseDefinition
      || entry.chineseDefinition
      || "",
    legalRegister: existing?.legalRegister || incoming?.legalRegister || "法律英语",
    contextExplanation: existing?.contextExplanation || legalContext,
    pattern: existing?.pattern || incoming?.pattern,
    examples,
    comparison: existing?.comparison || incoming?.comparison
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
    const termShapeIssue = getTermShapeIssue(entry.term);

    if (existing) {
      existing.term = entry.term;
      existing.definition = entry.definition;
      existing.chineseDefinition = entry.chineseDefinition || existing.chineseDefinition || getKnownChineseDefinition(entry.term);
      existing.legalContext = entry.legalContext || existing.legalContext;
      existing.phonetic = entry.phonetic || existing.phonetic;
      existing.pronunciation = entry.pronunciation || existing.pronunciation;
      existing.legalNote = entry.legalNote || existing.legalNote;
      existing.sourceText = entry.sourceText;
      existing.lookupQuality = "saved";
      existing.sourceLabel = "Manually imported";
      if (termShapeIssue) {
        existing.questionQuality = pendingTermShapeQuality(termShapeIssue, now);
        existing.lookupWarning = termShapeIssue;
      } else {
        existing.questionQuality = {
          status: "eligible",
          reasons: ["用户已导入并确认词义。"],
          evaluatedAt: now
        };
        existing.lookupWarning = undefined;
      }
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
      lookupQuality: "saved",
      sourceLabel: "Manually imported",
      phonetic: entry.phonetic,
      pronunciation: entry.pronunciation,
      legalNote: entry.legalNote,
      questionQuality: termShapeIssue
        ? pendingTermShapeQuality(termShapeIssue, now)
        : {
          status: "eligible",
          reasons: ["用户已导入并确认词义。"],
          evaluatedAt: now
        },
      lookupStats: undefined,
      isImportant: false,
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
  importedItems.forEach((item) => scheduleVocabFeedbackEnrichment(item.id));

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
    if (!isTrustedDefinitionQuality(existingEntry.lookupQuality) && hasStandardDictionaryLookupConfigured()) {
      const standardEntry = await fetchStandardDictionaryEntry(normalizedTerm);
      if (standardEntry) {
        const enrichedStandardEntry = await ensureChineseDefinition(standardEntry);
        return {
          ...enrichedStandardEntry,
          found: true,
          source: "online",
          lookupQuality: enrichedStandardEntry.lookupQuality || "dictionary",
          sourceLabel: enrichedStandardEntry.sourceLabel || "标准词典"
        };
      }
    }

    const enrichedEntry = await ensureChineseDefinition(existingEntry);
    if (!existingEntry.chineseDefinition && enrichedEntry.chineseDefinition) {
      await updateStoredChineseDefinition(existingEntry.term, enrichedEntry.chineseDefinition);
    }

    return {
      ...enrichedEntry,
      found: true,
      source: "online",
      lookupQuality: enrichedEntry.lookupQuality || "saved",
      sourceLabel: enrichedEntry.sourceLabel || "已保存词条"
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
    sourceLabel: enrichedEntry.sourceLabel || "备用在线词典",
    lookupWarning: enrichedEntry.lookupWarning || getDefaultLookupWarning(lookupQuality)
  };
}

function getDefaultLookupWarning(quality?: DictionaryEntry["lookupQuality"]): string | undefined {
  if (isTrustedDefinitionQuality(quality)) return undefined;
  const standardDictionaryStatus = hasStandardDictionaryLookupConfigured()
    ? "未从 Oxford / Cambridge / Merriam-Webster 获取到标准词典释义"
    : "尚未配置 Oxford / Cambridge / Merriam-Webster 官方 API";
  if (quality === "dictionary") return `${standardDictionaryStatus}；当前为备用释义，请人工确认后再进入正式复习。`;
  if (quality === "reference") return `${standardDictionaryStatus}；当前内容是参考摘要，并非精炼的词典释义，请人工确认。`;
  if (quality === "ai-legal") return `${standardDictionaryStatus}；当前为 AI 辅助释义，请人工确认。`;
  if (quality === "legal-glossary") return `${standardDictionaryStatus}；当前为内置法律术语表释义，请人工确认。`;
  return undefined;
}

function hasStandardDictionaryLookupConfigured(): boolean {
  return Boolean(
    (process.env.OXFORD_APP_ID && process.env.OXFORD_APP_KEY)
    || (process.env.CAMBRIDGE_API_KEY && process.env.CAMBRIDGE_DICT_CODE)
    || process.env.MERRIAM_WEBSTER_API_KEY
  );
}

async function findSavedDictionaryEntry(term: string): Promise<DictionaryEntry | null> {
  const normalized = normalizeTerm(term);
  if (!normalized) return null;

  const store = await readStore();
  const existing = store.items.find((item) => normalizeTerm(item.term) === normalized);
  if (!existing?.definition) return null;

  return {
    term: existing.term,
    definition: existing.definition,
    chineseDefinition: existing.chineseDefinition || getKnownChineseDefinition(existing.term),
    legalContext: existing.legalContext || existing.legalNote?.contextExplanation,
    lookupQuality: existing.lookupQuality === "saved" || !existing.lookupQuality ? "saved" : existing.lookupQuality,
    sourceLabel: existing.sourceLabel || "已保存词条",
    lookupWarning: existing.lookupWarning || getDefaultLookupWarning(existing.lookupQuality),
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
    throw new Error("在线词典中没有找到这个词汇。");
  }

  return saveDictionaryEntry(entry);
}

export async function saveDictionaryEntry(
  entry: DictionaryEntry,
  lookupEvent?: LookupEventInput
): Promise<SaveDictionaryEntryResult> {
  const saveOperation = dictionarySaveQueue.then(
    () => saveDictionaryEntryNow(entry, lookupEvent),
    () => saveDictionaryEntryNow(entry, lookupEvent)
  );
  dictionarySaveQueue = saveOperation.then(() => undefined, () => undefined);
  const result = await saveOperation;
  scheduleVocabFeedbackEnrichment(result.item.id);
  return result;
}

async function saveDictionaryEntryNow(
  entry: DictionaryEntry,
  lookupEvent?: LookupEventInput
): Promise<SaveDictionaryEntryResult> {
  if (isClearlyNonLegalReference(entry.term, entry.definition)) {
    throw new Error("检索结果不像法律英语词汇，请检查拼写或换一个表达。");
  }

  const store = await readStore();
  const now = new Date().toISOString();
  const normalized = normalizeTerm(entry.term);
  const existing = store.items.find((item) => normalizeTerm(item.term) === normalized);
  const chineseDefinition = entry.chineseDefinition || await getChineseDefinition(entry.term, entry.definition);
  const termShapeIssue = getTermShapeIssue(entry.term);
  const effectiveLookupQuality = entry.lookupQuality || existing?.lookupQuality || "saved";
  const needsStandardDictionaryConfirmation = !isTrustedDefinitionQuality(effectiveLookupQuality);
  const qualityWarning = entry.lookupWarning || getDefaultLookupWarning(effectiveLookupQuality);

  if (existing) {
    existing.term = entry.term;
    existing.definition = entry.definition;
    existing.chineseDefinition = chineseDefinition || existing.chineseDefinition;
    existing.legalContext = entry.legalContext || existing.legalContext || entry.legalNote?.contextExplanation;
    existing.lookupQuality = effectiveLookupQuality;
    existing.sourceLabel = entry.sourceLabel || existing.sourceLabel;
    existing.lookupWarning = qualityWarning || existing.lookupWarning || getDefaultLookupWarning(existing.lookupQuality);
    existing.phonetic = entry.phonetic || existing.phonetic;
    existing.pronunciation = entry.pronunciation || existing.pronunciation;
    existing.legalNote = entry.legalNote || existing.legalNote;
    if (termShapeIssue) {
      existing.questionQuality = pendingTermShapeQuality(termShapeIssue, now);
      existing.lookupWarning = termShapeIssue;
    } else if (needsStandardDictionaryConfirmation) {
      existing.questionQuality = pendingStandardDictionaryQuality(now);
      existing.lookupWarning = existing.lookupWarning || getDefaultLookupWarning(existing.lookupQuality);
    } else {
      existing.questionQuality = {
        status: "eligible",
        reasons: ["已通过标准词典或人工确认来源。"],
        evaluatedAt: now
      };
      existing.lookupWarning = undefined;
    }
    existing.updatedAt = now;
    if (!existing.reviewState.nextReviewAt) {
      existing.reviewState = createTomorrowReviewState(now);
    }
    const historicalCountKnown = existing.lookupStats?.historicalCountKnown
      ?? wasCreatedAfterTrackingStarted(existing, store.lookupTrackingStartedAt);
    const lookupRecorded = recordLookupEvent(existing, lookupEvent, historicalCountKnown, now);
    existing.isImportant = isImportantItem(existing);
    store.updatedAt = now;
    if (lookupRecorded && !store.lookupTrackingStartedAt) {
      store.lookupTrackingStartedAt = now;
    }
    await writeStore(store);
    return { item: existing, created: false };
  }

  const item: VocabItem = {
    id: randomUUID(),
    term: entry.term,
    definition: entry.definition,
    chineseDefinition,
    legalContext: entry.legalContext || entry.legalNote?.contextExplanation,
    lookupQuality: effectiveLookupQuality,
    sourceLabel: entry.sourceLabel,
    lookupWarning: qualityWarning,
    phonetic: entry.phonetic,
    pronunciation: entry.pronunciation,
    legalNote: entry.legalNote,
    questionQuality: termShapeIssue
      ? pendingTermShapeQuality(termShapeIssue, now)
      : needsStandardDictionaryConfirmation
        ? pendingStandardDictionaryQuality(now)
        : {
          status: "eligible",
          reasons: ["已通过标准词典或人工确认来源。"],
          evaluatedAt: now
        },
    lookupStats: undefined,
    isImportant: false,
    sourceText: entry.term,
    createdAt: now,
    updatedAt: now,
    reviewState: createTomorrowReviewState(now)
  };
  const lookupRecorded = recordLookupEvent(item, lookupEvent, true, now);
  item.isImportant = isImportantItem(item);

  store.items.push(item);
  store.updatedAt = now;
  if (lookupRecorded && !store.lookupTrackingStartedAt) {
    store.lookupTrackingStartedAt = now;
  }
  await writeStore(store);
  return { item, created: true };
}

export async function markVocabQualityOk(itemId: string): Promise<QualityActionResult> {
  const store = await readStore();
  const item = store.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error("没有找到这个词条。");
  }
  assertTermCanEnterLearning(item.term);

  const now = new Date().toISOString();
  item.lookupQuality = "saved";
  item.sourceLabel = "Manually confirmed";
  item.lookupWarning = undefined;
  item.questionQuality = {
    status: "eligible",
    reasons: ["用户已人工确认词义。"],
    evaluatedAt: now
  };
  item.updatedAt = now;
  store.updatedAt = now;
  await writeStore(store);

  return { item, action: "marked-ok" };
}

export async function recheckVocabItem(
  itemId: string,
  resolveEntry: (term: string) => Promise<DictionaryEntry | null> = fetchOnlineDictionaryEntry
): Promise<QualityActionResult> {
  const store = await readStore();
  const item = store.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error("没有找到这个词条。");
  }

  const entry = await resolveEntry(item.term);
  if (!entry) {
    throw new Error("暂未找到更可靠的在线释义。");
  }
  if (isClearlyNonLegalReference(entry.term, entry.definition)) {
    throw new Error("新的检索结果不像法律英语词汇。");
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
  const termShapeIssue = getTermShapeIssue(entry.term);
  item.questionQuality = termShapeIssue
    ? pendingTermShapeQuality(termShapeIssue, now)
    : questionQualityAfterRecheck(entry, now);
  if (termShapeIssue) item.lookupWarning = termShapeIssue;
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
    throw new Error("词汇和英文释义均不能为空。");
  }
  assertTermCanEnterLearning(term);

  const store = await readStore();
  const item = store.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error("没有找到这个词条。");
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
  item.questionQuality = {
    status: "eligible",
    reasons: ["用户已编辑并确认词义。"],
    evaluatedAt: now
  };
  item.updatedAt = now;
  store.updatedAt = now;
  await writeStore(store);

  return { item, action: "updated" };
}

export async function deleteVocabItem(itemId: string): Promise<{ deleted: boolean }> {
  const store = await readStore();
  const references = getVocabItemReferences(store, itemId);
  if (references.length > 0) {
    throw new Error(`这个词条仍被${references.join("、")}引用，不能直接删除。`);
  }
  const nextItems = store.items.filter((item) => item.id !== itemId);
  if (nextItems.length === store.items.length) {
    return { deleted: false };
  }

  store.items = nextItems;
  store.updatedAt = new Date().toISOString();
  await writeStore(store);
  return { deleted: true };
}

export async function retireVocabItem(
  itemId: string,
  reason = "词条内容不适合继续用于学习或测试。"
): Promise<QualityActionResult> {
  const store = await readStore();
  const item = store.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error("没有找到这个词条。");
  }

  const now = new Date().toISOString();
  item.retiredAt = now;
  item.retiredReason = reason;
  item.questionQuality = {
    status: "pending-review",
    reasons: [reason],
    evaluatedAt: now
  };
  item.lookupWarning = reason;
  item.lastAnswerSnapshot = undefined;
  item.reviewState = clearInvalidContentLearningSignals(item.reviewState);
  item.updatedAt = now;

  for (const plan of Object.values(store.dailyReviewPlans ?? {})) {
    if (plan.completedItemIds.includes(itemId)) continue;
    plan.dueItemIds = plan.dueItemIds.filter((candidate) => candidate !== itemId);
    plan.reviewItemIds = plan.reviewItemIds?.filter((candidate) => candidate !== itemId);
    plan.newItemIds = plan.newItemIds?.filter((candidate) => candidate !== itemId);
    if (plan.dueItemIds.length > 0
        && plan.dueItemIds.every((candidate) => plan.completedItemIds.includes(candidate))) {
      plan.completedAt ??= now;
    }
  }

  if (store.focusReviewRound?.itemIds.includes(itemId)) {
    store.focusReviewRound.itemIds = store.focusReviewRound.itemIds.filter((candidate) => candidate !== itemId);
    store.focusReviewRound.attemptedItemIds = store.focusReviewRound.attemptedItemIds
      .filter((candidate) => candidate !== itemId);
    if (store.focusReviewRound.itemIds.length === 0) {
      store.focusReviewRound = undefined;
    }
  }
  if (store.activeQuestion?.itemId === itemId) store.activeQuestion = undefined;
  if (store.lastReviewEvent?.itemId === itemId) store.lastReviewEvent = undefined;

  store.updatedAt = now;
  await writeStore(store);
  return { item, action: "retired" };
}

function clearInvalidContentLearningSignals(state: ReviewState): ReviewState {
  return {
    ...state,
    wrongCount: 0,
    wrongStreak: 0,
    lastResult: undefined,
    focus: false,
    focusRecoveryCorrectCount: undefined,
    focusRecoveryRoundId: undefined,
    focusRoundAttempted: false,
    focusRecoveryAttemptSessionId: undefined,
    reinforcementPending: false,
    reinforcementSessionId: undefined
  };
}

export function getTermShapeIssue(term: string): string | undefined {
  const cleanTerm = trimCell(term);
  const words = cleanTerm.split(/\s+/).filter(Boolean);
  if (cleanTerm.length > 100 || words.length > 12) {
    return "这段文字过长，更像句子片段。请把词汇或固定法律短语单独保存。";
  }
  if (words.length >= 5 && /^(?:and|or|but|because|although|when|while|after|before|if|that)\b/i.test(cleanTerm)) {
    return "这段文字以连接词开头，更像从正文截取的句子片段。请先编辑成独立词汇或法律短语。";
  }
  if (words.length >= 8 && /[,;:!?]/.test(cleanTerm)) {
    return "这段文字包含句子标点，更像正文片段。请先编辑成独立词汇或法律短语。";
  }
  return undefined;
}

function assertTermCanEnterLearning(term: string): void {
  const issue = getTermShapeIssue(term);
  if (issue) throw new Error(issue);
}

function pendingTermShapeQuality(reason: string, evaluatedAt: string): QuestionQuality {
  return {
    status: "pending-review",
    reasons: [reason],
    evaluatedAt
  };
}

function isTrustedDefinitionQuality(quality?: LookupQuality): boolean {
  return quality === "saved"
    || quality === "oxford"
    || quality === "cambridge"
    || quality === "merriam-webster";
}

function pendingStandardDictionaryQuality(evaluatedAt: string): QuestionQuality {
  return {
    status: "pending-review",
    reasons: ["未找到 Oxford / Cambridge / Merriam-Webster 标准词典释义，请人工确认后再进入正式复习。"],
    evaluatedAt
  };
}

function questionQualityAfterRecheck(entry: DictionaryEntry, evaluatedAt: string): QuestionQuality {
  const trusted = isTrustedDefinitionQuality(entry.lookupQuality);
  return trusted
    ? {
      status: "eligible",
      reasons: ["已通过标准词典或人工确认来源重新检查。"],
      evaluatedAt
    }
    : {
      status: "pending-review",
      reasons: ["重新检索仍未获得 Oxford / Cambridge / Merriam-Webster 标准词典释义，请人工确认。"],
      evaluatedAt
    };
}

function getVocabItemReferences(store: VocabStore, itemId: string): string[] {
  const references: string[] = [];
  const referencedByPlan = Object.values(store.dailyReviewPlans ?? {}).some((plan) =>
    plan.dueItemIds.includes(itemId)
    || plan.reviewItemIds?.includes(itemId)
    || plan.newItemIds?.includes(itemId)
    || plan.completedItemIds.includes(itemId)
  );
  if (referencedByPlan) references.push("学习计划");
  if (store.focusReviewRound?.itemIds.includes(itemId)) references.push("重点复习轮次");
  if (store.activeQuestion?.itemId === itemId) references.push("当前题目");
  return references;
}

function selectItemsById(itemIds: string[], items: VocabItem[]): VocabItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return itemIds.map((itemId) => byId.get(itemId)).filter((item): item is VocabItem => Boolean(item));
}

function ensureFocusReviewRound(
  store: VocabStore,
  restart: boolean
): { round?: FocusReviewRound; changed: boolean } {
  if (store.focusReviewRound && !restart) {
    return { round: store.focusReviewRound, changed: false };
  }

  const focusItems = store.items.filter(isFocusQueueItem);
  if (focusItems.length === 0) {
    if (restart && store.focusReviewRound) {
      store.focusReviewRound = undefined;
      return { round: undefined, changed: true };
    }
    return { round: store.focusReviewRound, changed: false };
  }

  let roundId: string;
  let attemptedItemIds: string[];
  if (!restart) {
    const roundCounts = new Map<string, number>();
    focusItems.forEach((item) => {
      const itemRoundId = item.reviewState.focusRecoveryRoundId;
      if (itemRoundId) {
        roundCounts.set(itemRoundId, (roundCounts.get(itemRoundId) ?? 0) + 1);
      }
    });
    roundId = [...roundCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? randomUUID();
    attemptedItemIds = focusItems
      .filter((item) => item.reviewState.focusRecoveryRoundId === roundId && item.reviewState.focusRoundAttempted === true)
      .map((item) => item.id);
  } else {
    roundId = randomUUID();
    attemptedItemIds = [];
  }

  focusItems.forEach((item) => {
    item.reviewState.focusRecoveryRoundId = roundId;
    if (restart || !attemptedItemIds.includes(item.id)) {
      item.reviewState.focusRoundAttempted = false;
      item.reviewState.focusRecoveryAttemptSessionId = undefined;
    }
  });

  const createdAt = new Date().toISOString();
  store.focusReviewRound = {
    id: roundId,
    createdAt,
    itemIds: focusItems.map((item) => item.id),
    attemptedItemIds,
    completedAt: attemptedItemIds.length >= focusItems.length ? createdAt : undefined
  };
  return { round: store.focusReviewRound, changed: true };
}

export async function getVocabReview(
  date = todayKey(),
  mode: ReviewMode = "due",
  options: { restartFocusRound?: boolean } = {}
): Promise<VocabReviewResponse> {
  // Daily Plan v2 has one authoritative business date. A UTC-shifted or stale
  // client date must never bypass the frozen plan and expose the full due pool.
  if (isDailyPlanV2Enabled() && mode === "due") {
    date = todayKey();
  }
  const store = await readStore();
  const focusRoundResult = mode === "focus"
    ? ensureFocusReviewRound(store, options.restartFocusRound === true)
    : { round: undefined, changed: false };
  const focusRound = focusRoundResult.round;
  if (focusRoundResult.changed) {
    await writeStore(store);
  }

  let dailyPlan = isDailyPlanV2Enabled() && mode === "due" && date === todayKey()
    ? store.dailyReviewPlans?.[date]
    : undefined;
  const candidateItems = dailyPlan
    ? selectFrozenPlanItems(dailyPlan, store.items)
    : mode === "focus" && focusRound
      ? selectItemsById(focusRound.itemIds, store.items)
    : store.items
      .filter((item) => {
        if (mode === "all") return true;
        if (mode === "wrong") return isWrongQueueItem(item);
        if (mode === "focus") return isFocusQueueItem(item);
        return isDue(item, date);
      })
      .sort((a, b) => reviewPriority(a, date) - reviewPriority(b, date));

  await repairDefinitionsForQuiz(store, candidateItems);

  const reviewableItems = store.items.filter(hasEnglishDefinition);
  const definitions = uniqueDefinitions(reviewableItems);

  if (definitions.length < 4) {
    await repairDefinitionsForQuiz(store, store.items);
  }

  const refreshedReviewableItems = store.items.filter(hasEnglishDefinition);
  const refreshedDefinitions = uniqueDefinitions(refreshedReviewableItems);

  if (refreshedDefinitions.length < 4) {
    return {
      date,
      canStart: false,
      reason: "词库至少需要四个具有不同释义的词条，才能生成四选一测试。",
      questions: []
    };
  }

  if (isDailyPlanV2Enabled() && mode === "due" && date === todayKey()) {
    const ensuredPlan = ensureDailyReviewPlan(store, date, new Date().toISOString());
    dailyPlan = ensuredPlan.plan;
    const reconciled = reconcileUnreviewableDailyPlanItems(dailyPlan, refreshedReviewableItems, new Date().toISOString());
    if (ensuredPlan.created || reconciled) {
      store.updatedAt = new Date().toISOString();
      await writeStore(store);
    }
  }

  const dueItems = dailyPlan
    ? selectFrozenPlanItems(dailyPlan, refreshedReviewableItems)
    : mode === "focus" && focusRound
      ? selectItemsById(focusRound.itemIds, refreshedReviewableItems)
    : refreshedReviewableItems
      .filter((item) => {
        if (mode === "all") return true;
        if (mode === "wrong") return isWrongQueueItem(item);
        if (mode === "focus") return isFocusQueueItem(item);
        return isDue(item, date);
      })
      .sort((a, b) => reviewPriority(a, date) - reviewPriority(b, date));

  const emptyReason = {
    all: "词库中暂时没有可练习的词。",
    due: "今天的计划已经完成。",
    wrong: "当前没有需要复习的错题。",
    focus: "当前没有需要重点复习的词。"
  }[mode];

  return {
    date,
    canStart: dueItems.length > 0,
    reason: dueItems.length > 0 ? undefined : emptyReason,
    focusProgress: mode === "focus" ? {
      total: dueItems.length,
      roundId: focusRound?.id,
      attemptCount: focusRound?.attemptedItemIds.length ?? 0,
      focusRoundItems: store.items.filter((item) => item.reviewState?.focus === true).length,
      attemptedItemIds: focusRound?.attemptedItemIds ?? []
    } : undefined,
    questions: dueItems.map((item) => createQuestion(item, refreshedReviewableItems, date))
  };
}

export async function recordVocabAnswer(request: {
  itemId: string;
  selectedDefinition: string;
  correctDefinition: string;
  isCorrect: boolean;
  answeredAt?: string;
  sessionId?: string;
  focusRoundId?: string;
  attemptKind?: "plan" | "reinforcement" | "independent";
}): Promise<VocabItem> {
  const store = await readStore();
  const item = store.items.find((candidate) => candidate.id === request.itemId);
  if (!item) {
    throw new Error("没有找到这个词条。");
  }

  if (request.correctDefinition.trim() !== item.definition) {
    throw new Error("正确释义与当前词条不一致，请重新加载题目。");
  }

  const answeredAt = request.answeredAt ?? new Date().toISOString();
  const answeredDate = learningDayKey(answeredAt);
  const dailyPlan = ensureDailyReviewPlan(store, answeredDate, answeredAt).plan;
  const isCorrect = request.selectedDefinition.trim() === item.definition;
  const focusRound = request.attemptKind === "independent" && request.focusRoundId
    ? store.focusReviewRound
    : undefined;
  if (request.focusRoundId) {
    if (!focusRound || focusRound.id !== request.focusRoundId || !focusRound.itemIds.includes(item.id)) {
      throw new Error("重点复习轮次已更新，请重新加载后继续。");
    }
    if (focusRound.attemptedItemIds.includes(item.id)) {
      return item;
    }
  }
  const nextState = applyAnswerLearningState(item.reviewState, {
    isCorrect,
    answeredDate,
    sessionId: request.sessionId,
    focusRoundId: request.focusRoundId,
    attemptKind: request.attemptKind ?? "plan"
  });

  item.lastAnswerSnapshot = {
    occurredAt: answeredAt,
    result: isCorrect ? "correct" : "wrong",
    previousReviewState: { ...item.reviewState },
    previousReviewEvent: store.lastReviewEvent ? { ...store.lastReviewEvent } : undefined
  };
  item.reviewState = nextState;
  item.updatedAt = answeredAt;
  store.updatedAt = answeredAt;
  store.lastReviewEvent = {
    itemId: item.id,
    result: isCorrect ? "correct" : "wrong",
    wrongStreak: nextState.wrongStreak ?? 0,
    occurredAt: answeredAt
  };
  store.activeQuestion = undefined;
  completeDailyReviewTask(dailyPlan, item.id, answeredAt);
  if (focusRound) {
    focusRound.attemptedItemIds.push(item.id);
    if (focusRound.attemptedItemIds.length >= focusRound.itemIds.length) {
      focusRound.completedAt = answeredAt;
    }
  }
  await writeStore(store);

  return item;
}

export async function flagVocabQuestionIssue(
  itemId: string,
  reason = "用户反馈题目内容有问题。"
): Promise<QuestionIssueResult> {
  const store = await readStore();
  const item = store.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error("没有找到这个词条。");
  }

  const now = new Date().toISOString();
  const snapshot = item.lastAnswerSnapshot;
  const canExemptLatestWrong = snapshot?.result === "wrong"
    && store.lastReviewEvent?.itemId === item.id
    && store.lastReviewEvent.result === "wrong"
    && store.lastReviewEvent.occurredAt === snapshot.occurredAt;

  if (canExemptLatestWrong) {
    item.reviewState = { ...snapshot.previousReviewState };
    store.lastReviewEvent = snapshot.previousReviewEvent
      ? { ...snapshot.previousReviewEvent }
      : undefined;
  }
  item.lastAnswerSnapshot = undefined;
  item.questionQuality = {
    status: "pending-review",
    reasons: [reason],
    evaluatedAt: now
  };
  item.updatedAt = now;
  store.updatedAt = now;
  await writeStore(store);

  return { item, latestWrongExempted: canExemptLatestWrong };
}

export async function recordQuizQuestionStarted(request: {
  itemId: string;
  occurredAt?: string;
}): Promise<QuizActivityEvent> {
  const store = await readStore();
  const item = store.items.find((candidate) => candidate.id === request.itemId);
  if (!item) {
    throw new Error("没有找到这个词条。");
  }

  const activity = {
    itemId: item.id,
    occurredAt: request.occurredAt ?? new Date().toISOString()
  };
  if (store.lastReviewEvent
      && new Date(store.lastReviewEvent.occurredAt).valueOf() >= new Date(activity.occurredAt).valueOf()) {
    return activity;
  }
  store.activeQuestion = activity;
  store.updatedAt = activity.occurredAt;
  await writeStore(store);
  return activity;
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
        reason: "请使用“词汇 - 释义”“词汇: 释义”、CSV 或 TSV 格式。"
      });
      continue;
    }

    if (!parsed.term || !parsed.definition) {
      failed.push({
        line: number,
        text: line,
        reason: "词汇和释义均不能为空。"
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

async function repairDefinitionsForQuiz(store: VocabStore, candidates: VocabItem[]): Promise<void> {
  if (process.env.DISABLE_QUIZ_DEFINITION_REPAIR === "true") return;

  const repairTargets = candidates.filter((item) => !hasEnglishDefinition(item));
  if (repairTargets.length === 0) return;

  const now = new Date().toISOString();
  let updated = false;

  for (const item of repairTargets) {
    const entry = await fetchOnlineDictionaryEntry(item.term);
    if (!entry?.definition || !hasUsableDictionaryDefinition(entry)) continue;

    item.term = entry.term;
    item.definition = entry.definition;
    item.chineseDefinition = entry.chineseDefinition || item.chineseDefinition || await getChineseDefinition(entry.term, entry.definition);
    item.legalContext = entry.legalContext || item.legalContext || entry.legalNote?.contextExplanation;
    item.lookupQuality = entry.lookupQuality;
    item.sourceLabel = entry.sourceLabel;
    item.lookupWarning = entry.lookupWarning || getDefaultLookupWarning(entry.lookupQuality);
    item.phonetic = entry.phonetic || item.phonetic;
    item.pronunciation = entry.pronunciation || item.pronunciation;
    item.legalNote = entry.legalNote || item.legalNote;
    item.updatedAt = now;
    updated = true;
  }

  if (updated) {
    store.updatedAt = now;
    await writeStore(store);
  }
}

function hasUsableDictionaryDefinition(entry: DictionaryEntry): boolean {
  return Boolean(entry.definition)
    && isTrustedDefinitionQuality(entry.lookupQuality)
    && !containsCjk(entry.definition)
    && isLikelyEnglishExplanation(entry.definition)
    && isQuizDefinitionUsable(entry.definition)
    && !isClearlyNonLegalReference(entry.term, entry.definition);
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
    phonetic: item.phonetic || item.pronunciation,
    legalContext: item.legalContext || item.legalNote?.contextExplanation,
    examples: item.legalNote?.examples.map((example) => ({
      sentence: example.sentence,
      translation: example.translation
    })) ?? [],
    reviewState: item.reviewState
  };
}

const DEFAULT_RETENTION_TARGET = 0.85;
const DEFAULT_EASE_FACTOR = 2.2;
const MIN_EASE_FACTOR = 1.35;
const MAX_EASE_FACTOR = 2.8;
const MIN_MEMORY_STRENGTH_DAYS = 6;
const FIRST_CORRECT_MEMORY_STRENGTH_DAYS = 18;
const MASTERED_INTERVAL_DAYS = 30;
const MAX_REVIEW_INTERVAL_DAYS = 60;

function nextCorrectState(current: ReviewState, answeredDate: string): ReviewState {
  const correctStreak = current.correctStreak + 1;
  const easeFactor = nextEaseFactor(current, true);
  const memoryStrength = nextMemoryStrength(current, correctStreak, easeFactor);
  const retentionTarget = current.retentionTarget ?? DEFAULT_RETENTION_TARGET;
  const interval = calculateEbbinghausInterval(memoryStrength, retentionTarget);

  return {
    status: interval >= MASTERED_INTERVAL_DAYS || correctStreak >= 4 ? "mastered" : "review",
    correctStreak,
    wrongCount: current.wrongCount,
    wrongStreak: 0,
    memoryStrength,
    easeFactor,
    lastIntervalDays: interval,
    retentionTarget,
    lastReviewedAt: answeredDate,
    nextReviewAt: addDays(answeredDate, interval),
    lastResult: "correct"
  };
}

function nextWrongState(current: ReviewState, answeredDate: string): ReviewState {
  const easeFactor = nextEaseFactor(current, false);
  const memoryStrength = Math.max(MIN_MEMORY_STRENGTH_DAYS, estimateMemoryStrength(current) * 0.45);

  return {
    status: "learning",
    correctStreak: 0,
    wrongCount: current.wrongCount + 1,
    wrongStreak: getWrongStreak(current) + 1,
    memoryStrength,
    easeFactor,
    lastIntervalDays: 1,
    retentionTarget: current.retentionTarget ?? DEFAULT_RETENTION_TARGET,
    lastReviewedAt: answeredDate,
    nextReviewAt: addDays(answeredDate, 1),
    lastResult: "wrong"
  };
}

function applyAnswerLearningState(
  current: ReviewState,
  answer: {
    isCorrect: boolean;
    answeredDate: string;
    sessionId?: string;
    focusRoundId?: string;
    attemptKind: "plan" | "reinforcement" | "independent";
  }
): ReviewState {
  if (answer.attemptKind === "independent" && current.focus === true) {
    const isSameRoundDuplicate = current.focusRecoveryRoundId != null
      && Boolean(answer.focusRoundId)
      && current.focusRecoveryAttemptSessionId === answer.focusRoundId;
    if (isSameRoundDuplicate && current.focusRoundAttempted === true) {
      return {
        ...current,
        lastReviewedAt: answer.answeredDate,
        focusRoundAttempted: current.focusRoundAttempted,
        focusRecoveryAttemptSessionId: current.focusRecoveryAttemptSessionId
      };
    }
  }

  const next = answer.isCorrect
    ? nextCorrectState(current, answer.answeredDate)
    : nextWrongState(current, answer.answeredDate);
  const sessionId = answer.sessionId?.trim() || undefined;
  const isMatchingReinforcement = answer.attemptKind === "reinforcement"
    && current.reinforcementPending === true
    && Boolean(sessionId)
    && current.reinforcementSessionId === sessionId;

  if (answer.isCorrect) {
    if (current.focus === true && answer.attemptKind !== "reinforcement") {
      const recoveryCount = (current.focusRecoveryCorrectCount ?? 0) + 1;
      next.focus = recoveryCount < 2;
      next.focusRecoveryCorrectCount = Math.min(recoveryCount, 2);
      next.focusRoundAttempted = true;
      next.focusRecoveryAttemptSessionId = answer.attemptKind === "independent"
        ? answer.focusRoundId
        : next.focusRecoveryAttemptSessionId;
      next.focusRecoveryRoundId = answer.focusRoundId ?? current.focusRecoveryRoundId ?? next.focusRecoveryRoundId;
      if (recoveryCount >= 2) {
        next.focusRecoveryRoundId = undefined;
        next.focusRoundAttempted = false;
        next.focusRecoveryAttemptSessionId = undefined;
      }
    } else {
      next.focus = current.focus === true;
      next.focusRecoveryCorrectCount = current.focusRecoveryCorrectCount ?? 0;
      next.focusRoundAttempted = current.focusRoundAttempted ?? false;
      next.focusRecoveryAttemptSessionId = current.focusRecoveryAttemptSessionId;
    }
    next.reinforcementPending = false;
    next.reinforcementSessionId = undefined;
    return next;
  }

  next.focus = current.focus === true || isMatchingReinforcement;
  next.focusRecoveryCorrectCount = 0;
  next.focusRoundAttempted = true;
  next.focusRecoveryAttemptSessionId = answer.focusRoundId ?? sessionId;
  if (answer.attemptKind !== "reinforcement" && next.focus === true && !next.focusRecoveryRoundId) {
    next.focusRecoveryRoundId = answer.focusRoundId ?? current.focusRecoveryRoundId;
  }
  next.reinforcementPending = !next.focus;
  next.reinforcementSessionId = next.focus ? undefined : sessionId;
  return next;
}

function nextEaseFactor(current: ReviewState, isCorrect: boolean): number {
  const currentEase = current.easeFactor ?? DEFAULT_EASE_FACTOR;
  const adjusted = isCorrect ? currentEase + 0.08 : currentEase - 0.3;
  return clampNumber(adjusted, MIN_EASE_FACTOR, MAX_EASE_FACTOR);
}

function nextMemoryStrength(current: ReviewState, correctStreak: number, easeFactor: number): number {
  if (correctStreak <= 1) return FIRST_CORRECT_MEMORY_STRENGTH_DAYS;
  return Math.max(FIRST_CORRECT_MEMORY_STRENGTH_DAYS, estimateMemoryStrength(current) * easeFactor);
}

function calculateEbbinghausInterval(memoryStrength: number, retentionTarget: number): number {
  const safeTarget = clampNumber(retentionTarget, 0.65, 0.95);
  const interval = Math.ceil(-memoryStrength * Math.log(safeTarget));
  return clampNumber(interval, 1, MAX_REVIEW_INTERVAL_DAYS);
}

function estimateMemoryStrength(current: ReviewState): number {
  if (typeof current.memoryStrength === "number" && Number.isFinite(current.memoryStrength) && current.memoryStrength > 0) {
    return current.memoryStrength;
  }

  if (typeof current.lastIntervalDays === "number" && current.lastIntervalDays > 0) {
    return current.lastIntervalDays / -Math.log(current.retentionTarget ?? DEFAULT_RETENTION_TARGET);
  }

  return legacyMemoryStrength(current.correctStreak);
}

function legacyMemoryStrength(correctStreak: number): number {
  if (correctStreak <= 0) return MIN_MEMORY_STRENGTH_DAYS;
  if (correctStreak === 1) return FIRST_CORRECT_MEMORY_STRENGTH_DAYS;
  if (correctStreak === 2) return 43;
  if (correctStreak === 3) return 86;
  return 185;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function optionalPositiveNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function optionalNonNegativeNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : undefined;
}

function getWrongStreak(state: ReviewState): number {
  if (typeof state.wrongStreak === "number") return state.wrongStreak;
  return state.lastResult === "wrong" ? Math.min(state.wrongCount, 2) : 0;
}

function normalizeReviewEvent(value: unknown): ReviewEvent | undefined {
  const candidate = value as Partial<ReviewEvent> | undefined;
  if (!candidate || typeof candidate.itemId !== "string" || !candidate.itemId) return undefined;
  if (candidate.result !== "correct" && candidate.result !== "wrong") return undefined;
  if (typeof candidate.occurredAt !== "string" || !candidate.occurredAt) return undefined;
  return {
    itemId: candidate.itemId,
    result: candidate.result,
    wrongStreak: optionalNonNegativeNumber(candidate.wrongStreak) ?? 0,
    occurredAt: candidate.occurredAt
  };
}

function normalizeQuizActivityEvent(value: unknown): QuizActivityEvent | undefined {
  const candidate = value as Partial<QuizActivityEvent> | undefined;
  if (!candidate || typeof candidate.itemId !== "string" || !candidate.itemId) return undefined;
  if (typeof candidate.occurredAt !== "string" || !candidate.occurredAt) return undefined;
  return {
    itemId: candidate.itemId,
    occurredAt: candidate.occurredAt
  };
}

function normalizeDailyReviewPlans(value: unknown): Record<string, DailyReviewPlan> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const plans: Record<string, DailyReviewPlan> = {};
  for (const [key, rawPlan] of Object.entries(value)) {
    const candidate = rawPlan as Partial<DailyReviewPlan>;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(candidate.date ?? "") ? candidate.date! : key;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const dueItemIds = uniqueStrings(candidate.dueItemIds);
    const completedItemIds = uniqueStrings(candidate.completedItemIds)
      .filter((itemId) => dueItemIds.includes(itemId));
    const isComplete = dueItemIds.length > 0 && dueItemIds.every((itemId) => completedItemIds.includes(itemId));
    plans[date] = {
      version: candidate.version === 2 ? 2 : undefined,
      date,
      dueItemIds,
      reviewItemIds: uniqueStrings(candidate.reviewItemIds)
        .filter((itemId) => dueItemIds.includes(itemId)),
      newItemIds: uniqueStrings(candidate.newItemIds)
        .filter((itemId) => dueItemIds.includes(itemId)),
      completedItemIds,
      createdAt: typeof candidate.createdAt === "string" && candidate.createdAt
        ? candidate.createdAt
        : `${date}T12:00:00.000Z`,
      completedAt: isComplete && typeof candidate.completedAt === "string"
        ? candidate.completedAt
        : undefined
    };
  }
  return plans;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item)))];
}

function ensureDailyReviewPlan(
  store: VocabStore,
  date: string,
  createdAt: string
): { plan: DailyReviewPlan; created: boolean } {
  store.dailyReviewPlans ??= {};
  const existing = store.dailyReviewPlans[date];
  if (existing) return { plan: existing, created: false };

  const plan = isDailyPlanV2Enabled()
    ? createDailyPlanV2(store.items.filter(hasEnglishDefinition), date, createdAt)
    : {
        date,
        dueItemIds: store.items
          .filter((item) => hasEnglishDefinition(item) && isDue(item, date))
          .map((item) => item.id),
        completedItemIds: [],
        createdAt
      };
  store.dailyReviewPlans[date] = plan;
  return { plan, created: true };
}

function completeDailyReviewTask(plan: DailyReviewPlan, itemId: string, completedAt: string): void {
  if (!plan.dueItemIds.includes(itemId) || plan.completedItemIds.includes(itemId)) return;
  plan.completedItemIds.push(itemId);
  if (plan.dueItemIds.length > 0
      && plan.dueItemIds.every((dueItemId) => plan.completedItemIds.includes(dueItemId))) {
    plan.completedAt = completedAt;
  }
}

function reconcileUnreviewableDailyPlanItems(
  plan: DailyReviewPlan,
  candidateItems: VocabItem[],
  completedAt: string
): boolean {
  const reviewableIds = new Set(candidateItems.filter(hasEnglishDefinition).map((item) => item.id));
  const completedIds = new Set(plan.completedItemIds);
  let changed = false;

  for (const itemId of plan.dueItemIds) {
    if (completedIds.has(itemId) || reviewableIds.has(itemId)) continue;
    plan.completedItemIds.push(itemId);
    completedIds.add(itemId);
    changed = true;
  }

  const isComplete = plan.dueItemIds.length > 0
    && plan.dueItemIds.every((itemId) => completedIds.has(itemId));
  if (isComplete && !plan.completedAt) {
    plan.completedAt = completedAt;
    changed = true;
  }

  return changed;
}

function inferLastReviewEvent(items: VocabItem[]): ReviewEvent | undefined {
  const item = [...items]
    .filter((candidate) => candidate.reviewState.lastResult && candidate.updatedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!item?.reviewState.lastResult) return undefined;
  return {
    itemId: item.id,
    result: item.reviewState.lastResult,
    wrongStreak: getWrongStreak(item.reviewState),
    occurredAt: item.updatedAt
  };
}

function optionalRetentionTarget(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 && numberValue < 1
    ? clampNumber(numberValue, 0.65, 0.95)
    : DEFAULT_RETENTION_TARGET;
}

function createNewReviewState(): ReviewState {
  return {
    status: "new",
    correctStreak: 0,
    wrongCount: 0,
    memoryStrength: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    retentionTarget: DEFAULT_RETENTION_TARGET
  };
}

function createTomorrowReviewState(now: string): ReviewState {
  return {
    status: "learning",
    correctStreak: 0,
    wrongCount: 0,
    memoryStrength: MIN_MEMORY_STRENGTH_DAYS,
    easeFactor: DEFAULT_EASE_FACTOR,
    lastIntervalDays: 1,
    retentionTarget: DEFAULT_RETENTION_TARGET,
    nextReviewAt: addDays(dateKey(now), 1)
  };
}

const lookupSources = new Set<LookupSource>([
  "web",
  "extension-selection",
  "extension-image",
  "desktop-image"
]);

function recordLookupEvent(
  item: VocabItem,
  event: LookupEventInput | undefined,
  historicalCountKnown: boolean,
  fallbackOccurredAt: string
): boolean {
  const eventId = event?.eventId.trim();
  if (!eventId || eventId.length > 160 || !event || !lookupSources.has(event.source)) return false;

  const existingStats = item.lookupStats;
  if (existingStats?.eventIds.includes(eventId)) return false;

  const occurredAt = isValidIsoDate(event.occurredAt) ? event.occurredAt! : fallbackOccurredAt;
  const sources = { ...(existingStats?.sources ?? {}) };
  sources[event.source] = (sources[event.source] ?? 0) + 1;
  item.lookupStats = {
    count: (existingStats?.count ?? 0) + 1,
    firstLookedUpAt: existingStats?.firstLookedUpAt ?? occurredAt,
    lastLookedUpAt: occurredAt,
    historicalCountKnown: existingStats?.historicalCountKnown ?? historicalCountKnown,
    eventIds: [...(existingStats?.eventIds ?? []), eventId],
    sources
  };
  return true;
}

function normalizeLookupStats(value: unknown): LookupStats | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<LookupStats>;
  const count = Math.max(0, Math.floor(Number(candidate.count) || 0));
  const eventIds = uniqueStrings(candidate.eventIds);
  if (count === 0 || eventIds.length === 0) return undefined;

  const firstLookedUpAt = isValidIsoDate(candidate.firstLookedUpAt)
    ? candidate.firstLookedUpAt!
    : new Date(0).toISOString();
  const lastLookedUpAt = isValidIsoDate(candidate.lastLookedUpAt)
    ? candidate.lastLookedUpAt!
    : firstLookedUpAt;
  const sources: Partial<Record<LookupSource, number>> = {};
  for (const source of lookupSources) {
    const sourceCount = Number(candidate.sources?.[source]);
    if (Number.isFinite(sourceCount) && sourceCount > 0) {
      sources[source] = Math.floor(sourceCount);
    }
  }

  return {
    count,
    firstLookedUpAt,
    lastLookedUpAt,
    historicalCountKnown: candidate.historicalCountKnown === true,
    eventIds,
    sources
  };
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).valueOf());
}

function isImportantLookupStats(stats: LookupStats | undefined): boolean {
  return (stats?.count ?? 0) >= 2;
}

function isImportantItem(item: Pick<VocabItem, "lookupStats">): boolean {
  return isImportantLookupStats(item.lookupStats);
}

function wasCreatedAfterTrackingStarted(item: VocabItem, trackingStartedAt: string | undefined): boolean {
  if (!isValidIsoDate(trackingStartedAt) || !isValidIsoDate(item.createdAt)) return false;
  return new Date(item.createdAt).valueOf() >= new Date(trackingStartedAt).valueOf();
}

async function readStore(): Promise<VocabStore> {
  try {
    const raw = await readFile(getVocabPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<VocabStore>;

    return {
      version: "v0.1",
      updatedAt: parsed.updatedAt ?? "",
      items: Array.isArray(parsed.items) ? parsed.items.map(normalizeItem).filter(Boolean) : [],
      lastReviewEvent: normalizeReviewEvent(parsed.lastReviewEvent),
      activeQuestion: normalizeQuizActivityEvent(parsed.activeQuestion),
      dailyReviewPlans: normalizeDailyReviewPlans(parsed.dailyReviewPlans),
      focusReviewRound: normalizeFocusReviewRound(parsed.focusReviewRound),
      lookupTrackingStartedAt: typeof parsed.lookupTrackingStartedAt === "string"
        ? parsed.lookupTrackingStartedAt
        : undefined
    };
  } catch {
    return { ...emptyStore, items: [] };
  }
}

function normalizeFocusReviewRound(value: unknown): FocusReviewRound | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<FocusReviewRound>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const itemIds = Array.isArray(candidate.itemIds)
    ? [...new Set(candidate.itemIds.filter((itemId): itemId is string => typeof itemId === "string" && Boolean(itemId.trim())))]
    : [];
  if (!id || !isValidIsoDate(candidate.createdAt) || itemIds.length === 0) return undefined;
  const itemIdSet = new Set(itemIds);
  const attemptedItemIds = Array.isArray(candidate.attemptedItemIds)
    ? [...new Set(candidate.attemptedItemIds.filter(
      (itemId): itemId is string => typeof itemId === "string" && itemIdSet.has(itemId)
    ))]
    : [];
  return {
    id,
    createdAt: candidate.createdAt,
    itemIds,
    attemptedItemIds,
    completedAt: isValidIsoDate(candidate.completedAt) ? candidate.completedAt : undefined
  };
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
  const lookupStats = normalizeLookupStats(candidate.lookupStats);

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
    lookupStats,
    isImportant: isImportantLookupStats(lookupStats),
    lemma: typeof candidate.lemma === "string" ? candidate.lemma.trim() || undefined : undefined,
    partOfSpeech: typeof candidate.partOfSpeech === "string"
      ? candidate.partOfSpeech.trim().toLowerCase() || undefined
      : undefined,
    questionQuality: normalizeQuestionQuality(candidate.questionQuality),
    retiredAt: isValidIsoDate(candidate.retiredAt) ? candidate.retiredAt : undefined,
    retiredReason: typeof candidate.retiredReason === "string"
      ? candidate.retiredReason.trim() || undefined
      : undefined,
    lastAnswerSnapshot: normalizeLastAnswerSnapshot(candidate.lastAnswerSnapshot),
    sourceText: String(candidate.sourceText || ""),
    createdAt: String(candidate.createdAt || new Date().toISOString()),
    updatedAt: String(candidate.updatedAt || new Date().toISOString()),
    reviewState: {
      status: candidate.reviewState?.status ?? "new",
      correctStreak: Number(candidate.reviewState?.correctStreak ?? 0),
      wrongCount: Number(candidate.reviewState?.wrongCount ?? 0),
      wrongStreak: optionalNonNegativeNumber(candidate.reviewState?.wrongStreak),
      memoryStrength: optionalPositiveNumber(candidate.reviewState?.memoryStrength),
      easeFactor: optionalPositiveNumber(candidate.reviewState?.easeFactor) ?? DEFAULT_EASE_FACTOR,
      lastIntervalDays: optionalPositiveNumber(candidate.reviewState?.lastIntervalDays),
      retentionTarget: optionalRetentionTarget(candidate.reviewState?.retentionTarget),
      lastReviewedAt: candidate.reviewState?.lastReviewedAt,
      nextReviewAt: candidate.reviewState?.nextReviewAt,
      lastResult: candidate.reviewState?.lastResult,
      focus: candidate.reviewState?.focus === true,
      focusRecoveryCorrectCount: optionalNonNegativeNumber(candidate.reviewState?.focusRecoveryCorrectCount),
      focusRecoveryRoundId: typeof candidate.reviewState?.focusRecoveryRoundId === "string"
        ? candidate.reviewState.focusRecoveryRoundId
        : undefined,
      focusRoundAttempted: candidate.reviewState?.focusRoundAttempted === true,
      focusRecoveryAttemptSessionId: typeof candidate.reviewState?.focusRecoveryAttemptSessionId === "string"
        ? candidate.reviewState.focusRecoveryAttemptSessionId
        : undefined,
      reinforcementPending: candidate.reviewState?.reinforcementPending === true,
      reinforcementSessionId: typeof candidate.reviewState?.reinforcementSessionId === "string"
        ? candidate.reviewState.reinforcementSessionId
        : undefined
    }
  };
}

function normalizeLastAnswerSnapshot(value: unknown): VocabItem["lastAnswerSnapshot"] {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as VocabItem["lastAnswerSnapshot"];
  if (!candidate || !isValidIsoDate(candidate.occurredAt)) return undefined;
  if (candidate.result !== "correct" && candidate.result !== "wrong") return undefined;
  if (!candidate.previousReviewState || typeof candidate.previousReviewState !== "object") return undefined;
  return {
    occurredAt: candidate.occurredAt,
    result: candidate.result,
    previousReviewState: { ...candidate.previousReviewState },
    previousReviewEvent: normalizeReviewEvent(candidate.previousReviewEvent)
  };
}

function normalizeQuestionQuality(value: unknown): QuestionQuality | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<QuestionQuality>;
  if (candidate.status !== "eligible" && candidate.status !== "pending-review") return undefined;
  return {
    status: candidate.status,
    reasons: Array.isArray(candidate.reasons)
      ? candidate.reasons.filter((reason): reason is string => typeof reason === "string" && Boolean(reason.trim()))
      : undefined,
    evaluatedAt: typeof candidate.evaluatedAt === "string" ? candidate.evaluatedAt : undefined
  };
}

function getStats(items: VocabItem[], date: string): VocabStats {
  const activeItems = items.filter((item) => !item.retiredAt);
  const tomorrow = addDays(date, 1);
  return {
    total: activeItems.length,
    dueToday: activeItems.filter((item) => hasEnglishDefinition(item) && isDue(item, date)).length,
    tomorrow: activeItems.filter((item) => item.reviewState.nextReviewAt === tomorrow).length,
    wrong: activeItems.filter(isWrongQueueItem).length,
    learning: activeItems.filter((item) => item.reviewState.status !== "mastered").length,
    reviewed: activeItems.filter((item) => Boolean(item.reviewState.lastReviewedAt)).length,
    mastered: activeItems.filter((item) => item.reviewState.status === "mastered").length,
    needsReview: activeItems.filter(needsDefinitionReview).length,
    retired: items.length - activeItems.length
  };
}

function calculateLearningStreak(items: VocabItem[], today: string): number {
  const activityDates = new Set<string>();
  for (const item of items) {
    activityDates.add(dateKey(item.createdAt));
    if (item.reviewState.lastReviewedAt) {
      activityDates.add(dateKey(item.reviewState.lastReviewedAt));
    }
  }

  let cursor = activityDates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (activityDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function calculateDailyTestStreak(
  plans: Record<string, DailyReviewPlan>,
  today: string
): number {
  const isCompleted = (date: string) => {
    const plan = plans[date];
    return Boolean(
      plan?.completedAt
      && plan.dueItemIds.length > 0
      && plan.dueItemIds.every((itemId) => plan.completedItemIds.includes(itemId))
    );
  };

  let cursor = isCompleted(today) ? today : addDays(today, -1);
  let streak = 0;
  while (isCompleted(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function needsDefinitionReview(item: VocabItem): boolean {
  if (item.questionQuality) {
    return item.questionQuality.status === "pending-review";
  }
  return !isTrustedDefinitionQuality(item.lookupQuality);
}

function inferLegacyQuality(item: VocabItem): Pick<VocabItem, "lookupQuality" | "sourceLabel" | "lookupWarning"> {
  const builtInEntry = getBuiltInEntry(item.term);
  if (builtInEntry || item.legalNote) {
    return {
      lookupQuality: "legal-glossary",
      sourceLabel: "法律术语表",
      lookupWarning: "未找到 Oxford / Cambridge / Merriam-Webster 标准词典释义；当前为内置法律术语表释义，请人工确认。"
    };
  }

  if (looksLikeReferenceFallback(item)) {
    return {
      lookupQuality: "reference",
      sourceLabel: "参考资料",
      lookupWarning: "这个旧词条可能是参考摘要或非法律释义，请确认后再用于测试。"
    };
  }

  if (item.legalContext) {
    return {
      lookupQuality: "saved",
      sourceLabel: "已保存词条",
      lookupWarning: undefined
    };
  }

  return {
    lookupQuality: "dictionary",
    sourceLabel: "备用在线词典",
    lookupWarning: "这个旧词条保存于质量检查启用之前，请确认其法律含义。"
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

function isFocusQueueItem(item: VocabItem): boolean {
  return item.reviewState.focus === true
    && item.reviewState.status !== "mastered"
    && hasEnglishDefinition(item);
}

function isDue(item: VocabItem, date: string): boolean {
  if (item.reviewState.status === "new") return true;
  if (!item.reviewState.nextReviewAt) return false;
  return item.reviewState.nextReviewAt <= date;
}

function isDailyPlanV2Enabled(): boolean {
  return process.env.DAILY_PLAN_V2_ENABLED === "true";
}

function reviewPriority(item: VocabItem, date: string): number {
  if (item.reviewState.lastResult === "wrong") return 0;
  if (item.reviewState.nextReviewAt && item.reviewState.nextReviewAt < date) return 1;
  if (!item.reviewState.lastReviewedAt && item.isImportant) return 2;
  if (!item.reviewState.lastReviewedAt) return 3;
  return 4;
}

function sortItems(items: VocabItem[]): VocabItem[] {
  return [...items].sort((a, b) => a.term.localeCompare(b.term));
}

function uniqueDefinitions(items: VocabItem[]): string[] {
  return [...new Set(items.map((item) => item.definition.trim()).filter(isQuizDefinitionUsable))];
}

export function isVocabItemQuestionEligible(item: VocabItem): boolean {
  return !item.retiredAt
    && !needsDefinitionReview(item)
    && Boolean(item.definition)
    && !containsCjk(item.definition)
    && isLikelyEnglishExplanation(item.definition)
    && isQuizDefinitionUsable(item.definition);
}

function hasEnglishDefinition(item: VocabItem): boolean {
  return isVocabItemQuestionEligible(item);
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

type OxfordDictionaryResponse = {
  results?: {
    word?: string;
    lexicalEntries?: {
      pronunciations?: {
        phoneticSpelling?: string;
        audioFile?: string;
      }[];
      entries?: {
        pronunciations?: {
          phoneticSpelling?: string;
          audioFile?: string;
        }[];
        senses?: {
          definitions?: string[];
          shortDefinitions?: string[];
        }[];
      }[];
    }[];
  }[];
};

type MerriamWebsterResponse = Array<{
  meta?: {
    id?: string;
  };
  hwi?: {
    hw?: string;
    prs?: {
      mw?: string;
      sound?: {
        audio?: string;
      };
    }[];
  };
  shortdef?: string[];
} | string>;

type CambridgeDictionaryResponse = {
  entryContent?: string;
  entryLabel?: string;
  term?: string;
  definition?: string;
  definitions?: string[];
  entries?: {
    entryContent?: string;
    definition?: string;
    definitions?: string[];
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
  examples?: {
    sentence?: string;
    translation?: string;
  }[];
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

  const standardDictionaryEntry = await fetchStandardDictionaryEntry(normalizedTerm);
  if (standardDictionaryEntry) {
    dictionaryLookupCache.set(cacheKey, standardDictionaryEntry);
    return standardDictionaryEntry;
  }

  const directEntry = getBuiltInEntry(normalizedTerm);
  if (directEntry && shouldPreferBuiltInEntry(normalizedTerm)) {
    const entry = {
      ...directEntry,
      chineseDefinition: directEntry.chineseDefinition || getKnownChineseDefinition(normalizedTerm),
      legalNote: directEntry.legalNote || getLegalEnglishNote(normalizedTerm),
      lookupQuality: "legal-glossary" as const,
      sourceLabel: "法律术语表",
      lookupWarning: getDefaultLookupWarning("legal-glossary")
    };
    dictionaryLookupCache.set(cacheKey, entry);
    return entry;
  }

  const openAIEntry = await fetchOpenAILegalDictionaryEntry(normalizedTerm);
  if (openAIEntry) {
    dictionaryLookupCache.set(cacheKey, openAIEntry);
    return openAIEntry;
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
    throw new Error(`在线词典请求失败（状态码 ${response.status}）。`);
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
    sourceLabel: "备用在线词典",
    lookupWarning: "当前为备用释义，法律含义可能需要进一步检索确认。",
    phonetic,
    pronunciation: phonetic,
    audioUrl,
    legalNote
  });
  dictionaryLookupCache.set(cacheKey, entry);
  return entry;
}

async function fetchStandardDictionaryEntry(term: string): Promise<DictionaryEntry | null> {
  return await fetchOxfordDictionaryEntry(term)
    || await fetchCambridgeDictionaryEntry(term)
    || await fetchMerriamWebsterDictionaryEntry(term);
}

async function fetchOxfordDictionaryEntry(term: string): Promise<DictionaryEntry | null> {
  const appId = process.env.OXFORD_APP_ID;
  const appKey = process.env.OXFORD_APP_KEY;
  if (!appId || !appKey) return null;

  const language = process.env.OXFORD_LANGUAGE || "en-us";
  const baseUrl = process.env.OXFORD_API_BASE_URL || "https://od-api.oxforddictionaries.com/api/v2";

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/entries/${encodeURIComponent(language)}/${encodeURIComponent(normalizeOxfordHeadword(term))}`,
      1800,
      {
        headers: {
          app_id: appId,
          app_key: appKey
        }
      }
    );
    if (response.status === 404) return null;
    if (!response.ok) return null;

    const payload = await response.json() as OxfordDictionaryResponse;
    const result = payload.results?.[0];
    const lexicalEntry = result?.lexicalEntries?.[0];
    const entryBlock = lexicalEntry?.entries?.[0];
    const definition = entryBlock?.senses
      ?.flatMap((sense) => sense.definitions ?? sense.shortDefinitions ?? [])
      .find((candidate) => cleanEnglishDefinition(candidate))
      ?.trim();
    if (!definition) return null;

    const pronunciation = entryBlock?.pronunciations?.[0] || lexicalEntry?.pronunciations?.[0];
    const phonetic = pronunciation?.phoneticSpelling
      ? `/${pronunciation.phoneticSpelling.replace(/^\/|\/$/g, "")}/`
      : undefined;
    const legalNote = getLegalEnglishNote(term);

    return await ensureChineseDefinition({
      term: result?.word || term,
      definition,
      legalContext: legalNote?.contextExplanation,
      lookupQuality: "oxford",
      sourceLabel: "Oxford Dictionaries API",
      phonetic,
      pronunciation: phonetic,
      audioUrl: pronunciation?.audioFile,
      legalNote
    });
  } catch {
    return null;
  }
}

async function fetchCambridgeDictionaryEntry(term: string): Promise<DictionaryEntry | null> {
  const apiKey = process.env.CAMBRIDGE_API_KEY;
  const dictCode = process.env.CAMBRIDGE_DICT_CODE;
  if (!apiKey || !dictCode) return null;

  const baseUrl = process.env.CAMBRIDGE_API_BASE_URL || "https://dictionary.cambridge.org/api/v1";
  const template = process.env.CAMBRIDGE_API_URL_TEMPLATE;
  const url = template
    ? template.replace("{term}", encodeURIComponent(term)).replace("{dictCode}", encodeURIComponent(dictCode))
    : `${baseUrl}/dictionaries/${encodeURIComponent(dictCode)}/searchFirst?q=${encodeURIComponent(term)}&format=json`;

  try {
    const response = await fetchWithTimeout(url, 1800, {
      headers: {
        accessKey: apiKey
      }
    });
    if (response.status === 404) return null;
    if (!response.ok) return null;

    const payload = await response.json() as CambridgeDictionaryResponse;
    const definition = extractCambridgeDefinition(payload);
    if (!definition) return null;

    const legalNote = getLegalEnglishNote(term);
    return await ensureChineseDefinition({
      term: payload.term || payload.entryLabel || term,
      definition,
      legalContext: legalNote?.contextExplanation,
      lookupQuality: "cambridge",
      sourceLabel: "Cambridge Dictionary API",
      legalNote
    });
  } catch {
    return null;
  }
}

async function fetchMerriamWebsterDictionaryEntry(term: string): Promise<DictionaryEntry | null> {
  const apiKey = process.env.MERRIAM_WEBSTER_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.MERRIAM_WEBSTER_API_BASE_URL
    || "https://www.dictionaryapi.com/api/v3/references/collegiate/json";

  try {
    const response = await fetchWithTimeout(`${baseUrl}/${encodeURIComponent(term)}?key=${encodeURIComponent(apiKey)}`, 1800);
    if (response.status === 404) return null;
    if (!response.ok) return null;

    const payload = await response.json() as MerriamWebsterResponse;
    const firstEntry = payload.find((candidate): candidate is Exclude<typeof candidate, string> =>
      typeof candidate === "object"
      && Array.isArray(candidate.shortdef)
      && candidate.shortdef.some((definition) => cleanEnglishDefinition(definition))
    );
    const definition = firstEntry?.shortdef?.find((candidate) => cleanEnglishDefinition(candidate))?.trim();
    if (!firstEntry || !definition) return null;

    const pronunciation = firstEntry.hwi?.prs?.[0]?.mw;
    const phonetic = pronunciation ? `/${pronunciation.replace(/^\/|\/$/g, "")}/` : undefined;
    const legalNote = getLegalEnglishNote(term);

    return await ensureChineseDefinition({
      term: (firstEntry.hwi?.hw || firstEntry.meta?.id || term).replace(/\*/g, ""),
      definition,
      legalContext: legalNote?.contextExplanation,
      lookupQuality: "merriam-webster",
      sourceLabel: "Merriam-Webster Dictionary API",
      phonetic,
      pronunciation: phonetic,
      legalNote
    });
  } catch {
    return null;
  }
}

function normalizeOxfordHeadword(term: string): string {
  return normalizeTerm(term).replace(/\s+/g, "_");
}

function extractCambridgeDefinition(payload: CambridgeDictionaryResponse): string | undefined {
  const directCandidates = [
    payload.definition,
    ...(payload.definitions ?? []),
    ...(payload.entries?.flatMap((entry) => [entry.definition, ...(entry.definitions ?? [])]) ?? [])
  ];
  const direct = directCandidates.find((candidate) => candidate && cleanEnglishDefinition(candidate));
  if (direct) return direct.trim();

  const html = payload.entryContent || payload.entries?.find((entry) => entry.entryContent)?.entryContent;
  if (!html) return undefined;

  const text = stripHtml(html)
    .split(/\s*(?:\n|;|•)\s*/)
    .map((candidate) => candidate.trim())
    .find((candidate) => cleanEnglishDefinition(candidate));
  return text;
}

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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
              "Do not include exam tips, long classroom explanations, Markdown, citations, or extra keys.",
              "The English definition must be one concise sentence.",
              "The Chinese definition must be concise and match the legal meaning when applicable.",
              "legalContext must be one short Chinese sentence explaining how this term is commonly understood in legal materials.",
              "phonetic must be IPA enclosed in forward slashes.",
              "Return one concise, generic or hypothetical legal example using the exact term, plus an accurate Chinese translation.",
              "Do not invent case names, statute names, section numbers, quotations, named parties, dates, holdings, or factual claims."
            ].join(" ")
          },
          {
            role: "user",
            content: `Term: ${term}\nReturn JSON with exactly these keys: term, englishDefinition, chineseDefinition, legalContext, phonetic, pronunciation, examples. examples must be an array with one object containing sentence and translation.`
          }
        ]
      })
    });

    if (!response.ok) return null;

    const data = await response.json() as OpenAIChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    return parseOpenAILegalLookupPayload(term, JSON.parse(content) as OpenAILegalLookupPayload);
  } catch {
    return null;
  }
}

export function parseOpenAILegalLookupPayload(
  requestedTerm: string,
  parsed: OpenAILegalLookupPayload
): DictionaryEntry | null {
  const definition = cleanEnglishDefinition(String(parsed.englishDefinition || ""));
  const chineseDefinition = String(parsed.chineseDefinition || "").trim();
  const legalContext = String(parsed.legalContext || "").trim();
  const returnedTerm = trimCell(String(parsed.term || requestedTerm));
  const examples = normalizeAIFeedbackExamples(returnedTerm, parsed.examples);
  const phonetic = normalizeIpa(parsed.phonetic) || normalizeIpa(parsed.pronunciation);

  if (
    !returnedTerm
    || !returnedTermMatchesRequest(requestedTerm, returnedTerm)
    || !definition
    || !chineseDefinition
    || !legalContext
    || !phonetic
    || containsCjk(definition)
    || !containsCjk(chineseDefinition)
    || !containsCjk(legalContext)
    || examples.length === 0
  ) {
    return null;
  }

  const existingNote = getLegalEnglishNote(returnedTerm) || getLegalEnglishNote(requestedTerm);
  return {
    term: returnedTerm,
    definition,
    chineseDefinition,
    legalContext,
    lookupQuality: "ai-legal",
    sourceLabel: "AI 法律词典",
    phonetic,
    pronunciation: phonetic,
    legalNote: {
      chineseMeaning: existingNote?.chineseMeaning || chineseDefinition,
      legalRegister: existingNote?.legalRegister || "法律英语",
      contextExplanation: legalContext,
      pattern: existingNote?.pattern,
      examples,
      comparison: existingNote?.comparison
    }
  };
}

function returnedTermMatchesRequest(requestedTerm: string, returnedTerm: string): boolean {
  const requested = normalizeTerm(requestedTerm);
  const returned = normalizeTerm(returnedTerm);
  if (requested === returned) return true;
  return requested
    .split(/\s*\/\s*/)
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(returned);
}

function normalizeAIFeedbackExamples(
  term: string,
  examples: OpenAILegalLookupPayload["examples"]
): LegalEnglishNote["examples"] {
  if (!Array.isArray(examples)) return [];
  const normalizedTerm = normalizeTerm(term);
  const matchTerms = normalizedTerm
    .replace(/\s*\([^)]*\)\s*$/, "")
    .split(/\s*\/\s*/)
    .map((value) => value.trim())
    .filter(Boolean);

  return examples
    .map((example) => ({
      sentence: String(example?.sentence || "").trim(),
      translation: String(example?.translation || "").trim()
    }))
    .filter((example) =>
      example.sentence.length >= 12
      && example.sentence.length <= 260
      && !containsCjk(example.sentence)
      && containsCjk(example.translation)
      && matchTerms.some((matchTerm) => normalizeTerm(example.sentence).includes(matchTerm))
      && !looksLikeUnsupportedLegalFact(example.sentence, matchTerms)
    )
    .slice(0, 2);
}

function normalizeIpa(value: unknown): string | undefined {
  const text = String(value || "").trim();
  if (!/^\/[^/\n]{2,100}\/$/.test(text)) return undefined;
  return text;
}

function looksLikeUnsupportedLegalFact(sentence: string, targetTerms: string[] = []): boolean {
  const withoutTarget = targetTerms.reduce(
    (value, term) => value.replace(new RegExp(escapeRegExp(term), "gi"), ""),
    sentence
  );
  return /\d/.test(withoutTarget)
    || /\b(?:v\.|versus|section|subsection|s\.)\s/i.test(withoutTarget)
    || /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(withoutTarget);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldUseOpenAILegalLookup(): boolean {
  const flag = process.env.USE_OPENAI_LEGAL_LOOKUP;
  if (flag === "false") return false;
  if (flag === "true") return Boolean(process.env.OPENAI_API_KEY);
  return Boolean(process.env.OPENAI_API_KEY);
}

function shouldAutoEnrichVocabFeedback(): boolean {
  return process.env.AUTO_ENRICH_VOCAB_FEEDBACK === "true"
    && shouldUseOpenAILegalLookup();
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
      sourceLabel: "参考资料",
      lookupWarning: "当前内容是参考摘要，并非精炼的词典释义。",
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
  return learningDayKey(new Date());
}

function dateKey(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? todayKey() : formatDateInLegalVocabTimeZone(date);
}

export function learningDayKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.valueOf())) {
    return learningDayKey(new Date());
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: legalVocabTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const calendarDate = `${values.year}-${values.month}-${values.day}`;
  return Number(values.hour) < 2 ? addDays(calendarDate, -1) : calendarDate;
}

export function getVocabDateContext(value: Date | string = new Date()): VocabDateContext {
  const learningDate = learningDayKey(value);
  return {
    learningDate,
    nextLearningDate: addDays(learningDate, 1)
  };
}

function formatDateInLegalVocabTimeZone(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: legalVocabTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getVocabPath(): string {
  return process.env.LEGAL_VOCAB_PATH
    || path.join(projectRoot, "output/legal-vocab.json");
}
