import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { generateSchedule, saveSchedule } from "@/lib/scheduler";
import { prisma } from "@/lib/prisma";
import { isObject, positiveInt, scheduleForGroup, scheduleInclude, scheduleOrder } from "../schedules/data";

export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const body: unknown = await req.json().catch(() => null);
  const id = isObject(body) ? positiveInt(body.classGroupId) : undefined;
  if (!id) return NextResponse.json({ error: "รหัสกลุ่มเรียนไม่ถูกต้อง" }, { status: 400 });

  const group = await prisma.classGroup.findUnique({ where: { id } });
  if (!group) return NextResponse.json({ error: "ไม่พบกลุ่มเรียน" }, { status: 404 });

  try {
    const assignments = await generateSchedule(id);
    if (assignments.unplaced.length) {
      return NextResponse.json({ error: "จัดตารางไม่ครบ", unplaced: assignments.unplaced }, { status: 422 });
    }
    await saveSchedule(id, assignments);
    const schedules = await prisma.schedule.findMany({
      where: scheduleForGroup(id), include: scheduleInclude, orderBy: scheduleOrder,
    });
    return NextResponse.json({ ok: true, count: schedules.length, schedules });
  } catch (error) {
    console.error("Generate error:", error);
    return NextResponse.json({ error: "จัดตารางไม่สำเร็จ" }, { status: 500 });
  }
}
