"use client";
import { useEffect, useState } from "react";

interface ClassGroup { id: number; name: string; pairKey: string | null; }
interface Period { id: number; periodNo: number; startTime: string; endTime: string; isLunch: boolean; }
interface Schedule { id: number; dayOfWeek: number; classGroupId: number; subject: { name: string; isCommon: boolean }; room: { name: string }; period: { id: number }; }
interface LockedSlot { dayOfWeek: number; classGroupId: number; label: string; period: { id: number }; }

const DAYS = ["", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"];
const COLORS = ["bg-indigo-50 text-indigo-800", "bg-emerald-50 text-emerald-800", "bg-amber-50 text-amber-800", "bg-rose-50 text-rose-800", "bg-purple-50 text-purple-800", "bg-cyan-50 text-cyan-800"];

export default function YearOverviewPage() {
  const [year, setYear] = useState(1);
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [lockedSlots, setLockedSlots] = useState<LockedSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterDay, setFilterDay] = useState(0); // 0 = ทุกวัน

  const load = async (y: number) => {
    setLoading(true);
    const res = await fetch(`/api/year-overview?year=${y}`);
    const data = await res.json();
    setClassGroups(data.classGroups);
    setPeriods(data.periods);
    setSchedules(data.schedules);
    setLockedSlots(data.lockedSlots);
    setLoading(false);
  };

  useEffect(() => { load(year); }, [year]);

  const teachPeriods = periods.filter(p => !p.isLunch);
  const lunchPeriod = periods.find(p => p.isLunch);
  const days = filterDay === 0 ? [1, 2, 3, 4, 5] : [filterDay];

  const getCell = (groupId: number, day: number, periodId: number) =>
    schedules.find(s => s.classGroupId === groupId && s.dayOfWeek === day && s.period.id === periodId);
  const getLocked = (groupId: number, day: number, periodId: number) =>
    lockedSlots.find(l => l.classGroupId === groupId && l.dayOfWeek === day && l.period.id === periodId);

  // สีตามห้อง
  const groupColorMap: Record<number, string> = {};
  classGroups.forEach((g, i) => { groupColorMap[g.id] = COLORS[i % COLORS.length]; });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">ตารางสรุปรายชั้นปี</h1>
        <p className="text-gray-500 text-sm mt-1">ดูภาพรวมตารางเรียนทุกห้องในชั้นปีเดียวกันพร้อมกัน</p>
      </div>

      {/* ตัวกรอง */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="flex gap-2">
          {[1, 2, 3].map(y => (
            <button key={y} onClick={() => setYear(y)}
              className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${year === y ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"}`}>
              ปวช.{y}
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-4">
          <button onClick={() => setFilterDay(0)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${filterDay === 0 ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-600 border-gray-200"}`}>
            ทุกวัน
          </button>
          {[1,2,3,4,5].map(d => (
            <button key={d} onClick={() => setFilterDay(d)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${filterDay === d ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-600 border-gray-200"}`}>
              {DAYS[d]}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-center py-12 text-gray-400">กำลังโหลด...</div>}

      {!loading && classGroups.length === 0 && (
        <div className="text-center py-12 text-gray-400">ไม่มีห้องนักเรียนในชั้นปี {year}</div>
      )}

      {!loading && classGroups.length > 0 && (
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse" style={{ minWidth: `${120 + classGroups.length * 130}px` }}>
            <thead>
              {/* header ชื่อห้อง */}
              <tr>
                <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-gray-500 font-medium text-left w-28">วัน / คาบ</th>
                {classGroups.map(g => (
                  <th key={g.id} className={`border border-gray-200 px-2 py-2 text-center font-medium ${groupColorMap[g.id]}`}
                    style={{ minWidth: "120px" }}>
                    {g.name}
                    {g.pairKey && <span className="ml-1 text-[10px] opacity-60">({g.pairKey})</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(day => (
                <>
                  {/* header วัน */}
                  <tr key={`day-${day}`}>
                    <td colSpan={classGroups.length + 1}
                      className="border border-gray-200 bg-gray-100 px-3 py-1.5 font-medium text-gray-700 text-xs">
                      วัน{DAYS[day]}
                    </td>
                  </tr>
                  {teachPeriods.map((period, pIdx) => (
                    <>
                      {lunchPeriod && period.periodNo === 5 && pIdx > 0 && (
                        <tr key={`lunch-${day}`}>
                          <td className="border border-gray-200 bg-amber-50 px-2 py-1 text-amber-700 text-center text-[10px]">
                            พักกลางวัน<br/>{lunchPeriod.startTime}–{lunchPeriod.endTime}
                          </td>
                          {classGroups.map(g => (
                            <td key={g.id} className="border border-gray-200 bg-amber-50/40" />
                          ))}
                        </tr>
                      )}
                      <tr key={`${day}-${period.id}`} className="hover:bg-gray-50">
                        <td className="border border-gray-200 bg-gray-50 px-2 py-1 text-gray-500 text-center">
                          <div className="font-medium text-gray-700">คาบ {period.periodNo}</div>
                          <div className="text-[10px]">{period.startTime}–{period.endTime}</div>
                        </td>
                        {classGroups.map(g => {
                          const cell = getCell(g.id, day, period.id);
                          const locked = getLocked(g.id, day, period.id);
                          return (
                            <td key={g.id} className="border border-gray-200 p-1" style={{ minWidth: "120px" }}>
                              {cell && (
                                <div className={`rounded px-1.5 py-1.5 text-center ${cell.subject.isCommon ? "bg-amber-50 text-amber-800" : groupColorMap[g.id]}`}>
                                  <div className="font-medium leading-tight text-[11px]">{cell.subject.name}</div>
                                  <div className="text-[10px] opacity-70">{cell.room.name}</div>
                                </div>
                              )}
                              {!cell && locked && (
                                <div className="rounded px-1.5 py-1.5 text-center bg-gray-100 text-gray-500">
                                  <div className="text-[10px]">{locked.label}</div>
                                </div>
                              )}
                              {!cell && !locked && (
                                <div className="h-8 rounded border border-dashed border-gray-200" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* legend */}
      {!loading && classGroups.length > 0 && (
        <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-200 inline-block" /> วิชาสามัญ (เรียนรวม)</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-50 border border-indigo-200 inline-block" /> วิชาแผนก</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-200 inline-block" /> ล็อกคาบ</div>
        </div>
      )}
    </div>
  );
}
