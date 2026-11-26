import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { positiveInt } from "../../schedules/data";
import { subjectInput } from "../input";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const id = positiveInt(params.id);
  if (!id) return NextResponse.json({ error: "รหัสวิชาไม่ถูกต้อง" }, { status: 400 });
  const body = await req.json().catch(() => null);

  return prisma.$transaction(async (tx) => {
    const current = await tx.subject.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "ไม่พบรายวิชา" }, { status: 404 });

    const data = subjectInput(body, current);
    if (!data) return NextResponse.json({ error: "ข้อมูลวิชาหรือรูปแบบจับคู่ไม่ถูกต้อง" }, { status: 400 });
    return NextResponse.json(await tx.subject.update({ where: { id }, data }));
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const id = positiveInt(params.id);
  if (!id) return NextResponse.json({ error: "รหัสวิชาไม่ถูกต้อง" }, { status: 400 });

  return prisma.$transaction(async (tx) => {
    if (!await tx.subject.findUnique({ where: { id } })) {
      return NextResponse.json({ error: "ไม่พบรายวิชา" }, { status: 404 });
    }
    await tx.schedule.deleteMany({ where: { subjectId: id } });
    await tx.lockedSlot.deleteMany({ where: { subjectId: id } });
    await tx.subject.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}
