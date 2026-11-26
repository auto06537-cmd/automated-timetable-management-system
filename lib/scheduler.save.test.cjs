const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { stripTypeScriptTypes } = require("node:module");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

const source = readFileSync(join(__dirname, "scheduler.ts"), "utf8")
  .replace(/^import .*$/gm, "")
  .replaceAll("export async function", "async function");
const scheduler = stripTypeScriptTypes(source) +
  "\n;({ generateSchedule, generateSchedulePaired, saveSchedule, saveAllSchedules })";

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  for (const name of ["0000_baseline", "0001_paired_schedule_groups"]) {
    db.exec(readFileSync(join(__dirname, "../prisma/migrations", name, "migration.sql"), "utf8"));
  }
  db.exec(`
    INSERT INTO Subject (id, code, name, periodsPerWeek, isCommon, pairedMode)
      VALUES (1, 'S', 'Common', 1, 1, 'SHARED_ROOM'), (2, 'N', 'Ordinary', 1, 0, NULL);
    INSERT INTO ClassGroup (id, name) VALUES (1, 'A'), (2, 'B'), (3, 'C');
    INSERT INTO Room (id, name) VALUES (1, 'R1'), (2, 'R2'), (3, 'R3');
    INSERT INTO Teacher (id, code, name, maxPeriodsPerDay)
      VALUES (1, 'T1', 'One', 1), (2, 'T2', 'Two', 2);
    INSERT INTO TeacherSubject (teacherId, subjectId) VALUES (1, 1), (2, 1);
    INSERT INTO Period (id, periodNo, startTime, endTime) VALUES
      (1, 1, '08:00', '09:00'), (2, 2, '09:00', '10:00');
  `);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const selected = (table, key, ids) => all(
    `SELECT * FROM "${table}" WHERE "${key}" IN (${ids.map(() => "?").join(",")})`, ...ids);
  const writes = [];
  const insert = ({ classGroupId, subjectId, roomId, periodId, dayOfWeek, isLocked, teacherId }) =>
    db.prepare(`INSERT INTO Schedule (classGroupId, subjectId, roomId, periodId, dayOfWeek, isLocked, teacherId)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(classGroupId, subjectId, roomId, periodId, dayOfWeek, Number(isLocked ?? false), teacherId ?? null);
  const prisma = {
    classGroup: { findMany: async ({ where }) => selected("ClassGroup", "id", where.id.in) },
    subject: { findMany: async () => all("SELECT * FROM Subject").map(row => ({
      ...row, teacherSubjects: all("SELECT * FROM TeacherSubject WHERE subjectId = ?", row.id),
    })) },
    room: { findMany: async () => all("SELECT * FROM Room") },
    period: { findMany: async () => all("SELECT * FROM Period ORDER BY periodNo") },
    teacher: { findMany: async () => all("SELECT * FROM Teacher").map(row => ({
      ...row, teacherBusy: all("SELECT * FROM TeacherBusy WHERE teacherId = ?", row.id),
    })) },
    lockedSlot: { findMany: async ({ where }) => selected("LockedSlot", "classGroupId", where.classGroupId.in) },
    schedule: {
      findMany: async () => all("SELECT * FROM Schedule").map(row => ({
        ...row, groups: all("SELECT * FROM ScheduleGroup WHERE scheduleId = ?", row.id),
      })),
      async deleteMany({ where }) {
        writes.push("delete");
        const ids = where.id.in;
        db.prepare(`DELETE FROM Schedule WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
      },
      async create({ data }) {
        writes.push("schedule");
        return { id: insert(data).lastInsertRowid };
      },
      async createMany({ data }) {
        writes.push("batch");
        data.forEach(insert);
      },
    },
    scheduleGroup: {
      async create({ data }) {
        writes.push("membership");
        db.prepare("INSERT INTO ScheduleGroup VALUES (?, ?, ?, ?)").run(
          data.scheduleId, data.classGroupId, data.dayOfWeek, data.periodId);
      },
    },
    async $transaction(callback) {
      db.exec("BEGIN");
      try {
        await callback(prisma);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const math = Object.create(Math);
  math.random = () => 0.99;
  return { ...runInNewContext(scheduler, { prisma, Math: math }), db, all, writes };
}

test("shared mode stores one lesson and links both groups without double-counting teacher load", async (t) => {
  const { generateSchedulePaired, saveAllSchedules, all, db } = fixture(t);
  db.exec("UPDATE Subject SET periodsPerWeek=2 WHERE id=1; DELETE FROM TeacherSubject WHERE teacherId=2;");
  const plan = await generateSchedulePaired([[1, 2]]);
  assert.equal(plan.unplaced.length, 0);
  const shared = plan.get(1).filter(row => row.subjectId === 1);
  assert.equal(shared.length, 2);
  assert.notEqual(shared[0].dayOfWeek, shared[1].dayOfWeek);
  assert.equal(plan.get(2)[0], shared[0]);
  for (const rows of plan.values()) {
    assert.equal(new Set(rows.map(row => `${row.dayOfWeek}-${row.periodId}`)).size, rows.length);
  }
  await saveAllSchedules(plan);
  assert.equal(all("SELECT id FROM Schedule WHERE subjectId=1").length, 2);
  assert.equal(all("SELECT * FROM ScheduleGroup WHERE scheduleId IN (SELECT id FROM Schedule WHERE subjectId=1)").length, 4);
});

test("separate mode finds one slot with two available distinct teachers and rooms", async (t) => {
  const { generateSchedulePaired, saveAllSchedules, all, db } = fixture(t);
  db.exec(`
    UPDATE Subject SET pairedMode='SEPARATE_ROOMS' WHERE id=1;
    INSERT INTO TeacherBusy (teacherId, dayOfWeek, periodId) VALUES (2, 1, 1);
    INSERT INTO LockedSlot (classGroupId, dayOfWeek, periodId, label) VALUES (2, 1, 2, 'Locked');
  `);
  const plan = await generateSchedulePaired([[1, 2]]);
  await saveAllSchedules(plan);
  const rows = all("SELECT * FROM Schedule WHERE subjectId=1");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].dayOfWeek, 2);
  assert.equal(rows[0].dayOfWeek, rows[1].dayOfWeek);
  assert.equal(rows[0].periodId, rows[1].periodId);
  assert.notEqual(rows[0].roomId, rows[1].roomId);
  assert.notEqual(rows[0].teacherId, rows[1].teacherId);
});

test("ordinary mode counts existing lessons for other groups and preserves their rows", async (t) => {
  const { generateSchedule, saveSchedule, db, all } = fixture(t);
  db.exec(`
    DELETE FROM TeacherSubject WHERE teacherId=2;
    INSERT INTO Schedule (id, classGroupId, subjectId, roomId, dayOfWeek, periodId, teacherId)
      VALUES (10, 3, 1, 1, 1, 2, 1), (11, 1, 2, 2, 1, 1, NULL);
  `);
  const rows = await generateSchedule(1);
  assert.equal(rows.unplaced.length, 0);
  assert.equal(rows.find(row => row.subjectId === 1).dayOfWeek, 2);
  assert.equal(rows.find(row => row.subjectId === 2).teacherId, undefined);
  await saveSchedule(1, rows);
  assert.equal(all("SELECT id FROM Schedule WHERE id=10").length, 1);
  assert.equal(all("SELECT id FROM Schedule WHERE id=11").length, 0);
});

test("reports unset format and insufficient teachers without replacing old schedules", async (t) => {
  const { generateSchedulePaired, saveAllSchedules, db, all, writes } = fixture(t);
  db.exec(`
    UPDATE Subject SET pairedMode=NULL WHERE id=1;
    INSERT INTO Schedule (classGroupId, subjectId, roomId, dayOfWeek, periodId)
      VALUES (1, 2, 1, 1, 1);
  `);
  const before = all("SELECT * FROM Schedule");
  let plan = await generateSchedulePaired([[1, 2]]);
  assert.match(plan.unplaced[0].reason, /เลือกรูปแบบ/);
  await assert.rejects(saveAllSchedules(plan), /ขาด 1 คาบ/);
  db.exec("UPDATE Subject SET pairedMode='SEPARATE_ROOMS' WHERE id=1; DELETE FROM TeacherSubject WHERE teacherId=2;");
  plan = await generateSchedulePaired([[1, 2]]);
  assert.match(plan.unplaced[0].reason, /ครูผู้สอนอย่างน้อย 2 คน/);
  await assert.rejects(saveAllSchedules(plan), /จัดตารางไม่ครบ/);
  assert.deepEqual(writes, []);
  assert.deepEqual(all("SELECT * FROM Schedule"), before);
});

test("transaction revalidates a stale plan and protects shared rows outside its scope", async (t) => {
  const { generateSchedule, saveSchedule, db, all, writes } = fixture(t);
  db.exec(`
    INSERT INTO Schedule (id, classGroupId, subjectId, roomId, dayOfWeek, periodId, teacherId)
      VALUES (10, 3, 1, 1, 1, 1, 1);
    INSERT INTO ScheduleGroup VALUES (10, 1, 1, 1);
  `);
  const rows = await generateSchedule(1);
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].periodId, 1);
  const row = rows[0];
  db.prepare("INSERT INTO LockedSlot (classGroupId, dayOfWeek, periodId, label) VALUES (1, ?, ?, 'New lock')")
    .run(row.dayOfWeek, row.periodId);
  await assert.rejects(saveSchedule(1, rows), /Schedule conflict/);
  assert.deepEqual(writes, []);
  db.exec("DELETE FROM LockedSlot");
  await saveSchedule(1, rows);
  assert.equal(all("SELECT * FROM ScheduleGroup WHERE scheduleId=10").length, 2);
});

test("failed shared membership insert rolls back all writes", async (t) => {
  const { generateSchedulePaired, saveAllSchedules, db, all, writes } = fixture(t);
  db.exec(`
    INSERT INTO Schedule (classGroupId, subjectId, roomId, dayOfWeek, periodId)
      VALUES (1, 2, 1, 1, 1), (2, 2, 2, 1, 1);
    CREATE TRIGGER fail_link BEFORE INSERT ON ScheduleGroup
      WHEN NEW.classGroupId=2 BEGIN SELECT RAISE(ABORT, 'injected link failure'); END;
  `);
  const before = all("SELECT * FROM Schedule");
  const linked = all("SELECT * FROM ScheduleGroup");
  const plan = await generateSchedulePaired([[1, 2]]);
  await assert.rejects(saveAllSchedules(plan), /injected link failure/);
  assert.deepEqual(writes, ["delete", "schedule", "membership"]);
  assert.deepEqual(all("SELECT * FROM Schedule"), before);
  assert.deepEqual(all("SELECT * FROM ScheduleGroup"), linked);
});

test("changing a paired mode after generation invalidates the pending plan", async (t) => {
  const { generateSchedulePaired, saveAllSchedules, db, writes } = fixture(t);
  db.exec("UPDATE Subject SET pairedMode='SEPARATE_ROOMS' WHERE id=1");
  const plan = await generateSchedulePaired([[1, 2]]);
  db.exec("UPDATE Subject SET pairedMode='SHARED_ROOM' WHERE id=1");
  await assert.rejects(saveAllSchedules(plan), /Schedule conflict/);
  assert.deepEqual(writes, []);
});
