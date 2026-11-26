import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  const classGroupId = searchParams.get("classGroupId");

  const issues: Issue[] = [];

  const where = classGroupId ? { classGroupId: Number(classGroupId) } : {};

  const schedules = await prisma.schedule.findMany({
    where,
    include: { subject: true, room: true, period: true, classGroup: true, teacher: true },
  });

  const subjects = await prisma.subject.findMany();
  const classGroups = classGroupId
    ? await prisma.classGroup.findMany({ where: { id: Number(classGroupId) } })
    : await prisma.classGroup.findMany();

  // ========== 1. ตรวจห้องเรียนชนกัน ==========
  const roomSlotMap = new Map<string, typeof schedules[0][]>();
  for (const s of schedules) {
    const key = `${s.dayOfWeek}-${s.periodId}-${s.roomId}`;
    if (!roomSlotMap.has(key)) roomSlotMap.set(key, []);
    roomSlotMap.get(key)!.push(s);
  }
  for (const [, entries] of roomSlotMap) {
    if (entries.length > 1) {
      issues.push({
        type: "error",
        message: `ห้องเรียน "${entries[0].room.name}" ถูกใช้ซ้ำ`,
        detail: `วันที่ ${entries[0].dayOfWeek} คาบ ${entries[0].period.periodNo} — ห้อง ${entries.map(e => e.classGroup.name).join(", ")}`,
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
    if (entries.length > 1) {
      issues.push({
        type: "error",
        message: `ครู "${entries[0].teacher?.name}" สอน 2 ห้องพร้อมกัน`,
        detail: `วันที่ ${entries[0].dayOfWeek} คาบ ${entries[0].period.periodNo} — ${entries.map(e => e.classGroup.name).join(", ")}`,
      });
    }
  }

  // ========== 3. ตรวจคาบว่างติดกันเกิน 2 ==========
  for (const group of classGroups) {
    const groupSchedules = schedules.filter(s => s.classGroupId === group.id);
    const periods = await prisma.period.findMany({
      where: { isLunch: false }, orderBy: { periodNo: "asc" }
    });
    const lockedSlots = await prisma.lockedSlot.findMany({ where: { classGroupId: group.id } });

    for (let day = 1; day <= 5; day++) {
      const occupied = new Set<number>();
      groupSchedules.filter(s => s.dayOfWeek === day).forEach(s => occupied.add(s.periodId));
      lockedSlots.filter(l => l.dayOfWeek === day).forEach(l => occupied.add(l.periodId));

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
    const groupSchedules = schedules.filter(s => s.classGroupId === group.id);
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
  const pairGroups = await prisma.classGroup.findMany({
    where: { pairKey: { not: null } },
  });
  const pairMap = new Map<string, number[]>();
  for (const g of pairGroups) {
    if (!pairMap.has(g.pairKey!)) pairMap.set(g.pairKey!, []);
    pairMap.get(g.pairKey!)!.push(g.id);
  }
  for (const [pairKey, ids] of pairMap) {
    if (ids.length < 2) continue;
    const commonSubjects = subjects.filter(s => s.isCommon);
    for (const subject of commonSubjects) {
      const slots0 = schedules.filter(s => s.classGroupId === ids[0] && s.subjectId === subject.id)
        .map(s => `${s.dayOfWeek}-${s.periodId}`).sort();
      const slots1 = schedules.filter(s => s.classGroupId === ids[1] && s.subjectId === subject.id)
        .map(s => `${s.dayOfWeek}-${s.periodId}`).sort();
      if (slots0.join(",") !== slots1.join(",") && (slots0.length > 0 || slots1.length > 0)) {
        const g0 = pairGroups.find(g => g.id === ids[0]);
        const g1 = pairGroups.find(g => g.id === ids[1]);
        issues.push({
          type: "warning",
          message: `คู่ "${pairKey}" — วิชาสามัญ "${subject.name}" ไม่ตรงคาบกัน`,
          detail: `${g0?.name} vs ${g1?.name}`,
        });
      }
    }
  }

  const errors = issues.filter(i => i.type === "error").length;
  const warnings = issues.filter(i => i.type === "warning").length;

  return NextResponse.json({ issues, errors, warnings, valid: errors === 0 });
}
