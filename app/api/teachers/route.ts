import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const teachers = await prisma.teacher.findMany({
    orderBy: { code: "asc" },
    include: {
      teacherSubjects: { include: { subject: true } },
      teacherBusy: { include: { period: true } },
    },
  });
  return NextResponse.json(teachers);
}

export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  try {
    const { code, name, maxPeriodsPerDay } = await req.json();
    if (!code || !name) {
      return NextResponse.json({ error: "ต้องระบุรหัสและชื่อครู" }, { status: 400 });
    }
    const teacher = await prisma.teacher.create({
      data: {
        code,
        name,
        maxPeriodsPerDay: Number(maxPeriodsPerDay) || 4,
      },
    });
    return NextResponse.json(teacher, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "รหัสครูนี้มีอยู่ในระบบแล้ว" }, { status: 409 });
    }
    return NextResponse.json({ error: "ไม่สามารถบันทึกข้อมูลครูได้ในขณะนี้" }, { status: 500 });
  }
}
