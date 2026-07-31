import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const readme = read("README.md");
const charter = read("docs/PROJECT_CHARTER.md");
const security = read("docs/SECURITY.md");
const manifest = JSON.parse(read("extension/public/manifest.json"));
const popup = `${read("extension/src/popup/popup.html")}\n${read("extension/src/popup/main.tsx")}`;

const v2Title = "# 大王陪你背单词 · V2";
if (!readme.startsWith(v2Title)) {
  failures.push("README does not lead with the V2 product identity");
}
if (!readme.includes("当前主产品是法律英语查词与复习系统")) {
  failures.push("README does not state the current primary product");
}
if (!charter.includes("no longer the primary product identity")) {
  failures.push("Project Charter does not demote the legacy workflow to compatibility");
}
if (!security.includes("法律英语查词与间隔复习工具")) {
  failures.push("Security document still lacks the V2 product scope");
}
if (!manifest.description.includes("法律英语") || !manifest.description.includes("间隔复习")) {
  failures.push("extension manifest description is not V2-aligned");
}
if (popup.includes("学习收尾助手")) {
  failures.push("extension popup still exposes the legacy product title");
}

let remoteReadme = "";
try {
  remoteReadme = execFileSync("git", ["show", "origin/main:README.md"], {
    cwd: root,
    encoding: "utf8"
  });
} catch {
  failures.push("cannot read origin/main README");
}
if (remoteReadme && !remoteReadme.startsWith(v2Title)) {
  failures.push("origin/main still exposes the legacy README");
}

let about = null;
try {
  about = JSON.parse(read("artifacts/release-gate/v2-positioning-sync/github-about.json"));
} catch {
  failures.push("GitHub About evidence is missing or invalid");
}
if (about && (!about.description?.includes("legal English") || !about.description?.includes("Da Wang"))) {
  failures.push("GitHub About evidence does not contain the V2 product scope");
}

const outputPath = resolve(root, "artifacts/release-gate/v2-positioning-sync/verification.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({
  checkedAt: new Date().toISOString(),
  passed: failures.length === 0,
  checks: {
    readme: true,
    charter: true,
    security: true,
    extensionManifest: true,
    extensionPopup: true,
    originMain: remoteReadme.startsWith(v2Title),
    githubAbout: Boolean(about)
  },
  failures
}, null, 2)}\n`);

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("PASS: V2 public positioning is consistent");
