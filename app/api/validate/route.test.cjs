const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { stripTypeScriptTypes } = require("node:module");
const { join } = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

function load(file, bindings, exported) {
  const source = readFileSync(join(__dirname, file), "utf8")
    .replace(/^import .*$/gm, "").replace(/^export /gm, "");
  return runInNewContext(stripTypeScriptTypes(source) + "\n" + exported, bindings);
}

const helpers = load("../schedules/data.ts", {}, "({ positiveInt, scheduleInclude })");
const groups = [
  { id: 1, name: "1A", year: 1, pairKey: "A" },
  { id: 2, name: "1B", year: 1, pairKey: "A" },
  { id: 3, name: "2A", year: 2, pairKey: "A" },
  { id: 4, name: "2B", year: 2, pairKey: "A" },
];
const subject = { id: 1, name: "Common", isCommon: true, periodsPerWeek: 2 };

function lesson(group, periodId, linked = [], teacherId = 1) {
  return {
    classGroupId: group.id, classGroup: group, subjectId: subject.id,
    roomId: group.id, room: { name: group.name },
    periodId, period: { periodNo: periodId }, dayOfWeek: 1,
    teacherId, teacher: { name: "Teacher" },
    groups: linked.map(classGroup => ({ classGroupId: classGroup.id, classGroup })),
  };
}

function fixture(schedules) {
  let scheduleReads = 0;
  const bindings = {
    URL, ...helpers,
    denyUnlessAdmin: async () => null,
    NextResponse: { json: (body, init) => ({ ...body, status: init?.status ?? 200 }) },
    prisma: {
      schedule: { findMany: async ({ where, include }) => {
        scheduleReads++;
        assert.equal(where, undefined);
        assert.equal(include.teacher, true);
        return schedules;
      } },
      subject: { findMany: async () => [subject] },
      classGroup: { findMany: async () => groups },
      period: { findMany: async () => [] },
      lockedSlot: { findMany: async () => [] },
    },
  };
  const get = load("route.ts", bindings, "GET");
  return {
    get: query => get({ url: `https://timetable.example/api/validate${query}` }),
    reads: () => scheduleReads,
  };
}

test("shared lessons count for both groups and do not raise a false pairing warning", async () => {
  const result = await fixture([lesson(groups[0], 1, [groups[0], groups[1]])]).get("?classGroupId=2");
  assert.equal(result.errors, 0);
  assert.equal(result.warnings, 1);
  assert.match(result.issues[0].message, /1B.*1\/2/);
});

test("a selected group sees teacher conflicts with other groups in its timetable slots", async () => {
  const shared = lesson(groups[0], 1, [groups[1]]);
  const conflicting = lesson(groups[2], 1);
  const result = await fixture([shared, conflicting]).get("?classGroupId=2");
  assert.equal(result.valid, false);
  assert.equal(result.errors, 1);
  assert.match(result.issues[0].detail, /1A, 1B, 2A/);
  assert.equal((await fixture([shared, conflicting]).get("?classGroupId=4")).errors, 0);
});

test("identical pairing keys in different years are checked separately", async () => {
  const result = await fixture([
    lesson(groups[0], 1, [groups[1]]), lesson(groups[2], 2), lesson(groups[3], 3),
  ]).get("");
  const pairingIssues = result.issues.filter(issue => issue.detail === "2A vs 2B");
  assert.equal(pairingIssues.length, 1);
});

test("malformed IDs are rejected before any schedule query", async () => {
  const f = fixture([]);
  for (const id of ["", "0", "1e2", "2147483648"]) {
    assert.equal((await f.get(`?classGroupId=${id}`)).status, 400);
  }
  assert.equal(f.reads(), 0);
  assert.equal((await f.get("?classGroupId=99")).status, 404);
});
