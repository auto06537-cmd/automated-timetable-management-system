import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const periods = await prisma.period.findMany({ orderBy: { periodNo: "asc" } });
  return NextResponse.json(periods);
}

export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  try {
    const { periodNo, startTime, endTime, isLunch } = await req.json();
    if (!periodNo || !startTime || !endTime) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    }

    const period = await prisma.period.create({
      data: { periodNo: Number(periodNo), startTime, endTime, isLunch: !!isLunch },
    });
    return NextResponse.json(period, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "หมายเลขคาบนี้มีอยู่ในระบบแล้ว" }, { status: 409 });
    }
    return NextResponse.json({ error: "ไม่สามารถบันทึกข้อมูลคาบเรียนได้ในขณะนี้" }, { status: 500 });
  }
}
