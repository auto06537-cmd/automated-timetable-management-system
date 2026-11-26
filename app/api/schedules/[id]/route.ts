import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isObject, positiveInt, scheduleInclude } from "../data";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const id = positiveInt(params.id);
  const body: unknown = await req.json().catch(() => null);
  if (!id || !isObject(body) || Object.keys(body).some((key) => !["dayOfWeek", "periodId", "roomId"].includes(key))) {
    return NextResponse.json({ error: "ข้อมูลคาบไม่ถูกต้อง" }, { status: 400 });
  }
  const dayOfWeek = positiveInt(body.dayOfWeek);
  const periodId = positiveInt(body.periodId);
  const roomId = positiveInt(body.roomId);
  if (!dayOfWeek || dayOfWeek > 5 || !periodId || !roomId) {
    return NextResponse.json({ error: "วัน คาบ หรือห้องไม่ถูกต้อง" }, { status: 400 });
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.schedule.findUnique({ where: { id }, include: { groups: true } });
    if (!existing) return NextResponse.json({ error: "ไม่พบข้อมูล" }, { status: 404 });
    if (existing.isLocked) return NextResponse.json({ error: "คาบนี้ถูกล็อก" }, { status: 409 });

    const period = await tx.period.findUnique({ where: { id: periodId } });
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!period || period.isLunch || !room) {
      return NextResponse.json({ error: "คาบหรือห้องที่เลือกใช้ไม่ได้" }, { status: 400 });
    }

    const groupIds = [...new Set([existing.classGroupId, ...existing.groups.map((group) => group.classGroupId)])];
    const time = { dayOfWeek, periodId };
    const conflict = await tx.schedule.findFirst({
      where: {
        ...time, id: { not: id },
        OR: [
          { roomId },
          { classGroupId: { in: groupIds } },
          { groups: { some: { classGroupId: { in: groupIds } } } },
          ...(existing.teacherId === null ? [] : [{ teacherId: existing.teacherId }]),
        ],
      },
    });
    const lock = await tx.lockedSlot.findFirst({ where: { ...time, classGroupId: { in: groupIds } } });
    const late = await tx.classGroup.findFirst({
      where: { id: { in: groupIds }, maxEndPeriod: { lt: period.periodNo } },
    });
    if (conflict || lock || late) {
      return NextResponse.json({ error: "คาบนี้ชนตารางครู ห้อง กลุ่มเรียน หรือข้อจำกัดของกลุ่ม" }, { status: 409 });
    }
    if (existing.teacherId !== null) {
      const teacherId = existing.teacherId;
      const teacher = await tx.teacher.findUnique({ where: { id: teacherId } });
      const busy = await tx.teacherBusy.findFirst({ where: { ...time, teacherId } });
      const load = await tx.schedule.count({ where: { dayOfWeek, teacherId, id: { not: id } } });
      if (!teacher || busy || load >= teacher.maxPeriodsPerDay) {
        return NextResponse.json({ error: "ครูไม่ว่างหรือถึงเพดานสอนรายวัน" }, { status: 409 });
      }
    }

    // ScheduleGroup follows its parent slot via the composite foreign key.
    const updated = await tx.schedule.update({ where: { id }, data: { ...time, roomId }, include: scheduleInclude });
    return NextResponse.json(updated);
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const id = positiveInt(params.id);
  if (!id) return NextResponse.json({ error: "รหัสคาบไม่ถูกต้อง" }, { status: 400 });

  return prisma.$transaction(async (tx) => {
    const existing = await tx.schedule.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "ไม่พบข้อมูล" }, { status: 404 });
    if (existing.isLocked) return NextResponse.json({ error: "คาบนี้ถูกล็อก" }, { status: 409 });
    await tx.schedule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}
