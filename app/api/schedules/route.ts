import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { positiveInt, scheduleForGroup, scheduleInclude, scheduleOrder } from "./data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const raw = req.nextUrl.searchParams.get("classGroupId");
  const id = positiveInt(raw);
  if (raw !== null && !id) return NextResponse.json({ error: "รหัสกลุ่มเรียนไม่ถูกต้อง" }, { status: 400 });

  const schedules = await prisma.schedule.findMany({
    where: id ? scheduleForGroup(id) : {},
    include: scheduleInclude,
    orderBy: scheduleOrder,
  });
  return NextResponse.json(schedules);
}

export async function DELETE(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const id = positiveInt(req.nextUrl.searchParams.get("classGroupId"));
  if (!id) return NextResponse.json({ error: "รหัสกลุ่มเรียนไม่ถูกต้อง" }, { status: 400 });

  return prisma.$transaction(async (tx) => {
    const scope = { ...scheduleForGroup(id), isLocked: false };
    const shared = await tx.schedule.findFirst({
      where: { ...scope, groups: { some: { classGroupId: { not: id } } } },
    });
    if (shared) {
      return NextResponse.json({ error: "มีคาบเรียนรวม กรุณาลบคาบนั้นโดยระบุรหัสคาบ" }, { status: 409 });
    }
    await tx.schedule.deleteMany({ where: scope });
    return NextResponse.json({ ok: true });
  });
}
