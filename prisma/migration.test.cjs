const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { backup, DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");

function migration(name) {
  return readFileSync(join(__dirname, "migrations", name, "migration.sql"), "utf8");
}

test("phase 1 preserves existing rows and supports both paired modes on a SQLite copy", async (t) => {
  const folder = mkdtempSync(join(tmpdir(), "timetable-migration-"));
  const original = new DatabaseSync(":memory:");
  const snapshot = join(folder, "backup.sqlite");
  const copy = join(folder, "copy.sqlite");
  let db;
  t.after(() => {
    db?.close();
    original.close();
    for (const file of [snapshot, copy]) rmSync(file, { force: true });
    rmdirSync(folder);
  });

  original.exec(migration("0000_baseline"));
  original.exec(`
    INSERT INTO Subject (id, code, name, periodsPerWeek, isCommon) VALUES
      (1, 'G', 'General', 2, 1), (2, 'V', 'Vocational', 1, 0);
    INSERT INTO ClassGroup (id, name, pairKey) VALUES (1, 'A', 'P'), (2, 'B', 'P'), (3, 'C', NULL);
    INSERT INTO Room (id, name) VALUES (1, 'R1'), (2, 'R2');
    INSERT INTO Period (id, periodNo, startTime, endTime) VALUES (1, 1, '08:00', '09:00');
    INSERT INTO Teacher (id, code, name) VALUES (1, 'T1', 'One'), (2, 'T2', 'Two');
    INSERT INTO Schedule (id, dayOfWeek, isLocked, classGroupId, subjectId, roomId, periodId, teacherId)
      VALUES (7, 1, 1, 1, 1, 1, 1, 1), (8, 1, 0, 2, 2, 2, 1, NULL);
  `);
  const oldTables = original.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  const originalRows = new Map(oldTables.map(({ name }) =>
    [name, original.prepare(`SELECT * FROM "${name}" ORDER BY id`).all()]));
  await backup(original, snapshot);
  await backup(original, copy);
  db = new DatabaseSync(copy);
  db.exec(migration("0001_paired_schedule_groups"));

  for (const [name, rows] of originalRows) {
    const columns = name === "Subject" ? "id, code, name, periodsPerWeek, isCommon, createdAt" : "*";
    assert.deepEqual(db.prepare(`SELECT ${columns} FROM "${name}" ORDER BY id`).all(), rows);
  }
  assert.equal(db.prepare("SELECT count(*) AS n FROM Subject WHERE pairedMode IS NOT NULL").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM ScheduleGroup").get().n, 2);
  assert.throws(() => db.exec("UPDATE Subject SET pairedMode = 'INVALID' WHERE id = 1"), /CHECK/);
  db.exec(`
    UPDATE Subject SET pairedMode = 'SHARED_ROOM' WHERE id = 1;
    INSERT INTO Schedule (id, dayOfWeek, classGroupId, subjectId, roomId, periodId, teacherId)
      VALUES (9, 2, 1, 1, 1, 1, 1);
    INSERT INTO ScheduleGroup VALUES (9, 2, 2, 1);
  `);
  assert.equal(db.prepare("SELECT count(*) AS n FROM ScheduleGroup WHERE scheduleId = 9").get().n, 2);
  assert.throws(() => db.exec("INSERT INTO ScheduleGroup VALUES (9, 3, 3, 1)"), /FOREIGN KEY/);
  assert.throws(() => db.exec(`
    INSERT INTO Schedule (dayOfWeek, classGroupId, subjectId, roomId, periodId)
      VALUES (2, 2, 2, 2, 1)
  `), /UNIQUE/);
  assert.throws(() => db.exec(`
    INSERT INTO Schedule (dayOfWeek, classGroupId, subjectId, roomId, periodId)
      VALUES (2, 3, 2, 1, 1)
  `), /UNIQUE/);
  db.exec(`
    UPDATE Schedule SET dayOfWeek = 3 WHERE id = 9;
    UPDATE Schedule SET classGroupId = 3 WHERE id = 9;
  `);
  assert.deepEqual(db.prepare("SELECT classGroupId, dayOfWeek FROM ScheduleGroup WHERE scheduleId = 9 ORDER BY classGroupId")
    .all().map(row => [row.classGroupId, row.dayOfWeek]), [[2, 3], [3, 3]]);
  db.exec(`
    DELETE FROM Schedule WHERE id = 9;
    UPDATE Subject SET pairedMode = 'SEPARATE_ROOMS' WHERE id = 1;
    INSERT INTO Schedule (id, dayOfWeek, classGroupId, subjectId, roomId, periodId, teacherId)
      VALUES (10, 4, 1, 1, 1, 1, 1), (11, 4, 2, 1, 2, 1, 2);
  `);
  assert.equal(db.prepare("SELECT count(*) AS n FROM ScheduleGroup WHERE scheduleId = 9").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM ScheduleGroup WHERE scheduleId IN (10, 11)").get().n, 2);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

  const restored = new DatabaseSync(snapshot, { readOnly: true });
  try {
    assert.deepEqual(restored.prepare("SELECT * FROM Schedule ORDER BY id").all(), originalRows.get("Schedule"));
    assert.equal(restored.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'ScheduleGroup'").get().n, 0);
  } finally {
    restored.close();
  }
});
