import { NextRequest, NextResponse } from "next/server";
import { getAppOrigin, revokeAdminSession, setAdminSessionCookie } from "@/lib/auth";

function reply(body: { ok: true } | { error: string }, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const origin = getAppOrigin();
  if (!origin) return reply({ error: "ระบบออกจากระบบยังตั้งค่าไม่พร้อม" }, 503);
  if (req.headers.get("origin") !== origin.origin) {
    return reply({ error: "ไม่อนุญาตให้ส่งคำขอจากต้นทางนี้" }, 403);
  }

  try {
    await revokeAdminSession(req);
    const response = reply({ ok: true }, 200);
    setAdminSessionCookie(response, origin, "", new Date(0));
    return response;
  } catch {
    return reply({ error: "ออกจากระบบไม่ได้ในขณะนี้" }, 500);
  }
}
