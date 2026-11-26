import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const rooms = await prisma.room.findMany({ orderBy: { name: "asc" } });
  const periods = await prisma.period.findMany({ where: { isLunch: false }, orderBy: { periodNo: "asc" } });

  const schedules = await prisma.schedule.findMany({
    include: { subject: true, classGroup: true, period: true },
  });

  // จัดกลุ่มตามห้อง -> วัน -> คาบ
  const usage: Record<number, Record<string, { subject: string; classGroup: string }>> = {};
  for (const room of rooms) usage[room.id] = {};

  for (const s of schedules) {
    const key = `${s.dayOfWeek}-${s.periodId}`;
    usage[s.roomId][key] = { subject: s.subject.name, classGroup: s.classGroup.name };
  }

  // สรุป % การใช้งานต่อห้อง
  const totalSlots = 5 * periods.length;
  const summary = rooms.map((r) => {
    const usedCount = Object.keys(usage[r.id] ?? {}).length;
    return { roomId: r.id, roomName: r.name, used: usedCount, total: totalSlots, percent: Math.round((usedCount / totalSlots) * 100) };
  });

  return NextResponse.json({ rooms, periods, usage, summary });
}
