import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(
  projectRoot,
  "artifacts",
  "release-gate",
  "library-safety"
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(name) {
  return JSON.parse(await readFile(path.join(evidenceRoot, name), "utf8"));
}

async function readPngSize(name) {
  const filePath = path.join(evidenceRoot, name);
  const data = await readFile(filePath);
  const signature = data.subarray(0, 8).toString("hex");
  assert(signature === "89504e470d0a1a0a", `${name} is not a PNG`);
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    bytes: (await stat(filePath)).size
  };
}

const runtime = await readJson("real-library-read-only.json");
const semantics = await readJson("library-semantics.json");
const desktop = await readPngSize("library-desktop.png");
const mobile = await readPngSize("library-400px.png");

assert(runtime.passed === true, "real library journey did not pass");
assert(runtime.realStoreMutatedByVisualCheck === false, "real library visual check mutated the store");
assert(runtime.sourceItemCount >= 1, "real library evidence has no items");
assert(runtime.desktop.horizontalOverflow === false, "desktop library overflows horizontally");
assert(runtime.mobile.horizontalOverflow === false, "mobile library overflows horizontally");
assert(runtime.desktop.offscreenButtons.length === 0, "desktop has offscreen actions");
assert(runtime.mobile.offscreenButtons.length === 0, "mobile has offscreen actions");
assert(runtime.desktop.tableCount === 0, "legacy wide table is still rendered");
assert(desktop.width >= 1000 && desktop.height >= 600, "desktop screenshot is too small");
assert(mobile.width <= 400 && mobile.height >= 700, "mobile screenshot has unexpected dimensions");

const expectedLabels = [
  "明日复习",
  "历史答错",
  "待确认",
  "待进入计划",
  "复习中",
  "已掌握",
  "已移出",
  "全部"
];
assert(
  JSON.stringify(semantics.filters.map((item) => item.label)) ===
    JSON.stringify(expectedLabels),
  "library filter language does not match the approved semantics"
);
assert(semantics.maintenanceActionLabel === "检查旧词质量", "maintenance action is misleading");
assert(semantics.activeFilter === "已移出", "retired filter was not exercised on the real page");
assert(semantics.selectedRetired.visibleCount === 1, "retired item count does not match the real page");
assert(semantics.selectedRetired.statusLabel === "已移出学习", "retired status label is unclear");
assert(semantics.selectedRetired.wrongCount === 0, "invalid content still carries a wrong-answer signal");
assert(semantics.selectedRetired.learningActionsVisible === false, "retired content still exposes learning actions");
assert(semantics.passed === true, "library semantics check did not pass");

console.log(
  JSON.stringify(
    {
      passed: true,
      realItems: runtime.sourceItemCount,
      desktop,
      mobile,
      activeFilter: semantics.activeFilter,
      visibleItems: semantics.selectedRetired.visibleCount
    },
    null,
    2
  )
);
