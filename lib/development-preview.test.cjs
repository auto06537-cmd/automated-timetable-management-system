const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.resolve(projectRoot, relativePath), "utf8");

function loadAccessGuard() {
  const source = read("lib/development-preview-access.ts");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("module", "exports", output)(loaded, loaded.exports);
  return loaded.exports.isDevelopmentPreviewEnabled;
}

test("preview is enabled only for development with the exact opt-in flag", () => {
  const isEnabled = loadAccessGuard();
  assert.equal(isEnabled("development", "true"), true);
  assert.equal(isEnabled("development", "false"), false);
  assert.equal(isEnabled("development", undefined), false);
  assert.equal(isEnabled("production", "true"), false);
  assert.equal(isEnabled("test", "true"), false);
});

test("Login page uses the server-side access guard and no public preview flag", () => {
  const loginPage = read("app/login/page.tsx");
  assert.doesNotMatch(loginPage, /^\s*["']use client["']/m);
  assert.match(loginPage, /isDevelopmentPreviewEnabled\(/);
  assert.match(loginPage, /process\.env\.ENABLE_UI_PREVIEW/);
  assert.doesNotMatch(loginPage, /NEXT_PUBLIC_/);
});

test("preview contains all 14 screens and uses in-memory navigation only", () => {
  const preview = read("components/DevelopmentPreview.tsx");
  const navigation = preview.match(/const navigation:[\s\S]*?= \[[\s\S]*?\n\];/);
  assert.ok(navigation, "preview navigation list must exist");
  const entries = navigation[0].slice(navigation[0].indexOf("= ["));
  assert.equal((entries.match(/\{ id:/g) || []).length, 14);
  assert.match(preview, /onExit/);
  assert.match(preview, /โหมดตัวอย่างสำหรับ Development/);
  assert.doesNotMatch(preview, /\bfetch\s*\(/);
  assert.doesNotMatch(preview, /\/api\//);
  assert.doesNotMatch(preview, /createAdminSession|admin_session|localStorage|document\.cookie/);
});

test("write actions and import are disabled in preview", () => {
  const preview = read("components/DevelopmentPreview.tsx");
  assert.match(preview, /function DisabledAction/);
  assert.match(preview, /<button type="button" disabled/);
  assert.match(preview, /type="file" disabled/);
  assert.match(preview, /ไม่บันทึกฐานข้อมูล|ไม่มีการเปลี่ยนแปลง/);
});
