import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  backfillVocabQuality,
  calculateDailyTestStreak,
  enrichVocabFeedbackDetails,
  getLearningStatus,
  getVocabFeedbackEnrichmentAudit,
  getVocabItems,
  getVocabReview,
  importVocabText,
  lookupDictionaryTerm,
  markVocabQualityOk,
  parseOpenAILegalLookupPayload,
  parseVocabText,
  recordQuizQuestionStarted,
  recordVocabAnswer,
  saveDictionaryEntry,
  saveDictionaryTerm,
  updateVocabItem
} from "../services/vocab.js";

const tmpDir = path.join(os.tmpdir(), `legal-vocab-test-${Date.now()}`);
process.env.LEGAL_VOCAB_PATH = path.join(tmpDir, "legal-vocab.json");
process.env.USE_OPENAI_LEGAL_LOOKUP = "false";
const originalFetch = globalThis.fetch;

async function run() {
  await mkdir(tmpDir, { recursive: true });
  globalThis.fetch = mockDictionaryFetch as typeof fetch;

  const parsed = parseVocabText(`
estoppel - A rule preventing a person from denying something previously represented.
fiduciary duty: A duty to act loyally for another person's interests.
1. injunction - A court order requiring a person to do or stop doing an act.
- consideration: Something of value exchanged to form a binding contract.
bad line without separator
`);

  assert.equal(parsed.entries.length, 4);
  assert.equal(parsed.failed.length, 1);
  assert.equal(parsed.entries[0].term, "estoppel");
  assert.equal(parsed.entries[1].definition, "A duty to act loyally for another person's interests.");

  const mixedColumns = parseVocabText("strike down laws\t宣告法律无效\tConstitutional Law\tTo declare legislation invalid because it conflicts with the constitution.");
  assert.equal(mixedColumns.entries.length, 1);
  assert.equal(mixedColumns.entries[0].definition, "To declare that legislation is invalid and has no legal effect.");

  const builtInDefinition = parseVocabText("sever laws\t切除违宪部分\tConstitutional Law");
  assert.equal(builtInDefinition.entries.length, 1);
  assert.equal(builtInDefinition.failed.length, 0);
  assert.equal(builtInDefinition.entries[0].definition, "To remove an invalid part of a law while leaving the rest in force.");

  const categoryWordDefinition = parseVocabText("legislature\t立法机关\tConstitutional Law");
  assert.equal(categoryWordDefinition.entries.length, 1);
  assert.equal(categoryWordDefinition.entries[0].definition, "The law-making body of a jurisdiction.");

  const malformedDefinition = parseVocabText("bad entry - The law-making body of a .");
  assert.equal(malformedDefinition.entries.length, 0);
  assert.equal(malformedDefinition.failed.length, 1);

  const markdownTable = parseVocabText(`
| **charity / charities** | 慈善机构；慈善事业 | Constitutional Law / Division of Powers |
| **tavern** | 酒馆；酒吧（法律上指持牌酒类营业场所） | Constitutional Law / Licensing |
| **auctioneer** | 拍卖师；拍卖商 | Constitutional Law / Licensing |
| **solemnization** | （婚姻）依法举行；正式缔结 | Constitutional Law / Family Law |
`);
  assert.equal(markdownTable.entries.length, 4);
  assert.equal(markdownTable.failed.length, 0);
  assert.equal(markdownTable.entries[0].term, "charity / charities");
  assert.equal(markdownTable.entries[0].definition, "Organizations or activities established for legally recognized charitable purposes.");
  assert.equal(markdownTable.entries[3].pronunciation, "sah-lum-nuh-ZAY-shun");

  const lookup = await lookupDictionaryTerm("promulgated");
  assert.equal(lookup.found, true);
  assert.equal(lookup.source, "online");
  assert.equal(lookup.definition, "To make a law or decree known officially.");
  assert.equal(lookup.phonetic, "/ˈprɒməlɡeɪt/");
  assert.equal(lookup.pronunciation, "/ˈprɒməlɡeɪt/");
  assert.equal(lookup.audioUrl, "https://audio.example/promulgated.mp3");
  assert.equal(lookup.chineseDefinition, "正式颁布；公布");

  const ergoLookup = await lookupDictionaryTerm("ergo");
  assert.equal(ergoLookup.found, true);
  assert.equal(ergoLookup.definition, "Therefore; as a result.");
  assert.equal(ergoLookup.phonetic, "/ˈɜːrɡoʊ/");
  assert.equal(ergoLookup.legalNote?.chineseMeaning, "因此；所以；由此可见");
  assert.ok(ergoLookup.legalNote?.examples.some((example) => example.sentence.includes("ergo it falls within federal jurisdiction")));

  const paramountcyLookup = await lookupDictionaryTerm("doctrine of federal paramountcy");
  assert.equal(paramountcyLookup.found, true);
  assert.equal(paramountcyLookup.term, "Federal paramountcy");
  assert.ok(paramountcyLookup.definition.includes("doctrine in Canadian constitutional law"));
  assert.equal(paramountcyLookup.chineseDefinition, "联邦优先原则");

  const panelsLookup = await lookupDictionaryTerm("Panels of Judges");
  assert.equal(panelsLookup.found, true);
  assert.equal(panelsLookup.term, "panels of judges");
  assert.equal(panelsLookup.definition, "Groups of judges assigned to hear and decide cases together.");
  assert.equal(panelsLookup.chineseDefinition, "合议庭；审判小组");

  const wiretapLookup = await lookupDictionaryTerm("sign wiretap warrants");
  assert.equal(wiretapLookup.found, true);
  assert.equal(wiretapLookup.term, "sign wiretap warrants");
  assert.equal(wiretapLookup.definition, "To formally authorize wiretap warrants by signing them.");
  assert.equal(wiretapLookup.chineseDefinition, "签发通讯监听令");

  const quasiCriminalLookup = await lookupDictionaryTerm("quasi-criminal matters");
  assert.equal(quasiCriminalLookup.found, true);
  assert.equal(quasiCriminalLookup.definition, "Regulatory or statutory matters that are not true criminal prosecutions but may involve penalties or enforcement proceedings.");
  assert.equal(quasiCriminalLookup.chineseDefinition, "准刑事事项");

  const impositionLookup = await lookupDictionaryTerm("imposition");
  assert.equal(impositionLookup.found, true);
  assert.equal(impositionLookup.definition, "The act of imposing a duty, penalty, tax, or legal consequence.");
  assert.equal(impositionLookup.chineseDefinition, "施加；征收；处罚的施加");

  const laypersonLookup = await lookupDictionaryTerm("layperson");
  assert.equal(laypersonLookup.found, true);
  assert.equal(laypersonLookup.definition, "A person who is not a lawyer or specialist in the relevant legal field.");
  assert.equal(laypersonLookup.chineseDefinition, "非法律专业人士；普通人");

  const adjournedLookup = await lookupDictionaryTerm("adjourned");
  assert.equal(adjournedLookup.found, true);
  assert.equal(adjournedLookup.definition, "To postpone.");
  assert.equal(adjournedLookup.chineseDefinition, "已休庭；已延期；已推迟审理");

  const bailHearingsLookup = await lookupDictionaryTerm("bail hearings");
  assert.equal(bailHearingsLookup.found, true);
  assert.equal(bailHearingsLookup.definition, "Court hearings where judges decide whether accused persons should be released before trial and on what conditions.");
  assert.equal(bailHearingsLookup.chineseDefinition, "保释听证；保释聆讯");
  assert.equal(bailHearingsLookup.legalNote?.chineseMeaning, "保释听证；保释聆讯");
  assert.ok(bailHearingsLookup.legalNote?.contextExplanation.includes("not the trial itself"));

  const custodyLookup = await lookupDictionaryTerm("custody");
  assert.equal(custodyLookup.found, true);
  assert.equal(custodyLookup.definition, "The state of being kept under legal restraint.");
  assert.equal(custodyLookup.chineseDefinition, "处于法律拘束下的状态。");

  await assert.rejects(
    () => saveDictionaryEntry({
      term: "The Prank Panel",
      definition: "The Prank Panel is an American reality comedy series that aired on ABC."
    }),
    /不像法律英语词汇/
  );

  const savedLookupResult = await saveDictionaryTerm("promulgated");
  const savedLookup = savedLookupResult.item;
  assert.equal(savedLookupResult.created, true);
  assert.equal(savedLookup.term, "promulgated");
  assert.equal(savedLookup.definition, "To make a law or decree known officially.");
  assert.equal(savedLookup.chineseDefinition, "正式颁布；公布");
  assert.equal(savedLookup.phonetic, "/ˈprɒməlɡeɪt/");
  assert.equal(savedLookup.pronunciation, "/ˈprɒməlɡeɪt/");
  assert.equal(savedLookup.reviewState.nextReviewAt, addDateKeyDays(torontoDateKey(new Date()), 1));

  const repeatedLookupResult = await saveDictionaryTerm("promulgated");
  assert.equal(repeatedLookupResult.created, false);
  assert.equal(repeatedLookupResult.item.id, savedLookup.id);

  const firstTrackedLookup = await saveDictionaryEntry(lookup, {
    eventId: "web-promulgated-1",
    source: "web",
    occurredAt: "2026-07-25T12:00:00.000Z"
  });
  assert.equal(firstTrackedLookup.item.lookupStats?.count, 1);
  assert.equal(firstTrackedLookup.item.lookupStats?.historicalCountKnown, false);
  assert.equal(firstTrackedLookup.item.isImportant, false);

  const deduplicatedLookup = await saveDictionaryEntry(lookup, {
    eventId: "web-promulgated-1",
    source: "web",
    occurredAt: "2026-07-25T12:00:01.000Z"
  });
  assert.equal(deduplicatedLookup.item.lookupStats?.count, 1);

  const secondTrackedLookup = await saveDictionaryEntry(lookup, {
    eventId: "extension-promulgated-2",
    source: "extension-selection",
    occurredAt: "2026-07-25T12:01:00.000Z"
  });
  assert.equal(secondTrackedLookup.item.lookupStats?.count, 2);
  assert.equal(secondTrackedLookup.item.lookupStats?.sources.web, 1);
  assert.equal(secondTrackedLookup.item.lookupStats?.sources["extension-selection"], 1);
  assert.equal(secondTrackedLookup.item.isImportant, true);

  const firstLookupForNewItem = await saveDictionaryEntry({
    term: "tracked legal term",
    definition: "A legal term created after lookup tracking began for a new saved entry."
  }, {
    eventId: "desktop-new-term-1",
    source: "desktop-image",
    occurredAt: "2026-07-25T12:02:00.000Z"
  });
  assert.equal(firstLookupForNewItem.item.lookupStats?.count, 1);
  assert.equal(firstLookupForNewItem.item.lookupStats?.historicalCountKnown, true);
  assert.equal(firstLookupForNewItem.item.isImportant, false);

  const concurrentEntry = {
    term: "concurrent tracked term",
    definition: "A legal term used to verify concurrent lookup event deduplication."
  };
  await Promise.all([
    saveDictionaryEntry(concurrentEntry, {
      eventId: "concurrent-event-1",
      source: "web",
      occurredAt: "2026-07-25T12:03:00.000Z"
    }),
    saveDictionaryEntry(concurrentEntry, {
      eventId: "concurrent-event-1",
      source: "web",
      occurredAt: "2026-07-25T12:03:00.000Z"
    })
  ]);
  const concurrentTrackedItem = (await getVocabItems()).items.find((item) => item.term === concurrentEntry.term);
  assert.equal(concurrentTrackedItem?.lookupStats?.count, 1);
  assert.equal(concurrentTrackedItem?.isImportant, false);

  const savedImpositionResult = await saveDictionaryEntry({
    term: "imposition",
    definition: "The act of imposing a duty, penalty, tax, or legal consequence."
  });
  const savedImposition = savedImpositionResult.item;
  assert.equal(savedImposition.chineseDefinition, "施加；征收；处罚的施加");

  const savedImpartialResult = await saveDictionaryEntry({
    term: "impartial",
    definition: "Treating all parties equally and without bias, especially in a judicial or decision-making role."
  });
  const savedImpartial = savedImpartialResult.item;
  assert.equal(savedImpartial.chineseDefinition, "公正的；不偏不倚的");

  const impartialLookup = await lookupDictionaryTerm("impartial");
  assert.equal(impartialLookup.found, true);
  assert.equal(impartialLookup.definition, "Treating all parties equally and without bias, especially in a judicial or decision-making role.");
  assert.equal(impartialLookup.chineseDefinition, "公正的；不偏不倚的");

  const noEnglishDefinition = parseVocabText("unknown made-up term\t中文解释\tConstitutional Law");
  assert.equal(noEnglishDefinition.entries.length, 0);
  assert.equal(noEnglishDefinition.failed.length, 1);

  await writeFile(process.env.LEGAL_VOCAB_PATH!, JSON.stringify({
    version: "v0.1",
    updatedAt: "2026-07-08T00:00:00.000Z",
    items: [
      {
        id: "legacy-reference",
        term: "The Prank Panel",
        definition: "The Prank Panel is an American reality comedy series that aired on ABC.",
        sourceText: "The Prank Panel",
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
        reviewState: { status: "learning", correctStreak: 0, wrongCount: 0 }
      },
      {
        id: "legacy-legal",
        term: "imposition",
        definition: "The act of imposing a duty, penalty, tax, or legal consequence.",
        sourceText: "imposition",
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
        reviewState: { status: "learning", correctStreak: 0, wrongCount: 0 }
      }
    ]
  }), "utf8");

  const backfill = await backfillVocabQuality();
  assert.equal(backfill.scanned, 2);
  assert.equal(backfill.needsReview, 2);
  const backfilledItems = (await getVocabItems()).items;
  assert.equal(backfilledItems.find((item) => item.id === "legacy-reference")?.lookupQuality, "reference");
  assert.equal(backfilledItems.find((item) => item.id === "legacy-legal")?.lookupQuality, "legal-glossary");
  const markedOk = await markVocabQualityOk("legacy-reference");
  assert.equal(markedOk.item.lookupQuality, "saved");
  assert.equal(markedOk.item.lookupWarning, undefined);

  await writeFile(process.env.LEGAL_VOCAB_PATH!, JSON.stringify({
    version: "v0.1",
    updatedAt: "",
    items: []
  }), "utf8");

  const firstImport = await importVocabText(`
estoppel - A rule preventing a person from denying something previously represented.
fiduciary duty: A duty to act loyally for another person's interests.
1. injunction - A court order requiring a person to do or stop doing an act.
- consideration: Something of value exchanged to form a binding contract.
`);

  assert.equal(firstImport.imported, 4);
  assert.equal(firstImport.updated, 0);

  const updateImport = await importVocabText("Estoppel - A rule that prevents inconsistent conduct after reliance.");
  assert.equal(updateImport.imported, 0);
  assert.equal(updateImport.updated, 1);

  const { items } = await getVocabItems();
  assert.equal(items.length, 4);
  assert.equal(items.find((item) => item.term === "Estoppel")?.definition, "A rule that prevents inconsistent conduct after reliance.");

  const review = await getVocabReview("2026-07-08");
  assert.equal(review.canStart, true);
  assert.equal(review.questions.length, 4);
  assert.equal(review.questions[0].options.length, 4);
  assert.equal(new Set(review.questions[0].options).size, 4);
  assert.ok(review.questions[0].options.includes(review.questions[0].correctDefinition));
  assert.ok(Array.isArray(review.questions[0].examples));

  await saveDictionaryEntry({
    term: "Estoppel",
    definition: "A rule that prevents inconsistent conduct after reliance.",
    phonetic: "/ɪˈstɒpəl/",
    legalContext: "Courts may apply estoppel when one party relied on another party's earlier representation.",
    legalNote: {
      chineseMeaning: "禁止反言",
      legalRegister: "法律术语",
      contextExplanation: "Courts may apply estoppel when one party relied on another party's earlier representation.",
      examples: [{
        sentence: "The claimant was estopped from denying the earlier representation.",
        translation: "申请人因禁止反言而不得否认先前的陈述。"
      }]
    }
  });
  await importVocabText("Estoppel - A rule that prevents inconsistent conduct after reliance.");
  await saveDictionaryEntry({
    term: "Estoppel",
    definition: "A rule that prevents inconsistent conduct after reliance."
  });
  const preservedFeedbackItem = (await getVocabItems()).items.find((item) => item.term === "Estoppel");
  assert.equal(preservedFeedbackItem?.phonetic, "/ɪˈstɒpəl/");
  assert.ok(preservedFeedbackItem?.legalContext?.includes("earlier representation"));
  assert.equal(preservedFeedbackItem?.legalNote?.examples.length, 1);

  const practiceAll = await getVocabReview("2026-07-08", "all");
  assert.equal(practiceAll.canStart, true);
  assert.equal(practiceAll.questions.length, 4);
  const enrichedQuestion = practiceAll.questions.find((item) => item.term === "Estoppel");
  assert.equal(enrichedQuestion?.phonetic, "/ɪˈstɒpəl/");
  assert.ok(enrichedQuestion?.legalContext?.includes("earlier representation"));
  assert.equal(enrichedQuestion?.examples.length, 1);
  assert.ok(enrichedQuestion?.examples[0].sentence.includes("estopped"));

  const aiFeedbackEntry = parseOpenAILegalLookupPayload("consideration", {
    term: "consideration",
    englishDefinition: "Something of value exchanged to support an enforceable agreement.",
    chineseDefinition: "对价；支持合同具有可执行性的价值交换。",
    legalContext: "在合同法中，对价通常是判断承诺能否获得执行的重要要素。",
    phonetic: "/kənˌsɪdəˈreɪʃən/",
    pronunciation: "/kənˌsɪdəˈreɪʃən/",
    examples: [{
      sentence: "The court found that nominal consideration was sufficient to support the agreement.",
      translation: "法院认定名义对价足以支持该协议。"
    }]
  });
  assert.ok(aiFeedbackEntry);
  assert.equal(aiFeedbackEntry.legalNote?.examples.length, 1);
  assert.equal(parseOpenAILegalLookupPayload("consideration", {
    term: "valuable consideration",
    englishDefinition: "Something of value exchanged to support an enforceable agreement.",
    chineseDefinition: "对价",
    legalContext: "在合同法中，对价支持承诺的可执行性。",
    phonetic: "/kənˌsɪdəˈreɪʃən/",
    examples: [{
      sentence: "The agreement was supported by valuable consideration.",
      translation: "该协议具有有价对价支持。"
    }]
  }), null);
  assert.ok(parseOpenAILegalLookupPayload("Supremacy Clause", {
    term: "Supremacy Clause",
    englishDefinition: "A constitutional rule giving controlling effect to federal law over conflicting state law.",
    chineseDefinition: "联邦法律优先于冲突州法的宪法规则。",
    legalContext: "在宪法法律材料中，该术语用于分析联邦法与州法冲突。",
    phonetic: "/səˈpreməsi klɔːz/",
    examples: [{
      sentence: "The Supremacy Clause controls when a valid state rule conflicts with federal law.",
      translation: "当有效的州规则与联邦法律冲突时，联邦至上条款具有控制效力。"
    }]
  }));
  assert.ok(parseOpenAILegalLookupPayload("charity / charities", {
    term: "charity",
    englishDefinition: "An organization established for legally recognized charitable purposes.",
    chineseDefinition: "为法律认可的慈善目的而设立的组织。",
    legalContext: "在慈善法中，该术语涉及组织目的、注册资格与监管义务。",
    phonetic: "/ˈtʃærəti/",
    examples: [{
      sentence: "A charity must use its property only for its stated charitable purposes.",
      translation: "慈善机构必须仅将其财产用于所声明的慈善目的。"
    }]
  }));
  assert.equal(parseOpenAILegalLookupPayload("consideration", {
    term: "consideration",
    englishDefinition: "Something of value exchanged to support an enforceable agreement.",
    chineseDefinition: "对价",
    legalContext: "在合同法中，对价支持承诺的可执行性。",
    phonetic: "con-sid-er-AY-shun",
    examples: [{
      sentence: "The promise lacked consideration and was not enforceable.",
      translation: "该承诺缺乏对价，因此不可执行。"
    }]
  }), null);
  assert.equal(parseOpenAILegalLookupPayload("consideration", {
    term: "consideration",
    englishDefinition: "Something of value exchanged to support an enforceable agreement.",
    chineseDefinition: "对价",
    legalContext: "在合同法中，对价支持承诺的可执行性。",
    phonetic: "/kənˌsɪdəˈreɪʃən/",
    examples: [{
      sentence: "In Smith v. Jones 2024, the court found valid consideration.",
      translation: "在该案中，法院认定存在有效对价。"
    }]
  }), null);
  assert.equal(parseOpenAILegalLookupPayload("consideration", {
    term: "consideration",
    englishDefinition: "Something of value exchanged to support an enforceable agreement.",
    chineseDefinition: "对价",
    legalContext: "在合同法中，对价支持承诺的可执行性。",
    examples: [{
      sentence: "The parties signed the agreement.",
      translation: "双方签署了协议。"
    }]
  }), null);

  const feedbackTarget = (await getVocabItems()).items.find((item) => item.term.toLowerCase() === "consideration");
  assert.ok(feedbackTarget);
  const beforeFeedbackDryRun = await readFile(process.env.LEGAL_VOCAB_PATH!, "utf8");
  const targetHistoryBefore = JSON.parse(beforeFeedbackDryRun).items
    .find((item: { id: string }) => item.id === feedbackTarget.id);
  const feedbackDryRun = await enrichVocabFeedbackDetails({
    itemIds: [feedbackTarget.id],
    dryRun: true,
    resolveEntry: async () => aiFeedbackEntry
  });
  assert.equal(feedbackDryRun.enriched, 1);
  assert.equal(await readFile(process.env.LEGAL_VOCAB_PATH!, "utf8"), beforeFeedbackDryRun);

  const feedbackApplied = await enrichVocabFeedbackDetails({
    itemIds: [feedbackTarget.id],
    dryRun: false,
    resolveEntry: async () => aiFeedbackEntry
  });
  assert.equal(feedbackApplied.enriched, 1);
  const afterFeedbackStore = JSON.parse(await readFile(process.env.LEGAL_VOCAB_PATH!, "utf8"));
  const targetHistoryAfter = afterFeedbackStore.items
    .find((item: { id: string }) => item.id === feedbackTarget.id);
  assert.equal(targetHistoryAfter.phonetic, "/kənˌsɪdəˈreɪʃən/");
  assert.equal(targetHistoryAfter.legalNote.examples.length, 1);
  assert.deepEqual(targetHistoryAfter.reviewState, targetHistoryBefore.reviewState);
  assert.equal(targetHistoryAfter.definition, targetHistoryBefore.definition);
  assert.equal(targetHistoryAfter.createdAt, targetHistoryBefore.createdAt);
  assert.equal(targetHistoryAfter.updatedAt, targetHistoryBefore.updatedAt);
  const feedbackAudit = await getVocabFeedbackEnrichmentAudit();
  assert.ok(feedbackAudit.total >= feedbackAudit.complete);
  assert.equal(
    feedbackAudit.total,
    feedbackAudit.complete + feedbackAudit.missingAny
  );

  const question = review.questions.find((item) => item.term === "Estoppel");
  assert.ok(question);

  const wrong = await recordVocabAnswer({
    itemId: question.itemId,
    selectedDefinition: question.options.find((option) => option !== question.correctDefinition) ?? "",
    correctDefinition: question.correctDefinition,
    isCorrect: false,
    answeredAt: "2026-07-08T12:00:00.000Z"
  });

  assert.equal(wrong.reviewState.status, "learning");
  assert.equal(wrong.reviewState.correctStreak, 0);
  assert.equal(wrong.reviewState.wrongCount, 1);
  assert.equal(wrong.reviewState.nextReviewAt, "2026-07-09");

  const wrongQueue = await getVocabReview("2026-07-08", "wrong");
  assert.equal(wrongQueue.canStart, true);
  assert.equal(wrongQueue.questions.length, 1);
  assert.equal(wrongQueue.questions[0].term, "Estoppel");

  const firstCorrect = await recordVocabAnswer({
    itemId: question.itemId,
    selectedDefinition: question.correctDefinition,
    correctDefinition: question.correctDefinition,
    isCorrect: true,
    answeredAt: "2026-07-09T12:00:00.000Z"
  });
  assert.equal(firstCorrect.reviewState.correctStreak, 1);
  assert.equal(firstCorrect.reviewState.nextReviewAt, "2026-07-12");
  assert.equal(firstCorrect.reviewState.lastIntervalDays, 3);
  assert.ok((firstCorrect.reviewState.memoryStrength ?? 0) > 0);
  assert.equal(firstCorrect.reviewState.retentionTarget, 0.85);
  assert.equal((await getVocabItems()).stats.reviewed, 1);

  const secondCorrect = await recordVocabAnswer({
    itemId: question.itemId,
    selectedDefinition: question.correctDefinition,
    correctDefinition: question.correctDefinition,
    isCorrect: true,
    answeredAt: "2026-07-12T12:00:00.000Z"
  });
  assert.equal(secondCorrect.reviewState.nextReviewAt, "2026-07-19");
  assert.equal(secondCorrect.reviewState.lastIntervalDays, 7);

  const thirdCorrect = await recordVocabAnswer({
    itemId: question.itemId,
    selectedDefinition: question.correctDefinition,
    correctDefinition: question.correctDefinition,
    isCorrect: true,
    answeredAt: "2026-07-19T12:00:00.000Z"
  });
  assert.equal(thirdCorrect.reviewState.nextReviewAt, "2026-08-01");
  assert.equal(thirdCorrect.reviewState.lastIntervalDays, 13);

  const fourthCorrect = await recordVocabAnswer({
    itemId: question.itemId,
    selectedDefinition: question.correctDefinition,
    correctDefinition: question.correctDefinition,
    isCorrect: true,
    answeredAt: "2026-08-02T12:00:00.000Z"
  });
  assert.equal(fourthCorrect.reviewState.status, "mastered");
  assert.equal(fourthCorrect.reviewState.nextReviewAt, "2026-08-31");
  assert.equal(fourthCorrect.reviewState.lastIntervalDays, 29);
  assert.equal((await getVocabItems()).stats.mastered, 1);

  await writeFile(process.env.LEGAL_VOCAB_PATH!, JSON.stringify({
    version: "v0.1",
    updatedAt: "2026-07-18T12:00:00.000Z",
    items: [
      legacyItem("legacy bad", "The law-making body of a ."),
      legacyItem("valid one", "A valid legal definition used for the first quiz option."),
      legacyItem("valid two", "A valid legal definition used for the second quiz option."),
      legacyItem("valid three", "A valid legal definition used for the third quiz option."),
      legacyItem("valid four", "A valid legal definition used for the fourth quiz option.")
    ]
  }), "utf8");
  const legacyReview = await getVocabReview("2026-07-18", "all");
  assert.equal(legacyReview.canStart, true);
  assert.equal(legacyReview.questions.length, 4);
  assert.equal(legacyReview.questions.some((legacyQuestion) => legacyQuestion.term === "legacy bad"), false);
  assert.equal(legacyReview.questions.some((legacyQuestion) => legacyQuestion.options.includes("The law-making body of a .")), false);

  await writeFile(process.env.LEGAL_VOCAB_PATH!, JSON.stringify({
    version: "v0.1",
    updatedAt: "2026-07-18T12:00:00.000Z",
    items: [
      legacyItem("custody", "The state of being kept under legal ."),
      legacyItem("valid one", "A valid legal definition used for the first quiz option."),
      legacyItem("valid two", "A valid legal definition used for the second quiz option."),
      legacyItem("valid three", "A valid legal definition used for the third quiz option.")
    ]
  }), "utf8");
  const repairedReview = await getVocabReview("2026-07-18", "all");
  assert.equal(repairedReview.canStart, false);
  const repairedCustody = (await getVocabItems()).items.find((item) => item.term === "custody");
  assert.notEqual(repairedCustody?.definition, "The state of being kept under legal restraint.");
  await updateVocabItem(repairedCustody!.id, {
    term: "custody",
    definition: "The state of being kept under legal restraint."
  });
  const confirmedRepairReview = await getVocabReview("2026-07-18", "all");
  assert.equal(confirmedRepairReview.canStart, true);
  assert.equal(confirmedRepairReview.questions.length, 4);

  const now = new Date().toISOString();
  const today = torontoDateKey(new Date(now));
  await writeFile(process.env.LEGAL_VOCAB_PATH!, JSON.stringify({
    version: "v0.1",
    updatedAt: now,
    items: [
      {
        ...legacyItem("focus term", "A legal definition for a term needing focused review."),
        createdAt: now,
        updatedAt: now,
        reviewState: {
          status: "learning",
          correctStreak: 0,
          wrongCount: 2,
          focus: true,
          lastResult: "wrong",
          lastReviewedAt: today,
          nextReviewAt: today
        }
      },
      {
        ...legacyItem("mastered term", "A legal definition for a mastered vocabulary term."),
        createdAt: now,
        updatedAt: now,
        reviewState: {
          status: "mastered",
          correctStreak: 4,
          wrongCount: 0,
          lastResult: "correct",
          lastReviewedAt: today,
          nextReviewAt: "2099-01-01"
        }
      }
    ]
  }), "utf8");
  const learningStatus = await getLearningStatus();
  assert.equal(learningStatus.todayAdded, 2);
  assert.equal(learningStatus.dueToday, 1);
  assert.equal(learningStatus.learningStreakDays, 1);
  assert.equal(learningStatus.masteryRate, 50);
  assert.equal(learningStatus.repeatedWrong, 1);
  assert.equal(learningStatus.petState, "focus");

  const staleWrongAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await writeFile(process.env.LEGAL_VOCAB_PATH!, JSON.stringify({
    version: "v0.1",
    updatedAt: staleWrongAt,
    items: [
      {
        ...legacyItem("stale wrong", "A due legal term with an older repeated mistake."),
        createdAt: staleWrongAt,
        updatedAt: staleWrongAt,
        reviewState: {
          status: "learning",
          correctStreak: 0,
          wrongCount: 3,
          focus: true,
          lastResult: "wrong",
          lastReviewedAt: today,
          nextReviewAt: today
        }
      }
    ]
  }), "utf8");
  const staleWrongStatus = await getLearningStatus();
  assert.equal(staleWrongStatus.repeatedWrong, 1);
  assert.equal(staleWrongStatus.dueToday, 1);
  assert.equal(staleWrongStatus.petState, "due");

  await writeFile(process.env.LEGAL_VOCAB_PATH!, JSON.stringify({
    version: "v0.1",
    updatedAt: now,
    items: [
      {
        ...legacyItem("recent correct", "A legal term answered correctly just now."),
        createdAt: now,
        updatedAt: now,
        reviewState: {
          status: "review",
          correctStreak: 1,
          wrongCount: 0,
          lastResult: "correct",
          lastReviewedAt: today,
          nextReviewAt: today
        }
      }
    ]
  }), "utf8");
  const recentCorrectStatus = await getLearningStatus();
  assert.equal(recentCorrectStatus.petState, "encourage");

  const expiredCorrectAt = new Date(Date.now() - 10_000).toISOString();
  await writeFile(process.env.LEGAL_VOCAB_PATH!, JSON.stringify({
    version: "v0.1",
    updatedAt: expiredCorrectAt,
    items: [
      {
        ...legacyItem("expired correct", "A due term whose success celebration has expired."),
        createdAt: expiredCorrectAt,
        updatedAt: expiredCorrectAt,
        reviewState: {
          status: "review",
          correctStreak: 1,
          wrongCount: 0,
          lastResult: "correct",
          lastReviewedAt: today,
          nextReviewAt: today
        }
      }
    ]
  }), "utf8");
  const expiredCorrectStatus = await getLearningStatus();
  assert.equal(expiredCorrectStatus.petState, "due");

  await writeFile(process.env.LEGAL_VOCAB_PATH!, JSON.stringify({
    version: "v0.1",
    updatedAt: now,
    items: []
  }), "utf8");
  const idleStatus = await getLearningStatus();
  assert.equal(idleStatus.dueToday, 0);
  assert.equal(idleStatus.petState, "idle");

  const eventTestNow = new Date().toISOString();
  await writeFile(process.env.LEGAL_VOCAB_PATH!, JSON.stringify({
    version: "v0.1",
    updatedAt: eventTestNow,
    items: [
      legacyItem("event target", "The authoritative definition for the event target."),
      legacyItem("event distractor one", "A distinct first distractor definition."),
      legacyItem("event distractor two", "A distinct second distractor definition."),
      legacyItem("event distractor three", "A distinct third distractor definition.")
    ]
  }), "utf8");

  const correctEvent = await recordVocabAnswer({
    itemId: "event-target",
    selectedDefinition: "The authoritative definition for the event target.",
    correctDefinition: "The authoritative definition for the event target.",
    isCorrect: true,
    answeredAt: eventTestNow,
    sessionId: "event-session",
    attemptKind: "plan"
  });
  assert.equal(correctEvent.reviewState.wrongStreak, 0);
  const statusAfterCorrect = await getLearningStatus();
  assert.equal(statusAfterCorrect.petState, "encourage");
  assert.equal(statusAfterCorrect.recentReview?.result, "correct");

  const firstWrongEvent = await recordVocabAnswer({
    itemId: "event-target",
    selectedDefinition: "A distinct first distractor definition.",
    correctDefinition: "The authoritative definition for the event target.",
    isCorrect: true,
    answeredAt: eventTestNow,
    sessionId: "event-session",
    attemptKind: "plan"
  });
  assert.equal(firstWrongEvent.reviewState.lastResult, "wrong");
  assert.equal(firstWrongEvent.reviewState.wrongStreak, 1);
  const statusAfterFirstWrong = await getLearningStatus();
  assert.equal(statusAfterFirstWrong.petState, "failure");
  assert.equal(statusAfterFirstWrong.recentReview?.result, "wrong");
  assert.equal(statusAfterFirstWrong.recentReview?.wrongStreak, 1);

  const secondWrongEvent = await recordVocabAnswer({
    itemId: "event-target",
    selectedDefinition: "A distinct second distractor definition.",
    correctDefinition: "The authoritative definition for the event target.",
    isCorrect: false,
    answeredAt: eventTestNow,
    sessionId: "event-session",
    attemptKind: "reinforcement"
  });
  assert.equal(secondWrongEvent.reviewState.wrongStreak, 2);
  const statusAfterSecondWrong = await getLearningStatus();
  assert.equal(statusAfterSecondWrong.petState, "focus");
  assert.equal(statusAfterSecondWrong.recentReview?.wrongStreak, 2);

  await recordVocabAnswer({
    itemId: "event-target",
    selectedDefinition: "The authoritative definition for the event target.",
    correctDefinition: "The authoritative definition for the event target.",
    isCorrect: true,
    answeredAt: eventTestNow,
    sessionId: "event-recovery-1",
    attemptKind: "independent"
  });
  const statusAfterRecovery = await getLearningStatus();
  assert.equal(statusAfterRecovery.petState, "encourage");
  assert.equal(statusAfterRecovery.recentReview?.result, "correct");

  const lifecycleBase = Date.now() - 1_000;
  const lifecycleTime = (offset: number) => new Date(lifecycleBase + offset).toISOString();
  await recordVocabAnswer({
    itemId: "event-target",
    selectedDefinition: "The authoritative definition for the event target.",
    correctDefinition: "The authoritative definition for the event target.",
    isCorrect: true,
    answeredAt: lifecycleTime(100)
  });
  assert.equal((await getLearningStatus()).petState, "encourage");

  await recordQuizQuestionStarted({
    itemId: "event-distractor-one",
    occurredAt: lifecycleTime(200)
  });
  const firstNextQuestionStatus = await getLearningStatus();
  assert.equal(firstNextQuestionStatus.petState, "due");
  assert.equal(firstNextQuestionStatus.message, "准备作答");
  assert.equal(firstNextQuestionStatus.activeQuestion?.itemId, "event-distractor-one");

  await recordVocabAnswer({
    itemId: "event-distractor-one",
    selectedDefinition: "A distinct second distractor definition.",
    correctDefinition: "A distinct first distractor definition.",
    isCorrect: false,
    answeredAt: lifecycleTime(300)
  });
  const wrongSecondQuestionStatus = await getLearningStatus();
  assert.equal(wrongSecondQuestionStatus.petState, "failure");
  assert.equal(wrongSecondQuestionStatus.activeQuestion, undefined);

  await recordVocabAnswer({
    itemId: "event-target",
    selectedDefinition: "The authoritative definition for the event target.",
    correctDefinition: "The authoritative definition for the event target.",
    isCorrect: true,
    answeredAt: lifecycleTime(400)
  });
  await recordQuizQuestionStarted({
    itemId: "event-distractor-one",
    occurredAt: lifecycleTime(500)
  });
  assert.equal((await getLearningStatus()).petState, "due");

  await recordVocabAnswer({
    itemId: "event-distractor-one",
    selectedDefinition: "A distinct first distractor definition.",
    correctDefinition: "A distinct first distractor definition.",
    isCorrect: true,
    answeredAt: lifecycleTime(600)
  });
  const correctSecondQuestionStatus = await getLearningStatus();
  assert.equal(correctSecondQuestionStatus.petState, "encourage");
  assert.equal(correctSecondQuestionStatus.recentReview?.itemId, "event-distractor-one");
  assert.equal(correctSecondQuestionStatus.activeQuestion, undefined);

  await recordQuizQuestionStarted({
    itemId: "event-distractor-one",
    occurredAt: lifecycleTime(550)
  });
  const delayedStartStatus = await getLearningStatus();
  assert.equal(delayedStartStatus.petState, "encourage");
  assert.equal(delayedStartStatus.activeQuestion, undefined);

  const torontoToday = torontoDateKey(new Date());
  await writeFile(process.env.LEGAL_VOCAB_PATH!, JSON.stringify({
    version: "v0.1",
    updatedAt: new Date().toISOString(),
    items: [
      legacyItem("priority important", "The important new-word candidate definition."),
      legacyItem("priority normal", "The ordinary new-word candidate definition."),
      legacyItem("priority distractor one", "A distinct definition used as the first priority distractor."),
      legacyItem("priority distractor two", "A distinct definition used as the second priority distractor.")
    ]
  }), "utf8");
  const priorityEntry = {
    term: "priority important",
    definition: "The important new-word candidate definition."
  };
  await saveDictionaryEntry(priorityEntry, {
    eventId: "priority-event-1",
    source: "web",
    occurredAt: "2026-07-25T14:00:00.000Z"
  });
  await saveDictionaryEntry(priorityEntry, {
    eventId: "priority-event-2",
    source: "extension-image",
    occurredAt: "2026-07-25T14:01:00.000Z"
  });
  const priorityReview = await getVocabReview(addDateKeyDays(torontoToday, 1), "due");
  const importantIndex = priorityReview.questions.findIndex((question) => question.term === "priority important");
  const normalIndex = priorityReview.questions.findIndex((question) => question.term === "priority normal");
  assert.ok(importantIndex >= 0);
  assert.ok(normalIndex >= 0);
  assert.ok(importantIndex < normalIndex);

  await writeFile(process.env.LEGAL_VOCAB_PATH!, JSON.stringify({
    version: "v0.1",
    updatedAt: new Date().toISOString(),
    items: [
      legacyItem("daily one", "The first daily review definition."),
      legacyItem("daily two", "The second daily review definition."),
      legacyItem("daily three", "The third daily review definition."),
      legacyItem("daily four", "The fourth daily review definition.")
    ]
  }), "utf8");
  const dailyReview = await getVocabReview(torontoToday, "due");
  assert.equal(dailyReview.questions.length, 4);

  for (const question of dailyReview.questions.slice(0, 3)) {
    await recordVocabAnswer({
      itemId: question.itemId,
      selectedDefinition: question.correctDefinition,
      correctDefinition: question.correctDefinition,
      isCorrect: true
    });
  }
  const incompleteDailyStatus = await getLearningStatus();
  assert.equal(incompleteDailyStatus.dailyPlanTotal, 4);
  assert.equal(incompleteDailyStatus.dailyPlanCompleted, 3);
  assert.equal(incompleteDailyStatus.dailyTestStreakDays, 0);

  const finalDailyQuestion = dailyReview.questions[3];
  await recordVocabAnswer({
    itemId: finalDailyQuestion.itemId,
    selectedDefinition: finalDailyQuestion.options.find((option) => option !== finalDailyQuestion.correctDefinition) ?? "",
    correctDefinition: finalDailyQuestion.correctDefinition,
    isCorrect: false
  });
  const completedDailyStatus = await getLearningStatus();
  assert.equal(completedDailyStatus.dailyPlanCompleted, 4);
  assert.equal(completedDailyStatus.dailyTestStreakDays, 1);

  const completePlan = (date: string) => ({
    date,
    dueItemIds: [`due-${date}`],
    completedItemIds: [`due-${date}`],
    createdAt: `${date}T12:00:00.000Z`,
    completedAt: `${date}T13:00:00.000Z`
  });
  const incompletePlan = (date: string) => ({
    date,
    dueItemIds: [`due-${date}`],
    completedItemIds: [],
    createdAt: `${date}T12:00:00.000Z`
  });
  assert.equal(calculateDailyTestStreak({
    "2026-07-08": completePlan("2026-07-08"),
    "2026-07-09": completePlan("2026-07-09"),
    "2026-07-10": completePlan("2026-07-10")
  }, "2026-07-10"), 3);
  assert.equal(calculateDailyTestStreak({
    "2026-07-08": completePlan("2026-07-08"),
    "2026-07-09": incompletePlan("2026-07-09"),
    "2026-07-10": completePlan("2026-07-10")
  }, "2026-07-10"), 1);
  assert.equal(calculateDailyTestStreak({
    "2026-07-09": completePlan("2026-07-09"),
    "2026-07-10": {
      date: "2026-07-10",
      dueItemIds: [],
      completedItemIds: [],
      createdAt: "2026-07-10T12:00:00.000Z"
    }
  }, "2026-07-10"), 1);

  await writeFile(process.env.LEGAL_VOCAB_PATH!, JSON.stringify({
    version: "v0.1",
    updatedAt: "2026-07-26T02:30:00.000Z",
    items: [legacyItem("timezone item", "A definition for testing the Toronto day boundary.")]
  }), "utf8");
  await recordVocabAnswer({
    itemId: "timezone-item",
    selectedDefinition: "A definition for testing the Toronto day boundary.",
    correctDefinition: "A definition for testing the Toronto day boundary.",
    isCorrect: true,
    answeredAt: "2026-07-26T02:30:00.000Z"
  });
  const timezoneStore = JSON.parse(await readFile(process.env.LEGAL_VOCAB_PATH!, "utf8"));
  assert.ok(timezoneStore.dailyReviewPlans["2026-07-25"]);
  assert.equal(timezoneStore.dailyReviewPlans["2026-07-26"], undefined);

  await rm(tmpDir, { recursive: true, force: true });
  globalThis.fetch = originalFetch;
  console.log("Vocab fixture passed");
}

function legacyItem(term: string, definition: string) {
  return {
    id: term.replace(/\s+/g, "-"),
    term,
    definition,
    sourceText: `${term} - ${definition}`,
    createdAt: "2026-07-18T12:00:00.000Z",
    updatedAt: "2026-07-18T12:00:00.000Z",
    lookupQuality: "saved",
    reviewState: {
      status: "new",
      correctStreak: 0,
      wrongCount: 0
    }
  };
}

function torontoDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDateKeyDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

run().catch(async (error) => {
  globalThis.fetch = originalFetch;
  await rm(tmpDir, { recursive: true, force: true });
  console.error(error);
  process.exit(1);
});

async function mockDictionaryFetch(input: string | URL | Request): Promise<Response> {
  const url = String(input);
  if (url.includes("translate.googleapis.com")) {
    return new Response(JSON.stringify([[["处于法律拘束下的状态。", "The state of being kept under legal restraint.", null, null]]]), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (url.includes("en.wikipedia.org/w/api.php")) {
    return new Response(JSON.stringify({
      query: {
        search: [{ title: "Federal paramountcy" }]
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (url.includes("en.wikipedia.org/api/rest_v1/page/summary/Federal%20paramountcy")) {
    return new Response(JSON.stringify({
      title: "Federal paramountcy",
      extract: "Federal paramountcy is a doctrine in Canadian constitutional law that applies where valid federal and provincial laws conflict."
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  const term = decodeURIComponent(url.split("/").pop() ?? "").toLowerCase();
  const entries: Record<string, unknown> = {
    promulgated: [
      {
        word: "promulgated",
        phonetic: "/ˈprɒməlɡeɪt/",
        phonetics: [
          {
            text: "/ˈprɒməlɡeɪt/",
            audio: "//audio.example/promulgated.mp3"
          }
        ],
        meanings: [
          {
            partOfSpeech: "verb",
            definitions: [
              {
                definition: "To make a law or decree known officially."
              }
            ]
          }
        ]
      }
    ],
    ergo: [
      {
        word: "ergo",
        phonetic: "/ˈɜːɡəʊ/",
        phonetics: [{ text: "/ˈɜːɡəʊ/" }],
        meanings: [
          {
            partOfSpeech: "adverb",
            definitions: [{ definition: "Therefore; as a result." }]
          }
        ]
      }
    ],
    adjourned: [
      {
        word: "adjourned",
        meanings: [
          {
            partOfSpeech: "verb",
            definitions: [{ definition: "To postpone." }]
          }
        ]
      }
    ],
    custody: [
      {
        word: "custody",
        meanings: [
          {
            partOfSpeech: "noun",
            definitions: [{ definition: "The state of being kept under legal restraint." }]
          }
        ]
      }
    ]
  };

  const body = entries[term];
  if (!body) {
    return new Response(JSON.stringify({ title: "No Definitions Found" }), { status: 404 });
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
