import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

const versions = {
  root: readJson("package.json").version,
  extension: readJson("extension/package.json").version,
  manifest: readJson("extension/public/manifest.json").version,
  server: readJson("server/package.json").version,
  web: readJson("web/package.json").version
};
for (const [name, version] of Object.entries(versions)) {
  if (version !== "2.0.0") throw new Error(`${name} version is ${version}, expected 2.0.0`);
}

const ignoredPaths = ["output/legal-vocab.json", "server/.env", "artifacts", ".pnpm-store"];
for (const path of ignoredPaths) {
  execFileSync("git", ["check-ignore", "-q", path], { cwd: root });
}

const runtimeFrames = {
  recliningIdle: 96,
  curiousDynamic: 96,
  walkLeft: 8,
  walkRight: 8,
  ballFallback: 12
};
for (const [name, count] of Object.entries(runtimeFrames)) {
  const prefix = {
    recliningIdle: "state-reclining-idle",
    curiousDynamic: "state-curious-dynamic",
    walkLeft: "state-walk-left",
    walkRight: "state-walk-right",
    ballFallback: "action-ball-chase"
  }[name];
  for (let index = 0; index < count; index += 1) {
    readFileSync(resolve(root, `desktop-dropper/assets/${prefix}-frame-${index}.png`));
  }
}

readFileSync(resolve(root, "README.md"));
readFileSync(resolve(root, "CHANGELOG.md"));
readFileSync(resolve(root, "docs/RELEASE_V2.md"));

const evidence = {
  checkedAt: new Date().toISOString(),
  version: "2.0.0",
  versions,
  ignoredPaths,
  runtimeFrames,
  localDataCommitted: false,
  status: "passed"
};
const evidenceDir = resolve(root, "artifacts/release-gate/v2-closeout");
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(resolve(evidenceDir, "release-baseline.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log("PASS: V2 release baseline, privacy exclusions, and runtime assets are complete");
