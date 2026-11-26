import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const group = await prisma.classGroup.update({
      where: { id: Number(params.id) },
      data: {
        name: body.name,
        year: Number(body.year) || 1,
        pairKey: body.pairKey || null,
        maxEndPeriod: body.maxEndPeriod ? Number(body.maxEndPeriod) : null,
      },
    });
    return NextResponse.json(group);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "ไม่พบกลุ่มเรียน" }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ไม่พบกลุ่มเรียน" }, { status: 404 });
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const group = await tx.classGroup.findUnique({ where: { id }, select: { id: true } });
      if (!group) return NextResponse.json({ error: "ไม่พบกลุ่มเรียน" }, { status: 404 });

      const sharedSchedule = await tx.schedule.findFirst({
        where: {
          OR: [
            { classGroupId: id, groups: { some: { classGroupId: { not: id } } } },
            { classGroupId: { not: id }, groups: { some: { classGroupId: id } } },
          ],
        },
        select: { id: true },
      });
      if (sharedSchedule) {
        return NextResponse.json(
          { error: "ไม่สามารถลบกลุ่มเรียนนี้ได้ เนื่องจากมีคาบเรียนรวมเชื่อมอยู่" },
          { status: 409 },
        );
      }

      await tx.schedule.deleteMany({ where: { classGroupId: id } });
      await tx.lockedSlot.deleteMany({ where: { classGroupId: id } });
      await tx.classGroup.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "ไม่พบกลุ่มเรียน" }, { status: 404 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2003") {
      return NextResponse.json(
        { error: "ไม่สามารถลบกลุ่มเรียนนี้ได้ เนื่องจากยังมีข้อมูลอ้างอิงอยู่" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "ไม่สามารถลบกลุ่มเรียนได้ในขณะนี้" }, { status: 500 });
  }
}
