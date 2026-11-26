import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminSession, getAppOrigin, setAdminSessionCookie } from "@/lib/auth";

// A bcrypt-shaped fallback keeps the comparison cost for unknown usernames.
const fallbackHash = "$2b$10$zYXwVuTsRqPoNmLkJiHgF.sGvDy4BXEEz0EnC7FVeyb7pW2EQueiO";
// Fingerprint of the retired seed password. Existing rows remain untouched.
const retiredPassword = "ac9689e2272427085e35b9d3e3e8bed88cb3434828b43b86fc0596cad4c6e270";

function reply(body: { ok: true } | { error: string }, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const origin = getAppOrigin();
  if (!origin) return reply({ error: "ระบบเข้าสู่ระบบยังตั้งค่าไม่พร้อม" }, 503);
  if (req.headers.get("origin") !== origin.origin) {
    return reply({ error: "ไม่อนุญาตให้ส่งคำขอจากต้นทางนี้" }, 403);
  }
  const body: unknown = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("username" in body) || !("password" in body)) {
    return reply({ error: "กรุณากรอกข้อมูลเข้าสู่ระบบให้ถูกต้อง" }, 400);
  }
  const { username, password } = body;
  if (typeof username !== "string" || !username.trim() || username.length > 128 ||
      typeof password !== "string" || !password || password.includes("\0") ||
      Buffer.byteLength(password, "utf8") > 72) {
    return reply({ error: "กรุณากรอกข้อมูลเข้าสู่ระบบให้ถูกต้อง" }, 400);
  }

  try {
    const admin = await prisma.admin.findUnique({
      where: { username: username.trim() },
      select: { id: true, password: true },
    });
    const matches = await bcrypt.compare(password, admin?.password ?? fallbackHash);
    const isRetiredPassword = createHash("sha256").update(password).digest("hex") === retiredPassword;
    if (!admin || !matches || isRetiredPassword) {
      return reply({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, 401);
    }
    const session = await createAdminSession(admin.id, req);
    const response = reply({ ok: true }, 200);
    setAdminSessionCookie(response, origin, session.token, session.expiresAt);
    return response;
  } catch {
    return reply({ error: "ตรวจสอบการเข้าสู่ระบบไม่ได้ในขณะนี้" }, 500);
  }
}
