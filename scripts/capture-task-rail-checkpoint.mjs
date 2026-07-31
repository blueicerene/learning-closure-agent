import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "/Users/rene/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"
);

const baseUrl = "http://127.0.0.1:5174/";
const outputDir = path.resolve("artifacts/release-gate/task-rail-checkpoint");
const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox"]
});

const evidence = {};

async function openPage(width, height) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width, height }
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  return { context, page };
}

async function box(locator, name) {
  const value = await locator.boundingBox();
  if (!value) throw new Error(`${name} is not visible`);
  return value;
}

async function openFocusQuiz(page) {
  if (await page.locator(".task-rail-mobile-toggle").isVisible()) {
    await page.locator(".task-rail-mobile-toggle").click();
  }

  const focusButton = page.locator(".rail-focus");
  if (!(await focusButton.isVisible())) {
    throw new Error("Focus review entry is unavailable on the real page");
  }

  await focusButton.click();
  await page.getByRole("heading", { name: "重点复习" }).waitFor();
  await page.locator(".option-button").first().waitFor();
}

try {
  {
    const { context, page } = await openPage(1440, 900);
    const input = await box(page.getByPlaceholder("promulgated"), "desktop lookup input");
    const rail = await box(page.locator(".task-rail"), "desktop task rail");
    evidence.desktopLookup = { input, rail, viewport: page.viewportSize() };
    await page.screenshot({
      path: path.join(outputDir, "desktop-lookup-1440.png")
    });
    await context.close();
  }

  {
    const { context, page } = await openPage(1440, 900);
    await openFocusQuiz(page);
    const term = await box(page.locator(".quiz-panel h3"), "desktop quiz term");
    const options = await page.locator(".option-button").all();
    const lastOption = await box(options.at(-1), "desktop last answer option");
    const rail = await box(page.locator(".task-rail"), "desktop quiz task rail");
    if (lastOption.y + lastOption.height > 900) {
      throw new Error("Desktop quiz answers require scrolling");
    }
    evidence.desktopQuiz = { term, lastOption, rail, viewport: page.viewportSize() };
    await page.screenshot({
      path: path.join(outputDir, "desktop-quiz-1440.png")
    });
    await context.close();
  }

  {
    const { context, page } = await openPage(390, 844);
    const input = await box(page.getByPlaceholder("promulgated"), "390px lookup input");
    const lookupButton = await box(
      page.getByRole("button", { name: "查询", exact: true }),
      "390px lookup button"
    );
    const taskBar = await box(
      page.locator(".task-rail-mobile-toggle"),
      "390px task bar"
    );
    if (lookupButton.y + lookupButton.height > taskBar.y) {
      throw new Error("390px task bar overlaps lookup controls");
    }
    evidence.mobileLookup = {
      input,
      lookupButton,
      taskBar,
      viewport: page.viewportSize()
    };
    await page.screenshot({
      path: path.join(outputDir, "mobile-lookup-390.png")
    });
    await context.close();
  }

  {
    const { context, page } = await openPage(400, 900);
    await openFocusQuiz(page);
    const term = await box(page.locator(".quiz-panel h3"), "400px quiz term");
    const firstOption = await box(
      page.locator(".option-button").first(),
      "400px first answer option"
    );
    const taskBar = await box(
      page.locator(".task-rail-mobile-toggle"),
      "400px task bar"
    );
    if (firstOption.y + firstOption.height > taskBar.y) {
      throw new Error("400px task bar overlaps the first answer option");
    }
    evidence.mobileQuiz = {
      term,
      firstOption,
      taskBar,
      viewport: page.viewportSize()
    };
    await page.screenshot({
      path: path.join(outputDir, "mobile-quiz-400.png")
    });
    await context.close();
  }

  await writeFile(
    path.join(outputDir, "metrics.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8"
  );

  console.log(JSON.stringify({
    checkpoint: "task-rail",
    outputDir,
    screenshots: [
      "desktop-lookup-1440.png",
      "desktop-quiz-1440.png",
      "mobile-lookup-390.png",
      "mobile-quiz-400.png"
    ],
    evidence
  }, null, 2));
} finally {
  await browser.close();
}
