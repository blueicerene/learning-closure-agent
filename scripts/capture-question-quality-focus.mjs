import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "/Users/rene/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const outputDir = fileURLToPath(new URL("../artifacts/release-gate/question-quality-focus/", import.meta.url));
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const page = await browser.newPage({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:5174/", { waitUntil: "networkidle" });
await page.screenshot({
  path: `${outputDir}/focus-home-400px.png`,
  fullPage: true
});

const focusButton = page.getByRole("button", { name: /大王提醒：有 4 个词需要重点复习/ });
await focusButton.click();
await page.getByRole("heading", { name: "重点复习", exact: true }).waitFor();
await page.screenshot({
  path: `${outputDir}/focus-quiz-400px.png`,
  fullPage: true
});

await page.goto("http://127.0.0.1:5174/?quizResultFixture=wrong", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "题目有问题", exact: true }).waitFor();
await page.screenshot({
  path: `${outputDir}/question-issue-wrong-result-400px.png`,
  fullPage: true
});

console.log(JSON.stringify({
  focusCardVisible: true,
  focusCount: 4,
  focusQuizOpened: true,
  questionIssueVisibleOnWrongResult: true,
  screenshots: [
    "artifacts/release-gate/question-quality-focus/focus-home-400px.png",
    "artifacts/release-gate/question-quality-focus/focus-quiz-400px.png",
    "artifacts/release-gate/question-quality-focus/question-issue-wrong-result-400px.png"
  ]
}));
await browser.close();
