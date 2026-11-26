import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// เพิ่มคาบไม่ว่างของครู
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const { dayOfWeek, periodId, reason } = await req.json();
  const teacherId = Number(params.id);

  if (!dayOfWeek || !periodId) {
    return NextResponse.json({ error: "ต้องระบุวันและคาบ" }, { status: 400 });
  }

  const busy = await prisma.teacherBusy.create({
    data: { teacherId, dayOfWeek: Number(dayOfWeek), periodId: Number(periodId), reason },
  });
  return NextResponse.json(busy, { status: 201 });
}

// ลบคาบไม่ว่างของครู
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const busyId = searchParams.get("busyId");
  if (!busyId) return NextResponse.json({ error: "ต้องระบุ busyId" }, { status: 400 });

  await prisma.teacherBusy.delete({ where: { id: Number(busyId) } });
  return NextResponse.json({ ok: true });
}
