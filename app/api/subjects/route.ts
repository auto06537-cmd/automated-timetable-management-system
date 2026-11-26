import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subjectInput } from "./input";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const subjects = await prisma.subject.findMany({ orderBy: { code: "asc" } });
  return NextResponse.json(subjects);
}

export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  try {
    const data = subjectInput(await req.json().catch(() => null));
    if (!data) return NextResponse.json({ error: "ข้อมูลวิชาหรือรูปแบบจับคู่ไม่ถูกต้อง" }, { status: 400 });

    const subject = await prisma.subject.create({ data });
    return NextResponse.json(subject, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "รหัสวิชานี้มีอยู่ในระบบแล้ว" }, { status: 409 });
    }
    return NextResponse.json({ error: "ไม่สามารถบันทึกข้อมูลวิชาได้ในขณะนี้" }, { status: 500 });
  }
}
