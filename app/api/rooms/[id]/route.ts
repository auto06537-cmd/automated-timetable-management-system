import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const room = await prisma.room.update({
      where: { id: Number(params.id) },
      data: { name: body.name, capacity: Number(body.capacity) || 40 },
    });
    return NextResponse.json(room);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "ไม่พบห้องเรียน" }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const id = Number(params.id);
  await prisma.schedule.deleteMany({ where: { roomId: id } });
  await prisma.room.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
