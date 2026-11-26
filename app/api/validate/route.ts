import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { positiveInt, scheduleInclude } from "../schedules/data";

interface Issue {
  type: "error" | "warning";
  message: string;
  detail?: string;
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const rawGroupId = searchParams.get("classGroupId");
  const classGroupId = positiveInt(rawGroupId);
  if (rawGroupId !== null && classGroupId === undefined) {
    return NextResponse.json({ error: "รหัสกลุ่มเรียนไม่ถูกต้อง" }, { status: 400 });
  }

  const issues: Issue[] = [];

  const schedules = await prisma.schedule.findMany({
    include: { ...scheduleInclude, teacher: true },
  });
  type Schedule = typeof schedules[number];
  const belongsTo = (schedule: Schedule, id: number) =>
    schedule.classGroupId === id || schedule.groups.some(group => group.classGroupId === id);
  const hasSelectedGroup = (entries: Schedule[]) =>
    classGroupId === undefined || entries.some(entry => belongsTo(entry, classGroupId));
  const groupNames = (schedule: Schedule) =>
    [...new Set([schedule.classGroup.name, ...schedule.groups.map(group => group.classGroup.name)])].join(", ");

  const subjects = await prisma.subject.findMany();
  const allGroups = await prisma.classGroup.findMany({
    orderBy: [{ year: "asc" }, { name: "asc" }, { id: "asc" }],
  });
  const classGroups = classGroupId === undefined ? allGroups : allGroups.filter(group => group.id === classGroupId);
  if (classGroupId !== undefined && !classGroups.length) {
    return NextResponse.json({ error: "ไม่พบกลุ่มเรียน" }, { status: 404 });
  }

  // ========== 1. ตรวจห้องเรียนชนกัน ==========
  const roomSlotMap = new Map<string, typeof schedules[0][]>();
  for (const s of schedules) {
    const key = `${s.dayOfWeek}-${s.periodId}-${s.roomId}`;
    if (!roomSlotMap.has(key)) roomSlotMap.set(key, []);
    roomSlotMap.get(key)!.push(s);
  }
  for (const [, entries] of roomSlotMap) {
    if (entries.length > 1 && hasSelectedGroup(entries)) {
      issues.push({
        type: "error",
        message: `ห้องเรียน "${entries[0].room.name}" ถูกใช้ซ้ำ`,
        detail: `วันที่ ${entries[0].dayOfWeek} คาบ ${entries[0].period.periodNo} — ห้อง ${entries.map(groupNames).join(", ")}`,
      });
    }
  }

  // ========== 2. ตรวจครูสอน 2 ห้องพร้อมกัน ==========
  const teacherSlotMap = new Map<string, typeof schedules[0][]>();
  for (const s of schedules.filter(s => s.teacherId)) {
    const key = `${s.dayOfWeek}-${s.periodId}-${s.teacherId}`;
    if (!teacherSlotMap.has(key)) teacherSlotMap.set(key, []);
    teacherSlotMap.get(key)!.push(s);
  }
  for (const [, entries] of teacherSlotMap) {
    if (entries.length > 1 && hasSelectedGroup(entries)) {
      issues.push({
        type: "error",
        message: `ครู "${entries[0].teacher?.name}" สอน 2 ห้องพร้อมกัน`,
        detail: `วันที่ ${entries[0].dayOfWeek} คาบ ${entries[0].period.periodNo} — ${entries.map(groupNames).join(", ")}`,
      });
    }
  }

  // ========== 3. ตรวจคาบว่างติดกันเกิน 2 ==========
  const periods = await prisma.period.findMany({
    where: { isLunch: false }, orderBy: { periodNo: "asc" },
  });
  const lockedSlots = await prisma.lockedSlot.findMany({
    where: { classGroupId: { in: classGroups.map(group => group.id) } },
  });
  for (const group of classGroups) {
    const groupSchedules = schedules.filter(s => belongsTo(s, group.id));

    for (let day = 1; day <= 5; day++) {
      const occupied = new Set<number>();
      groupSchedules.filter(s => s.dayOfWeek === day).forEach(s => occupied.add(s.periodId));
      lockedSlots.filter(l => l.classGroupId === group.id && l.dayOfWeek === day).forEach(l => occupied.add(l.periodId));

      let maxGap = 0, curGap = 0, started = false;
      for (const p of periods) {
        if (occupied.has(p.id)) { started = true; if (curGap > maxGap) maxGap = curGap; curGap = 0; }
        else if (started) curGap++;
      }
      if (maxGap > 2) {
        const dayNames = ["", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"];
        issues.push({
          type: "warning",
          message: `ห้อง ${group.name} มีคาบว่างติดกัน ${maxGap} คาบ`,
          detail: `วัน${dayNames[day]}`,
        });
      }
    }
  }

  // ========== 4. ตรวจวิชาไม่ครบจำนวนคาบ ==========
  for (const group of classGroups) {
    const groupSchedules = schedules.filter(s => belongsTo(s, group.id));
    for (const subject of subjects) {
      const count = groupSchedules.filter(s => s.subjectId === subject.id).length;
      if (count > 0 && count < subject.periodsPerWeek) {
        issues.push({
          type: "warning",
          message: `ห้อง ${group.name} วิชา "${subject.name}" จัดได้ ${count}/${subject.periodsPerWeek} คาบ`,
          detail: "อาจไม่มีคาบว่างเพียงพอ",
        });
      }
    }
  }

  // ========== 5. ตรวจวิชาสามัญคู่ไม่ตรงกัน ==========
  const pairMap = new Map<string, typeof allGroups>();
  for (const group of allGroups) {
    if (!group.pairKey) continue;
    const key = `${group.year}:${group.pairKey}`;
    const members = pairMap.get(key) ?? [];
    members.push(group);
    pairMap.set(key, members);
  }
  const commonSubjects = subjects.filter(subject => subject.isCommon);
  for (const members of pairMap.values()) {
    for (let index = 0; index + 1 < members.length; index += 2) {
      const [first, second] = members.slice(index, index + 2);
      if (classGroupId !== undefined && first.id !== classGroupId && second.id !== classGroupId) continue;
      for (const subject of commonSubjects) {
        const slotsFor = (id: number) => schedules.filter(s => belongsTo(s, id) && s.subjectId === subject.id)
          .map(s => `${s.dayOfWeek}-${s.periodId}`).sort().join(",");
        if (slotsFor(first.id) === slotsFor(second.id)) continue;
        issues.push({
          type: "warning",
          message: `คู่ "${first.pairKey}" — วิชาสามัญ "${subject.name}" ไม่ตรงคาบกัน`,
          detail: `${first.name} vs ${second.name}`,
        });
      }
    }
  }

  const errors = issues.filter(i => i.type === "error").length;
  const warnings = issues.filter(i => i.type === "warning").length;

  return NextResponse.json({ issues, errors, warnings, valid: errors === 0 });
}
