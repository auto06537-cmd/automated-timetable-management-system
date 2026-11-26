import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const groups = await prisma.classGroup.findMany({ orderBy: [{ year: "asc" }, { name: "asc" }] });
  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  try {
    const { name, year, pairKey, maxEndPeriod } = await req.json();
    if (!name) return NextResponse.json({ error: "ต้องระบุชื่อห้อง" }, { status: 400 });

    const group = await prisma.classGroup.create({
      data: {
        name,
        year: Number(year) || 1,
        pairKey: pairKey || null,
        maxEndPeriod: maxEndPeriod ? Number(maxEndPeriod) : null,
      },
    });
    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "ชื่อกลุ่มเรียนนี้มีอยู่ในระบบแล้ว" }, { status: 409 });
    }
    return NextResponse.json({ error: "ไม่สามารถบันทึกข้อมูลกลุ่มเรียนได้ในขณะนี้" }, { status: 500 });
  }
}
