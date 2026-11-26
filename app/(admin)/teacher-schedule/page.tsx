"use client";
import { useEffect, useState } from "react";

interface Teacher { id: number; code: string; name: string; }
interface Period { id: number; periodNo: number; startTime: string; endTime: string; isLunch: boolean; }
interface TeacherSchedule {
  id: number; dayOfWeek: number;
  subject: { name: string };
  room: { name: string };
  classGroup: { name: string };
  period: { id: number; periodNo: number };
}

const DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"];
const COLORS = [
  "bg-indigo-50 text-indigo-800 border-indigo-100",
  "bg-emerald-50 text-emerald-800 border-emerald-100",
  "bg-amber-50 text-amber-800 border-amber-100",
  "bg-rose-50 text-rose-800 border-rose-100",
  "bg-purple-50 text-purple-800 border-purple-100",
  "bg-cyan-50 text-cyan-800 border-cyan-100",
];

export default function TeacherSchedulePage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [schedules, setSchedules] = useState<TeacherSchedule[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [totalPeriods, setTotalPeriods] = useState(0);
  const [summary, setSummary] = useState<{ day: number; count: number }[]>([]);

  useEffect(() => {
    fetch("/api/teachers").then((r) => r.json()).then((data) => {
      setTeachers(data);
      if (data.length > 0) loadSchedule(data[0]);
    });
    fetch("/api/periods").then((r) => r.json()).then(setPeriods);
  }, []);

  const loadSchedule = async (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    const res = await fetch(`/api/teacher-schedule?teacherId=${teacher.id}`);
    const data = await res.json();
    setSchedules(data.schedules ?? []);
    setTotalPeriods(data.total ?? 0);
    setSummary(data.summary ?? []);
  };

  const getCell = (day: number, periodId: number) =>
    schedules.find((s) => s.dayOfWeek === day && s.period.id === periodId);

  // color map ตามห้องนักเรียน
  const classColorMap: Record<string, string> = {};
  let colorIdx = 0;
  schedules.forEach((s) => {
    if (!classColorMap[s.classGroup.name]) {
      classColorMap[s.classGroup.name] = COLORS[colorIdx % COLORS.length];
      colorIdx++;
    }
  });

  const teachPeriods = periods.filter((p) => !p.isLunch);
  const lunchPeriod = periods.find((p) => p.isLunch);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">ตารางสอนครู</h1>
        <p className="text-gray-500 text-sm mt-1">ดูตารางสอนของครูแต่ละคน</p>
      </div>

      {/* เลือกครู */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {teachers.map((t) => (
          <button key={t.id} onClick={() => loadSchedule(t)}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors border ${
              selectedTeacher?.id === t.id
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
            }`}>
            {t.name}
          </button>
        ))}
      </div>

      {selectedTeacher && (
        <>
          {/* สรุปข้อมูลครู */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-5">
            <div className="col-span-2 sm:col-span-1 bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 mb-1">รวมทั้งหมด</div>
              <div className="text-2xl font-semibold text-indigo-600">{totalPeriods}</div>
              <div className="text-xs text-gray-400">คาบ/สัปดาห์</div>
            </div>
            {summary.map((s) => (
              <div key={s.day} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="text-xs text-gray-500 mb-1">{DAYS[s.day - 1]}</div>
                <div className="text-2xl font-semibold text-gray-800">{s.count}</div>
                <div className="text-xs text-gray-400">คาบ</div>
              </div>
            ))}
          </div>

          {/* legend ห้องนักเรียน */}
          {Object.keys(classColorMap).length > 0 && (
            <div className="flex gap-2 flex-wrap mb-4">
              {Object.entries(classColorMap).map(([name, color]) => (
                <span key={name} className={`text-xs px-3 py-1 rounded-full border ${color}`}>
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* ตารางสอน (วันเป็นแถว คาบเป็นคอลัมน์) */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-3 text-left text-gray-500 font-medium w-20">วัน</th>
                  {teachPeriods.map((period, idx) => (
                    <>
                      {lunchPeriod && period.periodNo === 5 && idx > 0 && (
                        <th key="lunch-head" className="px-2 py-3 text-center text-amber-600 font-medium bg-amber-50 w-16">
                          พัก<br/><span className="font-normal text-[10px]">{lunchPeriod.startTime}-{lunchPeriod.endTime}</span>
                        </th>
                      )}
                      <th key={period.id} className="px-2 py-3 text-center text-gray-500 font-medium">
                        คาบ {period.periodNo}<br/>
                        <span className="font-normal text-[10px] text-gray-400">{period.startTime}-{period.endTime}</span>
                      </th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((day) => (
                  <tr key={day} className="border-b border-gray-50">
                    <td className="px-3 py-2 text-gray-700 font-medium bg-gray-50">{DAYS[day - 1]}</td>
                    {teachPeriods.map((period, idx) => (
                      <>
                        {lunchPeriod && period.periodNo === 5 && idx > 0 && (
                          <td key="lunch-cell" className="px-1 py-1.5 bg-amber-50/40" />
                        )}
                        <td key={period.id} className="px-1.5 py-1.5">
                          {(() => {
                            const cell = getCell(day, period.id);
                            return cell ? (
                              <div className={`rounded-lg px-1.5 py-2 border text-center ${classColorMap[cell.classGroup.name]}`}>
                                <div className="font-medium leading-tight">{cell.subject.name}</div>
                                <div className="text-[10px] opacity-75 mt-0.5">{cell.classGroup.name}</div>
                                <div className="text-[10px] opacity-60">{cell.room.name}</div>
                              </div>
                            ) : (
                              <div className="h-10 rounded-lg bg-gray-50 border border-dashed border-gray-200" />
                            );
                          })()}
                        </td>
                      </>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {schedules.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              ครูคนนี้ยังไม่มีตารางสอน กรุณาจัดตารางเรียนก่อน
            </div>
          )}
        </>
      )}

      {teachers.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          ยังไม่มีครู กรุณาเพิ่มครูในเมนู "ครูผู้สอน" ก่อน
        </div>
      )}
    </div>
  );
}
