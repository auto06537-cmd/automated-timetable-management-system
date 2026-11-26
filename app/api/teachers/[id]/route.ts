import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const { code, name, maxPeriodsPerDay, subjectIds } = await req.json();
  const id = Number(params.id);

  try {
    // อัปเดตข้อมูลครู
    const teacher = await prisma.teacher.update({
      where: { id },
      data: { code, name, maxPeriodsPerDay: Number(maxPeriodsPerDay) || 4 },
    });

    // อัปเดตวิชาที่ครูสอน (ลบเก่า → เพิ่มใหม่)
    if (subjectIds !== undefined) {
      await prisma.teacherSubject.deleteMany({ where: { teacherId: id } });
      if (subjectIds.length > 0) {
        await prisma.teacherSubject.createMany({
          data: subjectIds.map((sid: number) => ({ teacherId: id, subjectId: sid })),
        });
      }
    }

    return NextResponse.json(teacher);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "ไม่พบครู" }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  await prisma.teacher.delete({ where: { id: Number(params.id) } });
  return NextResponse.json({ ok: true });
}
