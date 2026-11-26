import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  const { type, rows } = await req.json();

  if (!type || !rows || !Array.isArray(rows)) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const results = { success: 0, skip: 0, error: 0, errors: [] as string[] };

  try {
    if (type === "subjects") {
      for (const row of rows) {
        try {
          await prisma.subject.upsert({
            where: { code: String(row.code).trim() },
            update: {
              name: String(row.name).trim(),
              periodsPerWeek: Number(row.periodsPerWeek) || 1,
              isCommon: String(row.isCommon).trim() === "สามัญ" || String(row.isCommon).trim() === "true",
            },
            create: {
              code: String(row.code).trim(),
              name: String(row.name).trim(),
              periodsPerWeek: Number(row.periodsPerWeek) || 1,
              isCommon: String(row.isCommon).trim() === "สามัญ" || String(row.isCommon).trim() === "true",
            },
          });
          results.success++;
        } catch (e) {
          results.error++;
          results.errors.push(`${row.code}: ${String(e).slice(0, 80)}`);
        }
      }
    }

    else if (type === "classgroups") {
      for (const row of rows) {
        try {
          await prisma.classGroup.upsert({
            where: { name: String(row.name).trim() },
            update: {
              year: Number(row.year) || 1,
              pairKey: row.pairKey ? String(row.pairKey).trim() : null,
              maxEndPeriod: row.maxEndPeriod ? Number(row.maxEndPeriod) : null,
            },
            create: {
              name: String(row.name).trim(),
              year: Number(row.year) || 1,
              pairKey: row.pairKey ? String(row.pairKey).trim() : null,
              maxEndPeriod: row.maxEndPeriod ? Number(row.maxEndPeriod) : null,
            },
          });
          results.success++;
        } catch (e) {
          results.error++;
          results.errors.push(`${row.name}: ${String(e).slice(0, 80)}`);
        }
      }
    }

    else if (type === "rooms") {
      for (const row of rows) {
        try {
          await prisma.room.upsert({
            where: { name: String(row.name).trim() },
            update: { capacity: Number(row.capacity) || 40 },
            create: { name: String(row.name).trim(), capacity: Number(row.capacity) || 40 },
          });
          results.success++;
        } catch (e) {
          results.error++;
          results.errors.push(`${row.name}: ${String(e).slice(0, 80)}`);
        }
      }
    }

    else if (type === "teachers") {
      for (const row of rows) {
        try {
          const teacher = await prisma.teacher.upsert({
            where: { code: String(row.code).trim() },
            update: {
              name: String(row.name).trim(),
              maxPeriodsPerDay: Number(row.maxPeriodsPerDay) || 4,
            },
            create: {
              code: String(row.code).trim(),
              name: String(row.name).trim(),
              maxPeriodsPerDay: Number(row.maxPeriodsPerDay) || 4,
            },
          });

          // กำหนดวิชาที่สอน (คั่นด้วย ,)
          if (row.subjectCodes) {
            const codes = String(row.subjectCodes).split(",").map((s: string) => s.trim()).filter(Boolean);
            for (const code of codes) {
              const subject = await prisma.subject.findUnique({ where: { code } });
              if (subject) {
                await prisma.teacherSubject.upsert({
                  where: { teacherId_subjectId: { teacherId: teacher.id, subjectId: subject.id } },
                  update: {},
                  create: { teacherId: teacher.id, subjectId: subject.id },
                });
              }
            }
          }
          results.success++;
        } catch (e) {
          results.error++;
          results.errors.push(`${row.code}: ${String(e).slice(0, 80)}`);
        }
      }
    }

    else {
      return NextResponse.json({ error: "ประเภทข้อมูลไม่รองรับ" }, { status: 400 });
    }

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  return NextResponse.json(results);
}
