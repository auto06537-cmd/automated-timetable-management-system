const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { stripTypeScriptTypes } = require("node:module");
const { DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

const source = readFileSync(__filename.replace(/\.test\.cjs$/, ".ts"), "utf8")
  .replace(/import \{([^}]+)\} from "([^"]+)";/g, (_, bindings, name) => `const {${bindings}} = use("${name}");`)
  .replace("export async function POST", "exports.POST = async function POST");

function fixture(groupSpecs, options = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE ClassGroup (id INTEGER PRIMARY KEY, name TEXT, year INTEGER, pairKey TEXT);
    CREATE TABLE Schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, classGroupId INTEGER, pairKey TEXT);
    CREATE TABLE ScheduleGroup (scheduleId INTEGER, classGroupId INTEGER);
  `);
  const insertGroup = db.prepare("INSERT INTO ClassGroup VALUES (?, ?, ?, ?)");
  groupSpecs.forEach((group, index) => insertGroup.run(index + 1, group.name, group.year ?? 1, group.pairKey ?? null));

  const all = (sql) => db.prepare(sql).all();
  const groups = () => db.prepare("SELECT id, name, year, pairKey FROM ClassGroup ORDER BY year, name, id").all();
  const insertPlan = (plan) => {
    const saved = new Set();
    for (const [groupId, rows] of plan) {
      for (const row of rows) {
        if (saved.has(row.token)) continue;
        saved.add(row.token);
        const result = db.prepare("INSERT INTO Schedule (classGroupId, pairKey) VALUES (?, ?)")
          .run(row.groupIds[0] ?? groupId, row.pairKey ?? null);
        for (const linkedGroup of row.groupIds) {
          db.prepare("INSERT INTO ScheduleGroup VALUES (?, ?)").run(result.lastInsertRowid, linkedGroup);
        }
      }
    }
  };

  const prisma = { classGroup: { findMany: async () => groups() } };
  const scheduler = {
    async generateSchedulePaired(pairs) {
      const plan = new Map();
      const unplaced = [];
      for (const pair of pairs) {
        const failed = pair.some((id) => options.failedIds?.has(id));
        if (failed) unplaced.push({ groupIds: pair, subjectId: 1, subjectName: "S", missingPeriods: 1, reason: "fixture failure" });
        const sharedRow = { token: `pair-${pair.join("-")}`, pairKey: "paired", groupIds: pair };
        for (const id of pair) plan.set(id, failed ? [] : [sharedRow]);
      }
      plan.unplaced = unplaced;
      return plan;
    },
    async saveAllSchedules(plan) {
      if (options.throwSavePaired) throw new Error("injected save failure");
      insertPlan(plan);
    },
    async generateSchedule(groupId) {
      const plan = options.failedIds?.has(groupId) ? [] : [{ token: `solo-${groupId}`, groupIds: [groupId] }];
      plan.unplaced = options.failedIds?.has(groupId)
        ? [{ groupIds: [groupId], subjectId: 2, subjectName: "N", missingPeriods: 1, reason: "fixture failure" }]
        : [];
      return plan;
    },
    async saveSchedule(groupId, plan) { insertPlan(new Map([[groupId, plan]])); },
  };

  const exports = {};
  const use = (name) => {
    if (name === "next/server") return { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } };
    if (name === "@/lib/auth") return { denyUnlessAdmin: async () => null };
    if (name === "@/lib/prisma") return { prisma };
    if (name === "@/lib/scheduler") return scheduler;
    if (name === "../schedules/data") return {
      isObject: (value) => value !== null && typeof value === "object" && !Array.isArray(value),
      positiveInt: (value) => Number.isInteger(value) && value > 0 ? value : undefined,
    };
    throw new Error(`Unexpected import ${name}`);
  };
  runInNewContext(stripTypeScriptTypes(source), { exports, use, console });
  return { POST: exports.POST, all, db };
}

const req = (body = {}) => ({ text: async () => JSON.stringify(body) });
const specs = (count, pairKey = "A") => Array.from({ length: count }, (_, index) => ({ name: `G${index + 1}`, pairKey }));

test("two groups with one pairKey form one complete pair", async (t) => {
  const { POST, all, db } = fixture(specs(2));
  t.after(() => db.close());
  const response = await POST(req({ year: 1 }));
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "success");
  assert.equal(response.body.successCount, 2);
  assert.equal(all("SELECT * FROM Schedule").length, 1);
  assert.equal(all("SELECT * FROM ScheduleGroup").length, 2);
});

test("four groups with one pairKey form two pairs", async (t) => {
  const { POST, all, db } = fixture(specs(4));
  t.after(() => db.close());
  const response = await POST(req({ year: 1 }));
  assert.equal(response.status, 200);
  assert.equal(response.body.successCount, 4);
  assert.equal(all("SELECT * FROM Schedule").length, 2);
  assert.equal(all("SELECT * FROM ScheduleGroup").length, 4);
});

test("three groups with one pairKey fail the unmatched member without solo generation", async (t) => {
  const { POST, all, db } = fixture(specs(3));
  t.after(() => db.close());
  const response = await POST(req({ year: 1 }));
  assert.equal(response.status, 207);
  assert.equal(response.body.status, "partial_success");
  assert.equal(response.body.ok, false);
  assert.equal(response.body.successCount, 2);
  assert.equal(response.body.failureCount, 1);
  assert.match(response.body.results[2].error, /จับคู่ไม่ครบ/);
  assert.equal(all("SELECT * FROM Schedule").length, 1);
  assert.equal(all("SELECT * FROM ScheduleGroup").length, 2);
});

test("an incomplete pairKey does not block a separate complete pair", async (t) => {
  const { POST, all, db } = fixture([
    { name: "A1", pairKey: "A" }, { name: "A2", pairKey: "A" }, { name: "A3", pairKey: "A" },
    { name: "B1", pairKey: "B" }, { name: "B2", pairKey: "B" },
  ]);
  t.after(() => db.close());
  const response = await POST(req({ year: 1 }));
  assert.equal(response.status, 207);
  assert.equal(response.body.successCount, 4);
  assert.equal(response.body.failureCount, 1);
  assert.equal(all("SELECT * FROM Schedule").length, 2);
  assert.equal(all("SELECT * FROM ScheduleGroup").length, 4);
});

test("groups without pairKey remain ordinary groups", async (t) => {
  const { POST, all, db } = fixture([
    { name: "A1", pairKey: "A" }, { name: "A2", pairKey: "A" },
    { name: "Solo", pairKey: null },
  ]);
  t.after(() => db.close());
  const response = await POST(req({ year: 1 }));
  assert.equal(response.status, 200);
  assert.equal(response.body.successCount, 3);
  assert.equal(all("SELECT * FROM Schedule").length, 2);
  assert.equal(all("SELECT * FROM ScheduleGroup").length, 3);
});

test("usePairing=false preserves solo generation even for groups with pairKey", async (t) => {
  const { POST, all, db } = fixture(specs(2));
  t.after(() => db.close());
  const response = await POST(req({ year: 1, usePairing: false }));
  assert.equal(response.status, 200);
  assert.equal(response.body.successCount, 2);
  assert.equal(all("SELECT * FROM Schedule").length, 2);
  assert.equal(all("SELECT * FROM ScheduleGroup").length, 2);
});

test("all groups succeed reports complete success", async (t) => {
  const { POST, db } = fixture([{ name: "Solo", pairKey: null }]);
  t.after(() => db.close());
  const response = await POST(req({}));
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "success");
});

test("all groups failing to place returns failure and preserves existing schedules", async (t) => {
  const { POST, all, db } = fixture([{ name: "Solo", pairKey: null }], { failedIds: new Set([1]) });
  t.after(() => db.close());
  db.exec("INSERT INTO Schedule (classGroupId, pairKey) VALUES (1, 'existing')");
  const before = all("SELECT * FROM Schedule");
  const response = await POST(req({}));
  assert.equal(response.status, 422);
  assert.equal(response.body.status, "failure");
  assert.equal(response.body.ok, false);
  assert.deepEqual(all("SELECT * FROM Schedule"), before);
});

test("a successful pair and a failed independent group return explicit partial status", async (t) => {
  const { POST, all, db } = fixture([
    { name: "A1", pairKey: "A" }, { name: "A2", pairKey: "A" }, { name: "Solo", pairKey: null },
  ], { failedIds: new Set([3]) });
  t.after(() => db.close());
  const response = await POST(req({ year: 1 }));
  assert.equal(response.status, 207);
  assert.equal(response.body.status, "partial_success");
  assert.equal(response.body.ok, false);
  assert.equal(response.body.successCount, 2);
  assert.equal(response.body.failureCount, 1);
  assert.equal(response.body.results.find((item) => item.classGroup === "Solo").success, false);
  assert.equal(all("SELECT * FROM Schedule").length, 1);
  assert.equal(all("SELECT * FROM ScheduleGroup").length, 2);
});

test("a failed group with an existing schedule keeps that schedule", async (t) => {
  const { POST, all, db } = fixture([{ name: "Solo", pairKey: null }], { failedIds: new Set([1]) });
  t.after(() => db.close());
  db.exec("INSERT INTO Schedule (classGroupId, pairKey) VALUES (1, 'existing')");
  const before = all("SELECT * FROM Schedule");
  const response = await POST(req({}));
  assert.equal(response.body.results[0].success, false);
  assert.deepEqual(all("SELECT * FROM Schedule"), before);
});

test("an odd pairKey alongside an unpaired group does not generate the unmatched member solo", async (t) => {
  const { POST, all, db } = fixture([
    { name: "A1", pairKey: "A" }, { name: "A2", pairKey: "A" }, { name: "A3", pairKey: "A" },
    { name: "Solo", pairKey: null },
  ]);
  t.after(() => db.close());
  const response = await POST(req({ year: 1, usePairing: true }));
  assert.equal(response.status, 207);
  assert.equal(response.body.successCount, 3);
  assert.equal(response.body.failureCount, 1);
  assert.equal(all("SELECT * FROM Schedule").length, 2);
  assert.equal(all("SELECT * FROM ScheduleGroup").length, 3);
});

test("pair generation runtime failure reports all paired groups as failed", async (t) => {
  const { POST, all, db } = fixture(specs(2), { throwSavePaired: true });
  t.after(() => db.close());
  const response = await POST(req({ year: 1 }));
  assert.equal(response.status, 500);
  assert.equal(response.body.status, "failure");
  assert.equal(response.body.ok, false);
  assert.equal(response.body.failureCount, 2);
  assert.equal(all("SELECT * FROM Schedule").length, 0);
});
