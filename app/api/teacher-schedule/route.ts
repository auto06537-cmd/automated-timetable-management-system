import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const teacherId = searchParams.get("teacherId");

  if (!teacherId) {
    return NextResponse.json({ error: "ต้องระบุ teacherId" }, { status: 400 });
  }

  const schedules = await prisma.schedule.findMany({
    where: { teacherId: Number(teacherId) },
    include: {
      subject: true,
      room: true,
      period: true,
      classGroup: true,
    },
    orderBy: [{ dayOfWeek: "asc" }, { period: { periodNo: "asc" } }],
  });

  // สรุปจำนวนคาบสอนต่อวัน
  const summary = [1, 2, 3, 4, 5].map((day) => ({
    day,
    count: schedules.filter((s) => s.dayOfWeek === day).length,
  }));

  return NextResponse.json({ schedules, summary, total: schedules.length });
}
