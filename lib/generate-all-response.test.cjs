const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { stripTypeScriptTypes } = require("node:module");
const { test } = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const parserPath = path.resolve(projectRoot, "lib", "generate-all-response.ts");
const pagePath = path.resolve(projectRoot, "app", "(admin)", "schedules", "page.tsx");

function readRequiredProjectFile(filePath, relativePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Required project file is missing or unreadable: ${relativePath}`, { cause: error });
  }
}

assert.notEqual(path.resolve(pagePath), path.resolve(__filename), "Expected page.tsx, not this Test file");
assert.equal(path.relative(projectRoot, pagePath), path.join("app", "(admin)", "schedules", "page.tsx"));

const source = readRequiredProjectFile(parserPath, "lib/generate-all-response.ts")
  .replace(/^export function /gm, "function ");
const pageSource = readRequiredProjectFile(pagePath, "app/(admin)/schedules/page.tsx");
assert.match(pageSource, /export default function SchedulesPage/);
const parser = new Function(`${stripTypeScriptTypes(source)}\nreturn { normalizeGenerateAllResponse, requestFailureView, sanitizeSubjectName, safeMessage };`)();

test("HTTP 200 and API success status produce a complete success result", () => {
  const view = parser.normalizeGenerateAllResponse(200, {
    status: "success", ok: true, successCount: 2, failureCount: 0,
    results: [
      { classGroup: "ปวช.1/1", success: true, count: 4 },
      { classGroup: "ปวช.1/2", success: true, count: 3 },
    ],
  });
  assert.equal(view.kind, "success");
  assert.equal(view.successCount, 2);
  assert.equal(view.failureCount, 0);
  assert.equal(view.shouldReload, true);
});

test("HTTP 207 and partial status retain each group reason and unplaced-period data", () => {
  const view = parser.normalizeGenerateAllResponse(207, {
    status: "partial_success", successCount: 2, failureCount: 1,
    error: "จัดตารางได้บางกลุ่ม โปรดตรวจผลรายกลุ่ม",
    results: [
      { classGroup: "A", success: true, count: 2 },
      { classGroup: "B", success: false, count: 0, error: "จัดตารางไม่ครบ", unplaced: [
        { subjectName: "วิชาสามัญ", missingPeriods: 2, reason: "ครูว่างไม่พอหรือถึงเพดานสอนรายวัน" },
      ] },
    ],
  });
  assert.equal(view.kind, "partial");
  assert.equal(view.shouldReload, true);
  assert.equal(view.results[1].error, "จัดตารางไม่ครบ");
  assert.equal(view.results[1].unplaced[0].reason, "ครูว่างไม่พอหรือถึงเพดานสอนรายวัน");
  assert.equal(view.results[1].unplaced[0].missingPeriods, 2);
});

test("HTTP 422 shows failure details and never reloads schedules", () => {
  const view = parser.normalizeGenerateAllResponse(422, {
    status: "failure", successCount: 0, failureCount: 1,
    results: [{ classGroup: "A", success: false, error: "ไม่มีคาบสอนให้จัด" }],
  });
  assert.equal(view.kind, "failure");
  assert.equal(view.shouldReload, false);
  assert.equal(view.results[0].error, "ไม่มีคาบสอนให้จัด");
});

test("HTTP 500 always returns a generic message and discards internal response details", () => {
  const view = parser.normalizeGenerateAllResponse(500, {
    status: "failure", error: "Prisma P2002 at C:\\app\\node_modules\\... stack trace",
    results: [{ classGroup: "A", success: false, error: "SQLite internal error" }],
  });
  assert.equal(view.kind, "server_error");
  assert.match(view.summary, /เซิร์ฟเวอร์/);
  assert.doesNotMatch(JSON.stringify(view), /Prisma|P2002|SQLite|stack trace|node_modules/);
  assert.deepEqual(view.results, []);
});

test("malformed JSON or mismatched HTTP/API statuses show generic incomplete-response state", () => {
  assert.equal(parser.normalizeGenerateAllResponse(207, null).kind, "unknown");
  assert.equal(parser.normalizeGenerateAllResponse(200, { status: "partial_success" }).kind, "unknown");
  assert.equal(parser.requestFailureView().kind, "unknown");
});

test("missing, null and undefined fields do not create counts, reasons or reload evidence", () => {
  const view = parser.normalizeGenerateAllResponse(207, {
    status: "partial_success", successCount: null, failureCount: undefined,
    results: [null, { classGroup: null, success: false }, {
      classGroup: "A", success: false, count: null, error: null, unplaced: null,
    }],
  });
  assert.equal(view.kind, "partial");
  assert.equal(view.successCount, undefined);
  assert.equal(view.failureCount, undefined);
  assert.equal(view.shouldReload, false);
  assert.equal(view.results.length, 1);
  assert.equal(view.results[0].count, undefined);
  assert.equal(view.results[0].error, undefined);
  assert.equal(view.results[0].unplaced, undefined);
});

test("response without group details does not fabricate a group result", () => {
  const view = parser.normalizeGenerateAllResponse(422, {
    status: "failure", successCount: 0, failureCount: 2,
  });
  assert.equal(view.kind, "failure");
  assert.equal(view.results.length, 0);
  assert.equal(view.failureCount, 2);
});

test("cross-platform path resolves and reads the required page.tsx", () => {
  assert.equal(path.basename(pagePath), "page.tsx");
  assert.notEqual(path.resolve(pagePath), path.resolve(__filename));
  assert.match(pageSource, /export default function SchedulesPage/);

  const winRoot = "C:\\workspace\\project";
  const winPage = path.win32.resolve(winRoot, "app", "(admin)", "schedules", "page.tsx");
  assert.equal(path.win32.relative(winRoot, winPage), path.win32.join("app", "(admin)", "schedules", "page.tsx"));

  const posixRoot = "/workspace/project";
  const posixPage = path.posix.resolve(posixRoot, "app", "(admin)", "schedules", "page.tsx");
  assert.equal(path.posix.relative(posixRoot, posixPage), path.posix.join("app", "(admin)", "schedules", "page.tsx"));
});

test("SQLite constraint, busy, and generic errors are not exposed", () => {
  const unsafeMessages = [
    "SQLITE_CONSTRAINT: UNIQUE constraint failed",
    "SQLITE_BUSY: database is locked",
    "SQLITE_ERROR: malformed query",
  ];
  for (const message of unsafeMessages) {
    const view = parser.normalizeGenerateAllResponse(207, {
      status: "partial_success",
      error: message,
      results: [{ classGroup: "A", success: false, error: message, unplaced: [{ reason: message }] }],
    });
    assert.equal(view.summary, "จัดตารางได้บางกลุ่ม โปรดตรวจผลรายกลุ่ม");
    assert.equal(view.results[0].error, undefined);
    assert.equal(view.results[0].unplaced.length, 0);
    assert.doesNotMatch(JSON.stringify(view), /SQLITE_/);
  }
});

test("Prisma, SQL errors, stack traces, runtime errors, paths, and Node internals are not exposed", () => {
  const unsafeMessages = [
    "PrismaClientKnownRequestError: P2002",
    "SQL error: syntax error near SELECT",
    "TypeError: invalid value at C:\\app\\src\\page.tsx:10:2",
    "Error: failed\n    at generate (C:\\app\\lib\\scheduler.js:20:4)",
    "at async handler (/srv/app/app/api/route.ts:10:2)",
    "node:internal/process/task_queues:95:5",
  ];
  for (const message of unsafeMessages) {
    const view = parser.normalizeGenerateAllResponse(422, {
      status: "failure",
      error: message,
      results: [{ classGroup: "A", success: false, error: message, unplaced: [{ reason: message }] }],
    });
    assert.equal(view.summary, "ไม่สามารถจัดตารางได้ โปรดตรวจรายละเอียดที่แสดง");
    assert.equal(view.results[0].error, undefined);
    assert.equal(view.results[0].unplaced.length, 0);
    assert.doesNotMatch(JSON.stringify(view), /Prisma|SQL|TypeError|ReferenceError|node:internal|scheduler\.js/);
  }
});

test("allowlisted messages remain visible and unknown error text is hidden", () => {
  const allowedMessages = [
    "จัดตารางไม่สำเร็จ",
    "ไม่มีคาบสอนให้จัด",
    "ไม่ได้บันทึกตารางคู่ เนื่องจากมีอีกกลุ่มในชุดจับคู่จัดตารางไม่ครบ",
  ];
  for (const message of allowedMessages) {
    const safe = parser.normalizeGenerateAllResponse(422, {
      status: "failure",
      error: message,
      results: [{ classGroup: "A", success: false, error: message }],
    });
    assert.equal(safe.summary, message);
    assert.equal(safe.results[0].error, message);
  }

  const unknown = parser.normalizeGenerateAllResponse(422, {
    status: "failure",
    error: "internal worker failed unexpectedly",
    results: [{ classGroup: "A", success: false, error: "unrecognized server detail" }],
  });
  assert.equal(unknown.summary, "ไม่สามารถจัดตารางได้ โปรดตรวจรายละเอียดที่แสดง");
  assert.equal(unknown.results[0].error, undefined);
  assert.doesNotMatch(JSON.stringify(unknown), /internal worker|unrecognized server/);
});

test("the old test-only phrase is not allowlisted or exposed", () => {
  const view = parser.normalizeGenerateAllResponse(422, {
    status: "failure",
    error: "ไม่มีคาบว่าง",
    results: [{ classGroup: "A", success: false, error: "ไม่มีคาบว่าง" }],
  });
  assert.equal(view.summary, "ไม่สามารถจัดตารางได้ โปรดตรวจรายละเอียดที่แสดง");
  assert.equal(view.results[0].error, undefined);
  assert.doesNotMatch(JSON.stringify(view), /ไม่มีคาบว่าง/);
});

test("subject names are independently validated and SQL text is preserved", () => {
  assert.equal(parser.sanitizeSubjectName(" ระบบฐานข้อมูล SQL "), "ระบบฐานข้อมูล SQL");
  assert.equal(parser.sanitizeSubjectName("คณิตศาสตร์"), "คณิตศาสตร์");
  for (const value of ["", "   ", null, undefined, 17, {}, "x".repeat(161), "ชื่อ\u0000วิชา"]) {
    assert.equal(parser.sanitizeSubjectName(value), undefined);
  }

  const view = parser.normalizeGenerateAllResponse(422, {
    status: "failure",
    results: [{ classGroup: "A", success: false, unplaced: [
      { subjectName: "ระบบฐานข้อมูล SQL", reason: "ไม่มีคาบสอนให้จัด" },
      { subjectName: "   " },
    ] }],
  });
  assert.equal(view.results[0].unplaced.length, 1);
  assert.equal(view.results[0].unplaced[0].subjectName, "ระบบฐานข้อมูล SQL");
});

test("classGroup names are trimmed and reject control characters or excessive length", () => {
  const view = parser.normalizeGenerateAllResponse(207, {
    status: "partial_success",
    results: [
      { classGroup: "  ปวช.1/1  ", success: true },
      { classGroup: `ปวช.${"1".repeat(120)}`, success: true },
      { classGroup: "ปวช.1/\u0000ห้อง", success: true },
      { classGroup: "ปวช.1/\u0085ห้อง", success: true },
      { classGroup: "   ", success: true },
    ],
  });
  assert.equal(view.results.length, 1);
  assert.equal(view.results[0].classGroup, "ปวช.1/1");
});

test("safeMessage preserves only safe API messages for single-group errors", () => {
  assert.equal(parser.safeMessage("รหัสกลุ่มเรียนไม่ถูกต้อง"), "รหัสกลุ่มเรียนไม่ถูกต้อง");
  assert.equal(parser.safeMessage("ไม่พบกลุ่มเรียน"), "ไม่พบกลุ่มเรียน");
  assert.equal(parser.safeMessage("จัดตารางไม่ครบ"), "จัดตารางไม่ครบ");
  for (const message of ["SQLITE_BUSY", "Prisma P2002", "TypeError: C:\\private\\route.ts:1:1", "unexpected server detail"]) {
    assert.equal(parser.safeMessage(message), undefined);
  }
});

test("null and undefined payloads and HTTP/API status mismatches are unknown", () => {
  for (const payload of [null, undefined]) {
    assert.equal(parser.normalizeGenerateAllResponse(207, payload).kind, "unknown");
  }
  assert.equal(parser.normalizeGenerateAllResponse(200, { status: "partial_success" }).kind, "unknown");
  assert.equal(parser.normalizeGenerateAllResponse(207, { status: "success" }).kind, "unknown");
  assert.equal(parser.normalizeGenerateAllResponse(422, { status: "partial_success" }).kind, "unknown");
});

test("500 ignores supplied errors while 200/207/422 parser outcomes remain distinct", () => {
  assert.equal(parser.normalizeGenerateAllResponse(200, { status: "success" }).kind, "success");
  assert.equal(parser.normalizeGenerateAllResponse(207, { status: "partial_success" }).kind, "partial");
  assert.equal(parser.normalizeGenerateAllResponse(422, { status: "failure" }).kind, "failure");
  const server = parser.normalizeGenerateAllResponse(500, { error: "SQLITE_ERROR at C:\\private\\route.ts" });
  assert.equal(server.kind, "server_error");
  assert.doesNotMatch(JSON.stringify(server), /SQLITE_ERROR|private|route\.ts/);
});
