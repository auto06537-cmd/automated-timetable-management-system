import { denyUnlessAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSchedule, saveSchedule, generateSchedulePaired, saveAllSchedules } from "@/lib/scheduler";
import { isObject, positiveInt } from "../schedules/data";

type GroupResult = {
  classGroup: string;
  count: number;
  success: boolean;
  error?: string;
  unplaced?: Awaited<ReturnType<typeof generateSchedule>>["unplaced"];
};

export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin(req);
  if (denied) return denied;

  let body: unknown;
  try {
    const text = await req.text();
    body = text.trim() ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
  }
  if (!isObject(body) || Object.keys(body).some((key) => key !== "year" && key !== "usePairing")) {
    return NextResponse.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
  }
  const year = positiveInt(body.year);
  if ((body.year !== undefined && !year) ||
      (body.usePairing !== undefined && typeof body.usePairing !== "boolean")) {
    return NextResponse.json({ error: "ชั้นปีหรือโหมดจับคู่ไม่ถูกต้อง" }, { status: 400 });
  }

  const groups = await prisma.classGroup.findMany({
    where: year === undefined ? {} : { year },
    orderBy: [{ year: "asc" }, { name: "asc" }, { id: "asc" }],
  });
  if (year !== undefined && !groups.length) {
    return NextResponse.json({ error: `ไม่พบกลุ่มเรียนชั้นปี ${year}` }, { status: 400 });
  }

  const usePairing = body.usePairing ?? (year !== undefined);
  const groupsByPair = new Map<string, typeof groups>();
  for (const group of groups) {
    if (!usePairing || !group.pairKey) continue;
    const key = `${group.year}:${group.pairKey}`;
    const members = groupsByPair.get(key) ?? [];
    members.push(group);
    groupsByPair.set(key, members);
  }

  const pairs: number[][] = [];
  const invalidPairGroupIds = new Set<number>();
  const resultsById = new Map<number, GroupResult>();
  const failureKinds = new Map<number, "validation" | "runtime">();

  for (const members of groupsByPair.values()) {
    // Pairing follows the existing deterministic group order. A trailing odd member
    // is invalid and must not silently fall back to ordinary single-group generation.
    const completeMemberCount = members.length - (members.length % 2);
    for (let i = 0; i < completeMemberCount; i += 2) {
      pairs.push([members[i].id, members[i + 1].id]);
    }
    if (members.length % 2 === 1) {
      const unmatched = members[members.length - 1];
      invalidPairGroupIds.add(unmatched.id);
      resultsById.set(unmatched.id, {
        classGroup: unmatched.name,
        count: 0,
        success: false,
        error: `จับคู่ไม่ครบสำหรับ pairKey ${unmatched.pairKey}`,
      });
      failureKinds.set(unmatched.id, "validation");
    }
  }

  const pairedIds = new Set(pairs.flat());
  if (pairs.length) {
    try {
      const plan = await generateSchedulePaired(pairs);
      if (plan.unplaced.length) {
        for (const group of groups) {
          if (!pairedIds.has(group.id)) continue;
          const groupUnplaced = plan.unplaced.filter((item) => item.groupIds.includes(group.id));
          resultsById.set(group.id, {
            classGroup: group.name,
            count: 0,
            success: false,
            error: groupUnplaced.length
              ? "มีวิชาที่จัดตารางคู่ไม่ครบ จึงไม่ได้บันทึกตารางของคู่"
              : "ไม่ได้บันทึกตารางคู่ เนื่องจากมีอีกกลุ่มในชุดจับคู่จัดตารางไม่ครบ",
            unplaced: groupUnplaced,
          });
          failureKinds.set(group.id, "validation");
        }
      } else {
        await saveAllSchedules(plan);
        for (const group of groups) {
          if (!pairedIds.has(group.id)) continue;
          resultsById.set(group.id, {
            classGroup: group.name,
            count: plan.get(group.id)!.length,
            success: true,
          });
        }
      }
    } catch (error) {
      console.error("Generate paired error:", error);
      for (const group of groups) {
        if (!pairedIds.has(group.id)) continue;
        resultsById.set(group.id, {
          classGroup: group.name,
          count: 0,
          success: false,
          error: "จัดตารางคู่ไม่สำเร็จ",
        });
        failureKinds.set(group.id, "runtime");
      }
    }
  }

  for (const group of groups) {
    if (pairedIds.has(group.id) || invalidPairGroupIds.has(group.id)) continue;
    try {
      const plan = await generateSchedule(group.id);
      if (plan.unplaced.length) {
        resultsById.set(group.id, {
          classGroup: group.name,
          count: 0,
          success: false,
          error: "จัดตารางไม่ครบ",
          unplaced: plan.unplaced,
        });
        failureKinds.set(group.id, "validation");
        continue;
      }
      await saveSchedule(group.id, plan);
      resultsById.set(group.id, { classGroup: group.name, count: plan.length, success: true });
    } catch (error) {
      console.error("Generate group error:", error);
      resultsById.set(group.id, {
        classGroup: group.name,
        count: 0,
        success: false,
        error: "จัดตารางไม่สำเร็จ",
      });
      failureKinds.set(group.id, "runtime");
    }
  }

  const results = groups.map((group) => resultsById.get(group.id) ?? {
    classGroup: group.name,
    count: 0,
    success: false,
    error: "ไม่มีผลการจัดตาราง",
  });
  const successCount = results.filter((result) => result.success).length;
  const failureCount = results.length - successCount;
  const status = failureCount === 0 ? "success" : successCount > 0 ? "partial_success" : "failure";
  const totalPeriods = results.reduce((sum, result) => sum + result.count, 0);
  const responseStatus = status === "success"
    ? 200
    : status === "partial_success"
      ? 207
      : [...failureKinds.values()].includes("runtime") ? 500 : 422;

  return NextResponse.json({
    ok: status === "success",
    status,
    successCount,
    failureCount,
    error: status === "partial_success"
      ? "จัดตารางได้บางกลุ่ม โปรดตรวจผลรายกลุ่ม"
      : status === "failure"
        ? "ไม่สามารถจัดตารางได้ โปรดตรวจเหตุผลรายกลุ่ม"
        : undefined,
    results,
    totalPeriods,
  }, { status: responseStatus });
}
