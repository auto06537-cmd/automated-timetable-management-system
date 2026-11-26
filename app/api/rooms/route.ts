import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const rooms = await prisma.room.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(rooms);
}

export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  try {
    const { name, capacity } = await req.json();
    if (!name) return NextResponse.json({ error: "ต้องระบุชื่อห้อง" }, { status: 400 });

    const room = await prisma.room.create({
      data: { name, capacity: Number(capacity) || 40 },
    });
    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "ชื่อห้องนี้มีอยู่ในระบบแล้ว" }, { status: 409 });
    }
    return NextResponse.json({ error: "ไม่สามารถบันทึกข้อมูลห้องได้ในขณะนี้" }, { status: 500 });
  }
}
