import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const DAYS = [1, 2, 3, 4, 5];

interface Assignment {
  classGroupId: number;
  sharedGroupId?: number;
  pairedMode?: "SHARED_ROOM" | "SEPARATE_ROOMS";
  subjectId: number;
  roomId: number;
  periodId: number;
  dayOfWeek: number;
  teacherId?: number;
  isLocked?: boolean;
}

interface Unplaced {
  groupIds: number[];
  subjectId: number;
  subjectName: string;
  missingPeriods: number;
  reason: string;
}

type Plan<T> = T & { unplaced: Unplaced[] };
type AssignmentMap = Map<number, Assignment[]>;
type Db = Prisma.TransactionClient;

function slot(day: number, period: number, resource: number) {
  return `${day}-${period}-${resource}`;
}

function groupIdsFor(row: Assignment) {
  return row.sharedGroupId === undefined ? [row.classGroupId] : [row.classGroupId, row.sharedGroupId];
}

async function loadState(db: Db, targets: number[]) {
  const groups = await db.classGroup.findMany({ where: { id: { in: targets } } });
  const subjects = await db.subject.findMany({ include: { teacherSubjects: true } });
  const rooms = await db.room.findMany();
  const periods = await db.period.findMany({ orderBy: { periodNo: "asc" } });
  const teachers = await db.teacher.findMany({ include: { teacherBusy: true } });
  const locks = await db.lockedSlot.findMany({ where: { classGroupId: { in: targets } } });
  const existing = await db.schedule.findMany({ include: { groups: true } });
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const periodById = new Map(periods.map((period) => [period.id, period]));
  const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const roomIds = new Set(rooms.map((room) => room.id));
  const scope = new Set(targets);
  const replaceIds: number[] = [];
  const retained: { row: typeof existing[number]; groupIds: number[] }[] = [];
  const groupSlots = new Set(locks.map((lock) => slot(lock.dayOfWeek, lock.periodId, lock.classGroupId)));
  const roomSlots = new Set<string>();
  const teacherSlots = new Set<string>();
  const teacherLoads = new Map<string, number>();

  function reserve(groupIds: number[], room: number, day: number, period: number, teacher?: number | null) {
    groupIds.forEach((id) => groupSlots.add(slot(day, period, id)));
    roomSlots.add(slot(day, period, room));
    if (teacher != null) {
      teacherSlots.add(slot(day, period, teacher));
      const key = `${teacher}-${day}`;
      teacherLoads.set(key, (teacherLoads.get(key) ?? 0) + 1);
    }
  }

  for (const row of existing) {
    const ids = [...new Set([row.classGroupId, ...row.groups.map((group) => group.classGroupId)])];
    if (!row.isLocked && ids.every((id) => scope.has(id))) {
      replaceIds.push(row.id);
    } else {
      retained.push({ row, groupIds: ids });
      reserve(ids, row.roomId, row.dayOfWeek, row.periodId, row.teacherId);
    }
  }

  function groupFree(id: number, day: number, periodId: number) {
    const group = groupById.get(id);
    const period = periodById.get(periodId);
    return group && period && !period.isLunch &&
      (group.maxEndPeriod == null || period.periodNo <= group.maxEndPeriod) &&
      !groupSlots.has(slot(day, periodId, id));
  }

  function teacherFree(id: number, day: number, periodIds: number[]) {
    const teacher = teacherById.get(id);
    return teacher &&
      (teacherLoads.get(`${id}-${day}`) ?? 0) + periodIds.length <= teacher.maxPeriodsPerDay &&
      periodIds.every((periodId) => !teacherSlots.has(slot(day, periodId, id)) &&
        !teacher.teacherBusy.some((busy) => busy.dayOfWeek === day && busy.periodId === periodId));
  }

  function roomFree(id: number, day: number, periodId: number) {
    return roomIds.has(id) && !roomSlots.has(slot(day, periodId, id));
  }

  return {
    groups, subjects, rooms, periods, subjectById, replaceIds, retained,
    reserve, groupFree, teacherFree, roomFree, groupSlots,
  };
}

function shuffle<T>(items: readonly T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function generate(groupIds: number[], pairs: number[][]): Promise<Plan<AssignmentMap>> {
  const state = await loadState(prisma, groupIds);
  if (state.groups.length !== groupIds.length) throw new Error("ไม่พบกลุ่มเรียนที่ต้องการจัดตาราง");
  const plan = new Map<number, Assignment[]>(groupIds.map((id) => [id, []]));
  const unplaced: Unplaced[] = [];
  const periods = state.periods.filter((period) => !period.isLunch);

  function add(row: Assignment) {
    const ids = groupIdsFor(row);
    state.reserve(ids, row.roomId, row.dayOfWeek, row.periodId, row.teacherId);
    for (const id of ids) plan.get(id)!.push(row);
  }

  function scheduleSubject(ids: number[], subject: typeof state.subjects[number]) {
    const report = (missingPeriods: number, reason: string) => {
      if (missingPeriods > 0) unplaced.push({
        groupIds: ids, subjectId: subject.id, subjectName: subject.name, missingPeriods, reason,
      });
    };
    const retainedSlots = ids.map((id) => new Set(state.retained
      .filter(({ row, groupIds }) => row.subjectId === subject.id && groupIds.includes(id))
      .map(({ row }) => `${row.dayOfWeek}-${row.periodId}`)));
    const completed = [...retainedSlots[0]].filter((key) => retainedSlots.every((set) => set.has(key))).length;
    let remaining = subject.periodsPerWeek - completed;
    if (remaining <= 0) return;

    const paired = ids.length === 2;
    if (paired && subject.pairedMode !== "SHARED_ROOM" && subject.pairedMode !== "SEPARATE_ROOMS") {
      report(remaining, "ยังไม่ได้เลือกรูปแบบเรียนรวม/เรียนแยก");
      return;
    }
    const separate = paired && subject.pairedMode === "SEPARATE_ROOMS";
    const resourceCount = separate ? 2 : 1;
    const teacherIds = subject.teacherSubjects.map((link) => link.teacherId);
    const requiresTeacher = paired || teacherIds.length > 0;
    if (requiresTeacher && teacherIds.length < resourceCount) {
      report(remaining, `วิชานี้ต้องมีครูผู้สอนอย่างน้อย ${resourceCount} คน`);
      return;
    }
    if (state.rooms.length < resourceCount) {
      report(remaining, `ต้องมีห้องเรียนอย่างน้อย ${resourceCount} ห้อง`);
      return;
    }

    const daily = new Map<number, number>();
    for (const key of retainedSlots[0]) {
      const day = Number(key.split("-")[0]);
      daily.set(day, (daily.get(day) ?? 0) + 1);
    }
    const blocked = new Set<string>();

    function place(size: number) {
      blocked.clear();
      for (const day of shuffle(DAYS)) {
        if (!paired && (daily.get(day) ?? 0) + size > 2) {
          blocked.add("ครบเพดานคาบรายวิชาต่อวัน");
          continue;
        }
        for (const start of shuffle(periods.map((_, index) => index))) {
          const block = periods.slice(start, start + size);
          if (block.length !== size || block.some((period, i) => i > 0 &&
            (period.periodNo !== block[i - 1].periodNo + 1 || period.startTime !== block[i - 1].endTime))) continue;
          const periodIds = block.map((period) => period.id);
          if (!ids.every((id) => periodIds.every((pid) => state.groupFree(id, day, pid)))) {
            blocked.add("กลุ่มไม่ว่าง คาบล็อก หรือเกินคาบเลิกเรียน");
            continue;
          }
          if (!paired) {
            const occupied = periods.map((p) => periodIds.includes(p.id) || state.groupSlots.has(slot(day, p.id, ids[0])));
            const gaps = occupied.slice(occupied.indexOf(true), occupied.lastIndexOf(true) + 1).join(",");
            if (gaps.includes("false,false,false")) {
              blocked.add("ช่วงว่างระหว่างคาบยาวเกินกำหนด");
              continue;
            }
          }
          const rooms = state.rooms.filter((room) => periodIds.every((pid) => state.roomFree(room.id, day, pid)));
          if (rooms.length < resourceCount) {
            blocked.add("ห้องว่างไม่พอ");
            continue;
          }
          const teachers = teacherIds.filter((id) => state.teacherFree(id, day, periodIds));
          if (requiresTeacher && teachers.length < resourceCount) {
            blocked.add("ครูว่างไม่พอหรือถึงเพดานสอนรายวัน");
            continue;
          }
          for (const periodId of periodIds) {
            for (let i = 0; i < resourceCount; i++) {
              add({
                classGroupId: ids[i], sharedGroupId: paired && !separate ? ids[1] : undefined,
                pairedMode: paired ? (separate ? "SEPARATE_ROOMS" : "SHARED_ROOM") : undefined,
                subjectId: subject.id, roomId: rooms[i].id, teacherId: teachers[i], dayOfWeek: day, periodId,
              });
            }
          }
          daily.set(day, (daily.get(day) ?? 0) + size);
          return true;
        }
      }
      return false;
    }

    // Preserve the preference for up to two double periods in ordinary subjects.
    const doubleBlocks = paired ? 0 : Math.min(2, remaining >= 3 ? Math.floor(remaining / 2) : 0);
    for (let i = 0; i < doubleBlocks; i++) {
      if (place(2)) remaining -= 2;
    }
    while (remaining > 0 && place(1)) remaining--;
    report(remaining, [...blocked].join(" / ") || "ไม่มีคาบสอนให้จัด");
  }

  for (const pair of pairs) {
    for (const subject of shuffle(state.subjects.filter((item) => item.isCommon))) scheduleSubject(pair, subject);
  }
  for (const id of groupIds) {
    const paired = pairs.some((pair) => pair.includes(id));
    for (const subject of shuffle(state.subjects)) {
      if (!paired || !subject.isCommon) scheduleSubject([id], subject);
    }
  }
  return Object.assign(plan, { unplaced });
}

export async function generateSchedule(classGroupId: number) {
  const plan = await generate([classGroupId], []);
  return Object.assign(plan.get(classGroupId)!, { unplaced: plan.unplaced });
}

export async function generateSchedulePaired(pairs: number[][]) {
  const groupIds = pairs.flat();
  if (pairs.some((pair) => pair.length !== 2) || new Set(groupIds).size !== groupIds.length) {
    throw new Error("แต่ละคู่ต้องมีสองกลุ่มและกลุ่มต้องไม่ซ้ำกัน");
  }
  return generate(groupIds, pairs);
}

export async function saveSchedule(classGroupId: number, assignments: Assignment[] & { unplaced?: Unplaced[] }) {
  await saveAllSchedules(Object.assign(new Map([[classGroupId, assignments]]), { unplaced: assignments.unplaced }));
}

export async function saveAllSchedules(plan: AssignmentMap & { unplaced?: Unplaced[] }) {
  if (plan.unplaced?.length) {
    const details = plan.unplaced.map((item) =>
      `${item.subjectName} (กลุ่ม ${item.groupIds.join(", ")}): ขาด ${item.missingPeriods} คาบ — ${item.reason}`);
    throw new Error(`จัดตารางไม่ครบ: ${details.join("; ")}`);
  }
  if (!plan.size) return;

  const targets = [...plan.keys()];
  const assignments: Assignment[] = [];
  const validId = (id: number) => Number.isInteger(id) && id > 0 && id <= 2147483647;
  for (const [id, rows] of plan) {
    if (!validId(id) || !rows.length) throw new Error(`Invalid group or empty schedule: ${id}`);
    for (const row of rows) {
      const ids = groupIdsFor(row);
      if (!ids.includes(id) || new Set(ids).size !== ids.length ||
        ids.some((gid) => !validId(gid) || !plan.get(gid)?.includes(row)) ||
        ![row.subjectId, row.roomId, row.periodId].every(validId) || !DAYS.includes(row.dayOfWeek) ||
        (row.teacherId !== undefined && !validId(row.teacherId))) {
        throw new Error(`Invalid schedule entry for group ${id}`);
      }
      if (row.classGroupId === id) assignments.push(row);
    }
  }

  await prisma.$transaction(async (tx) => {
    const state = await loadState(tx, targets);
    for (const row of assignments) {
      const ids = groupIdsFor(row);
      const { dayOfWeek: day, periodId, roomId, teacherId } = row;
      const subject = state.subjectById.get(row.subjectId);
      if (!subject || !ids.every((id) => state.groupFree(id, day, periodId)) ||
        !state.roomFree(roomId, day, periodId) ||
        (row.pairedMode !== undefined && (!subject.isCommon || subject.pairedMode !== row.pairedMode || teacherId === undefined)) ||
        (row.sharedGroupId !== undefined && row.pairedMode !== "SHARED_ROOM") ||
        (teacherId === undefined && subject.teacherSubjects.length > 0) ||
        (teacherId !== undefined && (!subject.teacherSubjects.some((link) => link.teacherId === teacherId) ||
          !state.teacherFree(teacherId, day, [periodId])))) {
        throw new Error(`Schedule conflict for group ${row.classGroupId}, day ${day}, period ${periodId}`);
      }
      state.reserve(ids, roomId, day, periodId, teacherId);
    }

    if (state.replaceIds.length) {
      await tx.schedule.deleteMany({ where: { id: { in: state.replaceIds } } });
    }
    const ordinary: Omit<Assignment, "sharedGroupId" | "pairedMode">[] = [];
    for (const { sharedGroupId, pairedMode, ...data } of assignments) {
      if (sharedGroupId === undefined) {
        ordinary.push(data);
        continue;
      }
      const row = await tx.schedule.create({ data, select: { id: true } });
      // The migration's trigger already links the primary group.
      await tx.scheduleGroup.create({ data: {
        scheduleId: row.id, classGroupId: sharedGroupId, dayOfWeek: data.dayOfWeek, periodId: data.periodId,
      } });
    }
    if (ordinary.length) await tx.schedule.createMany({ data: ordinary });
  });
}
