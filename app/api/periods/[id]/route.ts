import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? error.code : undefined;
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ไม่พบคาบเรียน" }, { status: 404 });
  }

  try {
    const { periodNo, startTime, endTime, isLunch } = await req.json();
    if (!periodNo || !startTime || !endTime) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    }

    const period = await prisma.period.update({
      where: { id },
      data: { periodNo: Number(periodNo), startTime, endTime, isLunch: !!isLunch },
    });
    return NextResponse.json(period);
  } catch (error) {
    if (errorCode(error) === "P2025") {
      return NextResponse.json({ error: "ไม่พบคาบเรียน" }, { status: 404 });
    }
    if (errorCode(error) === "P2002") {
      return NextResponse.json({ error: "หมายเลขคาบนี้มีอยู่ในระบบแล้ว" }, { status: 409 });
    }
    return NextResponse.json({ error: "ไม่สามารถบันทึกข้อมูลคาบเรียนได้ในขณะนี้" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ไม่พบคาบเรียน" }, { status: 404 });
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const period = await tx.period.findUnique({ where: { id }, select: { id: true } });
      if (!period) return NextResponse.json({ error: "ไม่พบคาบเรียน" }, { status: 404 });

      const [schedules, lockedSlots, teacherBusy] = await Promise.all([
        tx.schedule.count({ where: { periodId: id } }),
        tx.lockedSlot.count({ where: { periodId: id } }),
        tx.teacherBusy.count({ where: { periodId: id } }),
      ]);
      if (schedules || lockedSlots || teacherBusy) {
        return NextResponse.json(
          { error: "ไม่สามารถลบคาบนี้ได้ เนื่องจากมีตารางหรือข้อมูลอื่นอ้างอิงอยู่" },
          { status: 409 },
        );
      }

      await tx.period.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    });
  } catch (error) {
    if (errorCode(error) === "P2003") {
      return NextResponse.json(
        { error: "ไม่สามารถลบคาบนี้ได้ เนื่องจากมีข้อมูลอ้างอิงอยู่" },
        { status: 409 },
      );
    }
    if (errorCode(error) === "P2025") {
      return NextResponse.json({ error: "ไม่พบคาบเรียน" }, { status: 404 });
    }
    return NextResponse.json({ error: "ไม่สามารถลบคาบเรียนได้ในขณะนี้" }, { status: 500 });
  }
}
