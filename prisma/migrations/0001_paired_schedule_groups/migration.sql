BEGIN;

-- Existing subjects remain unconfigured until an administrator selects a mode.
ALTER TABLE "Subject" ADD COLUMN "pairedMode" TEXT
  CHECK ("pairedMode" IN ('SHARED_ROOM', 'SEPARATE_ROOMS'));

CREATE UNIQUE INDEX "Schedule_id_dayOfWeek_periodId_key" ON "Schedule" ("id", "dayOfWeek", "periodId");

CREATE TABLE "ScheduleGroup" (
  "scheduleId" INTEGER NOT NULL,
  "classGroupId" INTEGER NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "periodId" INTEGER NOT NULL,
  PRIMARY KEY ("scheduleId", "classGroupId"),
  FOREIGN KEY ("scheduleId", "dayOfWeek", "periodId")
    REFERENCES "Schedule" ("id", "dayOfWeek", "periodId") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ScheduleGroup_dayOfWeek_classGroupId_periodId_key"
  ON "ScheduleGroup" ("dayOfWeek", "classGroupId", "periodId");

INSERT INTO "ScheduleGroup" ("scheduleId", "classGroupId", "dayOfWeek", "periodId")
  SELECT "id", "classGroupId", "dayOfWeek", "periodId" FROM "Schedule";

-- Keep the primary membership in sync for the legacy Schedule writer.
CREATE TRIGGER "Schedule_insert_primary_group"
AFTER INSERT ON "Schedule"
BEGIN
  INSERT INTO "ScheduleGroup" ("scheduleId", "classGroupId", "dayOfWeek", "periodId")
    VALUES (NEW."id", NEW."classGroupId", NEW."dayOfWeek", NEW."periodId");
END;

CREATE TRIGGER "Schedule_update_primary_group"
AFTER UPDATE OF "classGroupId" ON "Schedule"
WHEN OLD."classGroupId" <> NEW."classGroupId"
BEGIN
  DELETE FROM "ScheduleGroup"
    WHERE "scheduleId" = NEW."id" AND "classGroupId" = OLD."classGroupId";
  INSERT INTO "ScheduleGroup" ("scheduleId", "classGroupId", "dayOfWeek", "periodId")
    VALUES (NEW."id", NEW."classGroupId", NEW."dayOfWeek", NEW."periodId")
    ON CONFLICT ("scheduleId", "classGroupId") DO NOTHING;
END;

COMMIT;
