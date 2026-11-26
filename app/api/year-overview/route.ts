import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? 1);

  const classGroups = await prisma.classGroup.findMany({
    where: { year },
    orderBy: { name: "asc" },
  });

  const periods = await prisma.period.findMany({
    orderBy: { periodNo: "asc" },
  });

  const schedules = await prisma.schedule.findMany({
    where: { classGroupId: { in: classGroups.map(g => g.id) } },
    include: { subject: true, room: true, period: true },
  });

  const lockedSlots = await prisma.lockedSlot.findMany({
    where: { classGroupId: { in: classGroups.map(g => g.id) } },
    include: { period: true },
  });

  return NextResponse.json({ classGroups, periods, schedules, lockedSlots });
}
