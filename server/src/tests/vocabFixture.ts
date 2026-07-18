import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  backfillVocabQuality,
  getVocabItems,
  getVocabReview,
  importVocabText,
  lookupDictionaryTerm,
  markVocabQualityOk,
  parseVocabText,
  recordVocabAnswer,
  saveDictionaryEntry,
  saveDictionaryTerm
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
    /does not look like a legal English term/
  );

  const savedLookupResult = await saveDictionaryTerm("promulgated");
  const savedLookup = savedLookupResult.item;
  assert.equal(savedLookupResult.created, true);
  assert.equal(savedLookup.term, "promulgated");
  assert.equal(savedLookup.definition, "To make a law or decree known officially.");
  assert.equal(savedLookup.chineseDefinition, "正式颁布；公布");
  assert.equal(savedLookup.phonetic, "/ˈprɒməlɡeɪt/");
  assert.equal(savedLookup.pronunciation, "/ˈprɒməlɡeɪt/");
  assert.equal(savedLookup.reviewState.nextReviewAt, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10));

  const repeatedLookupResult = await saveDictionaryTerm("promulgated");
  assert.equal(repeatedLookupResult.created, false);
  assert.equal(repeatedLookupResult.item.id, savedLookup.id);

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
  assert.equal(backfill.needsReview, 1);
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

  const practiceAll = await getVocabReview("2026-07-08", "all");
  assert.equal(practiceAll.canStart, true);
  assert.equal(practiceAll.questions.length, 4);

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
  assert.equal(repairedReview.canStart, true);
  assert.equal(repairedReview.questions.length, 4);
  const repairedCustody = (await getVocabItems()).items.find((item) => item.term === "custody");
  assert.equal(repairedCustody?.definition, "The state of being kept under legal restraint.");

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
    reviewState: {
      status: "new",
      correctStreak: 0,
      wrongCount: 0
    }
  };
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
