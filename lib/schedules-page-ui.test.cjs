const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const pagePath = path.resolve(projectRoot, "app", "(admin)", "schedules", "page.tsx");

function readPage() {
  try {
    return readFileSync(pagePath, "utf8");
  } catch (error) {
    throw new Error("Required app/(admin)/schedules/page.tsx is missing or unreadable", { cause: error });
  }
}

const page = readPage();
assert.match(page, /export default function SchedulesPage/);

function section(startMarker, endMarker) {
  const start = page.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing page section: ${startMarker}`);
  const end = page.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing page section boundary: ${endMarker}`);
  return page.slice(start, end);
}

test("single-group and all-group Generate use one synchronous lock", () => {
  assert.match(page, /const generationLock = useRef<"single" \| "all" \| null>\(null\)/);
  const single = section("const generate = async () => {", "// จัดตารางทั้งชั้นปี");
  const all = section("const submitGenerateAll = async", "const generateByYear");

  for (const [body, mode] of [[single, "single"], [all, "all"]]) {
    assert.match(body, /if \(generationLock\.current !== null\) return/);
    assert.match(body, new RegExp(`generationLock\\.current = "${mode}"`));
    assert.match(body, /finally\s*\{/);
    assert.match(body, new RegExp(`generationLock\\.current === "${mode}"`));
    assert.match(body, /generationLock\.current = null/);
  }
  assert.match(page, /disabled=\{generationLock\.current !== null \|\| generating \|\| generatingAll/);
});

test("selected-group changes invalidate stale schedule responses", () => {
  assert.match(page, /const selectedGroupRef = useRef<number \| null>\(null\)/);
  assert.match(page, /const scheduleRequestVersion = useRef\(0\)/);
  const select = section("const selectGroup =", "const refreshSelectedSchedule");
  assert.match(select, /if \(selectedGroupRef\.current === groupId\) return/);
  assert.ok(select.indexOf("selectedGroupRef.current = groupId") < select.indexOf("setSelectedGroup(groupId)"));
  assert.match(select, /scheduleRequestVersion\.current \+= 1/);

  const effect = section("useEffect(() => {\n    if (selectedGroup === null) return;", "  }, [selectedGroup]);");
  assert.match(effect, /selectedGroupRef\.current !== requestedGroup/);
  assert.match(effect, /scheduleRequestVersion\.current !== requestVersion/);

  const refresh = section("const refreshSelectedSchedule = async () => {", "useEffect(() => {");
  assert.match(refresh, /const groupId = selectedGroupRef\.current/);
  assert.match(refresh, /selectedGroupRef\.current !== groupId/);
  assert.match(refresh, /scheduleRequestVersion\.current !== requestVersion/);

  const all = section("const submitGenerateAll = async", "const generateByYear");
  assert.match(all, /if \(outcome\.shouldReload\) await refreshSelectedSchedule\(\)/);
  assert.doesNotMatch(all, /outcome\.shouldReload && selectedGroup/);
});

test("single-group Generate clears the previous Generate-All outcome", () => {
  const single = section("const generate = async () => {", "// จัดตารางทั้งชั้นปี");
  assert.match(single, /setAllOutcome\(null\)/);
  assert.match(single, /finally\s*\{/);
});

test("server_error and unknown states render only available counts and details", () => {
  assert.doesNotMatch(page, /ไม่มีข้อมูลจำนวนกลุ่มเพิ่มเติม/);
  assert.doesNotMatch(page, /ไม่มีรายละเอียดรายกลุ่มเพิ่มเติม/);
  assert.match(page, /\{allOutcome\.summary\}/);
  assert.match(page, /allOutcome\.successCount !== undefined && allOutcome\.failureCount !== undefined/);
  assert.match(page, /allOutcome\.kind !== "server_error" && allOutcome\.results\.length > 0/);
});

test("UI renders subjectName supplied by the parser without applying error filtering", () => {
  assert.match(page, /from "@\/lib\/generate-all-response"/);
  assert.match(page, /\{item\.subjectName \? `วิชา \$\{item\.subjectName\}: ` : ""\}/);
  assert.doesNotMatch(page, /safeMessage\(item\.subjectName\)/);
});
