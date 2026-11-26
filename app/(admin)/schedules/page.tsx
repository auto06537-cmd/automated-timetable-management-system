"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  normalizeGenerateAllResponse,
  requestFailureView,
  safeMessage,
  type GenerateAllView,
} from "@/lib/generate-all-response";

interface ClassGroup { id: number; name: string; year: number; }
interface Period { id: number; periodNo: number; startTime: string; endTime: string; isLunch: boolean; }
interface Schedule {
  id: number; dayOfWeek: number; isLocked: boolean;
  subject: { name: string }; room: { name: string }; period: { id: number; periodNo: number };
  teacher?: { name: string } | null;
}
const DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"];
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const COLORS = [
  "bg-indigo-50 text-indigo-800 border-indigo-100",
  "bg-emerald-50 text-emerald-800 border-emerald-100",
  "bg-amber-50 text-amber-800 border-amber-100",
  "bg-rose-50 text-rose-800 border-rose-100",
  "bg-purple-50 text-purple-800 border-purple-100",
  "bg-cyan-50 text-cyan-800 border-cyan-100",
];

export default function SchedulesPage() {
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [msg, setMsg] = useState("");
  const [allOutcome, setAllOutcome] = useState<GenerateAllView | null>(null);
  const generationLock = useRef<"single" | "all" | null>(null);
  const selectedGroupRef = useRef<number | null>(null);
  const scheduleRequestVersion = useRef(0);
  const router = useRouter();

  const selectGroup = (groupId: number) => {
    if (selectedGroupRef.current === groupId) return;
    setSchedules([]);
    selectedGroupRef.current = groupId;
    scheduleRequestVersion.current += 1;
    setSelectedGroup(groupId);
  };

  const refreshSelectedSchedule = async () => {
    const groupId = selectedGroupRef.current;
    if (groupId === null) return;

    const requestVersion = ++scheduleRequestVersion.current;
    try {
      const response = await fetch(`/api/schedules?classGroupId=${groupId}`);
      if (!response.ok) return;
      const data: unknown = await response.json();
      if (selectedGroupRef.current !== groupId || scheduleRequestVersion.current !== requestVersion) return;
      if (Array.isArray(data)) setSchedules(data);
    } catch {
      // Keep the current schedule view if this refresh fails.
    }
  };

  useEffect(() => {
    fetch("/api/classgroups").then((r) => r.json()).then((data) => {
      setGroups(data);
      if (data.length > 0) {
        const firstGroupId = data[0].id;
        selectedGroupRef.current = firstGroupId;
        scheduleRequestVersion.current += 1;
        setSelectedGroup(firstGroupId);
      }
    });
    fetch("/api/periods").then((r) => r.json()).then(setPeriods);
  }, []);

  useEffect(() => {
    if (selectedGroup === null) return;
    const requestedGroup = selectedGroup;
    const requestVersion = ++scheduleRequestVersion.current;
    fetch(`/api/schedules?classGroupId=${requestedGroup}`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (selectedGroupRef.current !== requestedGroup || scheduleRequestVersion.current !== requestVersion) return;
        if (Array.isArray(data)) setSchedules(data);
      })
      .catch(() => {
        // Keep the currently selected group visible if loading fails.
      });
  }, [selectedGroup]);

  // จัดตารางห้องเดียว
  const generate = async () => {
    if (generationLock.current !== null) return;
    const groupId = selectedGroupRef.current;
    if (groupId === null) return;

    generationLock.current = "single";
    setGenerating(true);
    setAllOutcome(null);
    setMsg("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classGroupId: groupId }),
      });
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (selectedGroupRef.current !== groupId) return;

      if (!response.ok || !isRecord(payload) || payload.ok !== true) {
        const message = isRecord(payload) ? safeMessage(payload.error) : undefined;
        setMsg(`❌ ${message ?? "ไม่สามารถจัดตารางห้องนี้ได้ กรุณาตรวจสอบเงื่อนไขแล้วลองใหม่"}`);
      } else {
        const count = typeof payload.count === "number" && Number.isSafeInteger(payload.count) && payload.count >= 0
          ? payload.count
          : undefined;
        setMsg(count === undefined ? "✅ จัดตารางสำเร็จ" : `✅ จัดตารางสำเร็จ ${count} คาบ`);
        if (Array.isArray(payload.schedules)) setSchedules(payload.schedules);
      }
    } catch {
      if (selectedGroupRef.current === groupId) setMsg("❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    } finally {
      if (generationLock.current === "single") generationLock.current = null;
      setGenerating(false);
    }
  };


  // จัดตารางทั้งชั้นปี (auto จับคู่วิชาสามัญตาม pairKey)
  const submitGenerateAll = async (body?: { year: number; usePairing: true }) => {
    if (generationLock.current !== null) return;
    generationLock.current = "all";
    setGeneratingAll(true);
    setMsg("");

    try {
      const response = await fetch("/api/generate-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      let payload: unknown = null;
      try {
        const responseText = await response.text();
        payload = responseText.trim() ? JSON.parse(responseText) : null;
      } catch {
        payload = null;
      }

      const outcome = normalizeGenerateAllResponse(response.status, payload);
      setAllOutcome(outcome);

      if (outcome.shouldReload) await refreshSelectedSchedule();
    } catch {
      setAllOutcome(requestFailureView());
    } finally {
      if (generationLock.current === "all") generationLock.current = null;
      setGeneratingAll(false);
    }
  };

  const generateByYear = async (year: number) => {
    if (!confirm(`จัดตารางปวช.${year} ทั้งหมด?\nระบบจะจับคู่วิชาสามัญอัตโนมัติตาม "รหัสคู่เรียนสามัญ"`)) return;
    await submitGenerateAll({ year, usePairing: true });
  };

  // จัดตารางทุกห้องพร้อมกัน
  const generateAll = async () => {
    if (!confirm(`จัดตารางทุกห้อง (${groups.length} ห้อง) พร้อมกัน? ตารางเดิมของทุกห้องจะถูกลบ`)) return;
    await submitGenerateAll();
  };

  const subjectColorMap: Record<string, string> = {};
  let colorIdx = 0;
  schedules.forEach((s) => {
    if (!subjectColorMap[s.subject.name]) {
      subjectColorMap[s.subject.name] = COLORS[colorIdx % COLORS.length];
      colorIdx++;
    }
  });

  const getCell = (day: number, periodId: number) =>
    schedules.find((s) => s.dayOfWeek === day && s.period.id === periodId);

  const teachPeriods = periods.filter((p) => !p.isLunch);
  const lunchPeriod = periods.find((p) => p.isLunch);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">ตารางเรียน</h1>
          <p className="text-gray-500 text-sm mt-1">ดูและจัดตารางเรียนอัตโนมัติ</p>
        </div>
        <div className="flex gap-2">
          {/* จัดห้องเดียว */}
          <button onClick={generate} disabled={generationLock.current !== null || generating || generatingAll || !selectedGroup}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {generating ? "กำลังจัด..." : "🪄 จัดห้องนี้"}
          </button>
          {/* พิมพ์ตาราง */}
          <button onClick={() => selectedGroup && router.push(`/print?classGroupId=${selectedGroup}`)}
            disabled={!selectedGroup}
            className="px-4 py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors">
            🖨️ พิมพ์
          </button>
          {/* จัดทุกห้อง */}
          <button onClick={generateAll} disabled={generationLock.current !== null || generating || generatingAll}
            className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {generatingAll ? "กำลังจัดทุกห้อง..." : "🚀 จัดตารางทุกห้อง"}
          </button>
        </div>
      </div>

      {/* แสดงผลจัดทุกห้อง */}
      {allOutcome && (
        <section
          aria-live="polite"
          className={`mb-4 rounded-xl border p-4 ${
            allOutcome.kind === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-900" :
            allOutcome.kind === "partial" ? "bg-amber-50 border-amber-200 text-amber-950" :
            allOutcome.kind === "unknown" ? "bg-gray-50 border-gray-200 text-gray-800" :
            "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          <h2 className="font-semibold">สถานะ: {
            allOutcome.kind === "success" ? "สำเร็จทั้งหมด" :
            allOutcome.kind === "partial" ? "สำเร็จบางส่วน" :
            allOutcome.kind === "server_error" ? "ข้อผิดพลาดจากเซิร์ฟเวอร์" :
            allOutcome.kind === "failure" ? "ล้มเหลวทั้งหมด" : "ไม่สามารถยืนยันผลได้"
          }</h2>
          <p className="mt-1 text-sm">{allOutcome.summary}</p>
          {allOutcome.successCount !== undefined && allOutcome.failureCount !== undefined && (
            <p className="mt-2 text-sm font-medium">
              สำเร็จ {allOutcome.successCount} กลุ่ม / ล้มเหลว {allOutcome.failureCount} กลุ่ม
            </p>
          )}

          {allOutcome.kind !== "server_error" && allOutcome.results.length > 0 && (
            <ul className="mt-3 space-y-2">
              {allOutcome.results.map((result, index) => (
                  <li key={`${result.classGroup}-${index}`} className="rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-sm">
                    <div className="font-medium">
                      กลุ่ม {result.classGroup}: {result.success ? "สำเร็จ" : "ไม่สำเร็จ"}
                      {result.success && result.count !== undefined ? ` (${result.count} คาบ)` : ""}
                    </div>
                    {!result.success && (
                      <div className="mt-1 text-xs">
                        {result.error ?? (result.unplaced?.length ? "มีรายการที่จัดไม่ได้" : "ไม่มีรายละเอียดเพิ่มเติม")}
                        {result.unplaced?.length ? (
                          <div className="mt-1">วิชาที่จัดไม่ได้ {result.unplaced.length} รายการ</div>
                        ) : null}
                        {result.unplaced?.map((item, itemIndex) => (
                          <div key={`${item.subjectName ?? "subject"}-${itemIndex}`} className="mt-1">
                            {item.subjectName ? `วิชา ${item.subjectName}: ` : ""}
                            {item.reason ?? "ไม่มีรายละเอียดเพิ่มเติม"}
                            {item.missingPeriods !== undefined ? ` (ขาด ${item.missingPeriods} คาบ)` : ""}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Tabs ห้องนักเรียน (จัดกลุ่มตามชั้นปี) */}
      {[1, 2, 3].map((y) => {
        const yearGroups = groups.filter((g) => g.year === y);
        if (yearGroups.length === 0) return null;
        return (
          <div key={y} className="mb-3">
            <div className="text-xs text-gray-400 mb-1.5">ปวช.{y}</div>
            <div className="flex gap-2 flex-wrap">
              {yearGroups.map((g) => (
                <button key={g.id} onClick={() => selectGroup(g.id)}
                  className={`px-4 py-1.5 rounded-full text-sm transition-colors border ${
                    selectedGroup === g.id
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                  }`}>
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <div className="mb-2" />

      {msg && (
        <div className={`mb-4 px-4 py-2 rounded-lg border text-sm ${msg.startsWith("✅") ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          {msg}
        </div>
      )}

      {/* ตารางเรียน (วันเป็นแถว คาบเป็นคอลัมน์) */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-xs min-w-[760px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-3 py-3 text-left text-gray-500 font-medium w-20">วัน</th>
              {teachPeriods.map((period, idx) => (
                <Fragment key={period.id}>
                  {lunchPeriod && period.periodNo === 5 && idx > 0 && (
                    <th key="lunch-head" className="px-2 py-3 text-center text-amber-600 font-medium bg-amber-50 w-16">
                      พัก<br/><span className="font-normal text-[10px]">{lunchPeriod.startTime}-{lunchPeriod.endTime}</span>
                    </th>
                  )}
                  <th key={period.id} className="px-2 py-3 text-center text-gray-500 font-medium">
                    คาบ {period.periodNo}<br/>
                    <span className="font-normal text-[10px] text-gray-400">{period.startTime}-{period.endTime}</span>
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((day) => (
              <tr key={day} className="border-b border-gray-50">
                <td className="px-3 py-2 text-gray-700 font-medium bg-gray-50">{DAYS[day - 1]}</td>
                {teachPeriods.map((period, idx) => (
                  <Fragment key={period.id}>
                    {lunchPeriod && period.periodNo === 5 && idx > 0 && (
                      <td key="lunch-cell" className="px-1 py-1.5 bg-amber-50/40" />
                    )}
                    <td key={period.id} className="px-1.5 py-1.5">
                      {(() => {
                        const cell = getCell(day, period.id);
                        return cell ? (
                          <div className={`rounded-lg px-1.5 py-2 border text-center ${subjectColorMap[cell.subject.name]}`}>
                            <div className="font-medium leading-tight">{cell.subject.name}</div>
                            <div className="text-[10px] opacity-70 mt-0.5">{cell.room.name}</div>
                            {cell.teacher && <div className="text-[10px] opacity-60">{cell.teacher.name}</div>}
                          </div>
                        ) : (
                          <div className="h-10 rounded-lg bg-gray-50 border border-dashed border-gray-200" />
                        );
                      })()}
                    </td>
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {schedules.length === 0 && (
        <div className="text-center py-6 text-gray-400 text-sm">
          กด "จัดห้องนี้" หรือ "จัดตารางทุกห้อง" เพื่อสร้างตารางเรียน
        </div>
      )}
    </div>
  );
}
