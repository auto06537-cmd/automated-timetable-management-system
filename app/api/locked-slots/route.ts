import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const classGroupId = searchParams.get("classGroupId");

  const slots = await prisma.lockedSlot.findMany({
    where: classGroupId ? { classGroupId: Number(classGroupId) } : {},
    include: { subject: true, period: true, classGroup: true },
  });
  return NextResponse.json(slots);
}

export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const { classGroupId, subjectId, periodId, dayOfWeek, label } = await req.json();

  if (!classGroupId || !periodId || !dayOfWeek || !label) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  }

  const slot = await prisma.lockedSlot.create({
    data: {
      classGroupId: Number(classGroupId),
      subjectId: subjectId ? Number(subjectId) : null,
      periodId: Number(periodId),
      dayOfWeek: Number(dayOfWeek),
      label,
    },
  });
  return NextResponse.json(slot, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  await prisma.lockedSlot.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
