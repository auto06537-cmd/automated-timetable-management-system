import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const classGroupId = searchParams.get("classGroupId");

  if (!classGroupId) {
    return NextResponse.json({ error: "ต้องระบุ classGroupId" }, { status: 400 });
  }

  const classGroup = await prisma.classGroup.findUnique({
    where: { id: Number(classGroupId) },
  });

  const schedules = await prisma.schedule.findMany({
    where: { classGroupId: Number(classGroupId) },
    include: {
      subject: true,
      room: true,
      period: true,
      teacher: true,
    },
    orderBy: [{ dayOfWeek: "asc" }, { period: { periodNo: "asc" } }],
  });

  const periods = await prisma.period.findMany({
    orderBy: { periodNo: "asc" },
  });

  // สรุปวิชาและจำนวนคาบ
  const subjectSummary: Record<number, { subject: { code: string; name: string; isCommon: boolean }; theory: number; practice: number; credit: number; total: number }> = {};
  for (const s of schedules) {
    if (!subjectSummary[s.subjectId]) {
      subjectSummary[s.subjectId] = {
        subject: { code: s.subject.code, name: s.subject.name, isCommon: s.subject.isCommon },
        theory: 0, practice: 0, credit: 0, total: 0,
      };
    }
    subjectSummary[s.subjectId].total++;
  }

  return NextResponse.json({
    classGroup,
    schedules,
    periods,
    subjectSummary: Object.values(subjectSummary),
    totalPeriods: schedules.length,
  });
}
