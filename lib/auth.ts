import { createHash, randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";

const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const sessionCookieName = "admin_session";

export function getAppOrigin(): URL | null {
  const value = process.env.APP_ORIGIN;
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.origin !== value) return null;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return url.protocol === "https:" || (url.protocol === "http:" && local) ? url : null;
  } catch {
    return null;
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

type SessionRequest = { cookies: { get(name: string): { value: string } | undefined } };

function requestTokenHash(req: SessionRequest) {
  const token = req.cookies.get(sessionCookieName)?.value;
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? hashToken(token) : null;
}

export async function createAdminSession(adminId: number, req: NextRequest) {
  const previousHash = requestTokenHash(req);
  const token = randomBytes(32).toString("base64url");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + sessionLifetimeMs);

  await prisma.$transaction(async (tx) => {
    if (previousHash) await tx.adminSession.deleteMany({ where: { tokenHash: previousHash } });
    await tx.adminSession.create({ data: { adminId, tokenHash: hashToken(token), createdAt, expiresAt } });
  });

  return { token, expiresAt };
}

export async function readAdminSession(req: SessionRequest) {
  const tokenHash = requestTokenHash(req);
  if (!tokenHash) return null;

  const session = await prisma.adminSession.findUnique({
    where: { tokenHash },
    select: { adminId: true, expiresAt: true },
  });
  return session && session.expiresAt.getTime() > Date.now() ? { adminId: session.adminId } : null;
}

export async function revokeAdminSession(req: NextRequest) {
  const tokenHash = requestTokenHash(req);
  if (tokenHash) await prisma.adminSession.deleteMany({ where: { tokenHash } });
}

export function setAdminSessionCookie(response: NextResponse, origin: URL, value: string, expires: Date) {
  response.cookies.set(sessionCookieName, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.protocol === "https:",
    path: "/",
    expires,
  });
}

export async function denyUnlessAdmin(req: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    if (!await readAdminSession(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบผู้ดูแล" }, { status: 401, headers });
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      const origin = getAppOrigin();
      if (!origin) return NextResponse.json({ error: "ระบบยังตั้งค่าไม่พร้อม" }, { status: 503, headers });
      if (req.headers.get("origin") !== origin.origin) {
        return NextResponse.json({ error: "ไม่อนุญาตให้ส่งคำขอจากต้นทางนี้" }, { status: 403, headers });
      }
    }
  } catch {
    return NextResponse.json({ error: "ตรวจสอบสิทธิ์ไม่ได้ในขณะนี้" }, { status: 503, headers });
  }
  return null;
}
