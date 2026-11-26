"use client";
import { useEffect, useState, useCallback } from "react";

interface ClassGroup { id: number; name: string; year: number; }
interface Period { id: number; periodNo: number; startTime: string; endTime: string; isLunch: boolean; }
interface Room { id: number; name: string; }
interface Schedule {
  id: number; dayOfWeek: number; isLocked: boolean;
  subject: { name: string; code: string };
  room: { id: number; name: string };
  period: { id: number; periodNo: number };
  classGroup: { name: string };
  teacher?: { name: string } | null;
}
interface Issue { type: "error" | "warning"; message: string; detail?: string; }

const DAYS = ["", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"];
const COLORS = [
  "bg-indigo-50 text-indigo-800 border-indigo-100",
  "bg-emerald-50 text-emerald-800 border-emerald-100",
  "bg-amber-50 text-amber-800 border-amber-100",
  "bg-rose-50 text-rose-800 border-rose-100",
  "bg-purple-50 text-purple-800 border-purple-100",
  "bg-cyan-50 text-cyan-800 border-cyan-100",
];

export default function EditSchedulePage() {
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [validating, setValidating] = useState(false);
  const [dragging, setDragging] = useState<Schedule | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [editingCell, setEditingCell] = useState<Schedule | null>(null);
  const [newRoom, setNewRoom] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/classgroups").then(r => r.json()),
      fetch("/api/periods").then(r => r.json()),
      fetch("/api/rooms").then(r => r.json()),
    ]).then(([g, p, r]) => {
      setGroups(g); setPeriods(p); setRooms(r);
      if (g.length > 0) setSelectedGroup(g[0].id);
    });
  }, []);

  const loadSchedules = useCallback(async (gid: number) => {
    const res = await fetch(`/api/schedules?classGroupId=${gid}`);
    setSchedules(await res.json());
  }, []);

  useEffect(() => { if (selectedGroup) loadSchedules(selectedGroup); }, [selectedGroup]);

  const validate = async () => {
    setValidating(true);
    const res = await fetch(`/api/validate${selectedGroup ? `?classGroupId=${selectedGroup}` : ""}`);
    const data = await res.json();
    setIssues(data.issues);
    setValidating(false);
  };

  // ย้ายคาบ (drop)
  const handleDrop = async (targetDay: number, targetPeriodId: number) => {
    if (!dragging) return;
    setDragOver(null);
    if (dragging.dayOfWeek === targetDay && dragging.period.id === targetPeriodId) return;

    const res = await fetch(`/api/schedules/${dragging.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayOfWeek: targetDay, periodId: targetPeriodId, roomId: dragging.room.id }),
    });

    if (res.ok) {
      setMsg("✅ ย้ายคาบสำเร็จ");
      if (selectedGroup) loadSchedules(selectedGroup);
      setIssues([]);
    } else {
      const err = await res.json();
      setMsg("❌ " + err.error);
    }
    setDragging(null);
    setTimeout(() => setMsg(""), 3000);
  };

  // แก้ห้องเรียน
  const saveRoomChange = async () => {
    if (!editingCell || !newRoom) return;
    const res = await fetch(`/api/schedules/${editingCell.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayOfWeek: editingCell.dayOfWeek, periodId: editingCell.period.id, roomId: Number(newRoom) }),
    });
    if (res.ok) {
      setMsg("✅ เปลี่ยนห้องเรียนสำเร็จ");
      if (selectedGroup) loadSchedules(selectedGroup);
      setIssues([]);
    } else {
      const err = await res.json();
      setMsg("❌ " + err.error);
    }
    setEditingCell(null);
    setTimeout(() => setMsg(""), 3000);
  };

  // ลบคาบ
  const deleteSlot = async (id: number) => {
    if (!confirm("ลบคาบนี้?")) return;
    await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    setMsg("✅ ลบคาบแล้ว");
    if (selectedGroup) loadSchedules(selectedGroup);
    setIssues([]);
    setTimeout(() => setMsg(""), 3000);
  };

  const teachPeriods = periods.filter(p => !p.isLunch);
  const lunchPeriod = periods.find(p => p.isLunch);

  const subjectColorMap: Record<string, string> = {};
  let ci = 0;
  schedules.forEach(s => { if (!subjectColorMap[s.subject.name]) subjectColorMap[s.subject.name] = COLORS[ci++ % COLORS.length]; });

  const getCell = (day: number, periodId: number) =>
    schedules.find(s => s.dayOfWeek === day && s.period.id === periodId);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">แก้ตารางด้วยมือ</h1>
          <p className="text-gray-500 text-sm mt-1">ลากคาบเพื่อย้าย คลิกเพื่อเปลี่ยนห้อง หรือลบคาบ</p>
        </div>
        <button onClick={validate} disabled={validating}
          className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-40 transition-colors">
          {validating ? "กำลังตรวจ..." : "🔍 ตรวจสอบตาราง"}
        </button>
      </div>

      {/* Validate results */}
      {issues.length > 0 && (
        <div className="mb-5 bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-sm font-medium text-gray-800 mb-3">
            ผลการตรวจสอบ —
            <span className="text-red-600 ml-1">{issues.filter(i => i.type === "error").length} ข้อผิดพลาด</span>
            <span className="text-amber-600 ml-2">{issues.filter(i => i.type === "warning").length} คำเตือน</span>
          </div>
          <div className="space-y-2">
            {issues.map((issue, i) => (
              <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                issue.type === "error" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"
              }`}>
                <span>{issue.type === "error" ? "❌" : "⚠️"}</span>
                <div>
                  <div className="font-medium">{issue.message}</div>
                  {issue.detail && <div className="text-xs opacity-75 mt-0.5">{issue.detail}</div>}
                </div>
              </div>
            ))}
          </div>
          {issues.filter(i => i.type === "error").length === 0 && (
            <div className="mt-2 text-sm text-emerald-700">✅ ไม่มีข้อผิดพลาด มีแค่คำเตือนบางอย่าง</div>
          )}
        </div>
      )}
      {issues.length === 0 && !validating && (
        <div className="mb-5 text-xs text-gray-400">กด "ตรวจสอบตาราง" เพื่อตรวจหาความผิดพลาด</div>
      )}

      {/* Tabs */}
      <div className="mb-4">
        {[1,2,3].map(y => {
          const yGroups = groups.filter(g => g.year === y);
          if (yGroups.length === 0) return null;
          return (
            <div key={y} className="mb-2">
              <div className="text-xs text-gray-400 mb-1">ปวช.{y}</div>
              <div className="flex gap-2 flex-wrap">
                {yGroups.map(g => (
                  <button key={g.id} onClick={() => { setSelectedGroup(g.id); setIssues([]); }}
                    className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${
                      selectedGroup === g.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                    }`}>
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2 rounded-lg border text-sm ${msg.startsWith("✅") ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          {msg}
        </div>
      )}

      <div className="text-xs text-gray-400 mb-2">💡 ลากคาบเพื่อย้าย — คลิกเพื่อเปลี่ยนห้องหรือลบ</div>

      {/* ตาราง */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-xs min-w-[760px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-3 py-3 text-left text-gray-500 font-medium w-20">วัน</th>
              {teachPeriods.map((period, idx) => (
                <>
                  {lunchPeriod && period.periodNo === 5 && idx > 0 && (
                    <th key="lunch" className="px-2 py-3 text-center text-amber-600 font-medium bg-amber-50 w-14">
                      พัก<br/><span className="font-normal text-[10px]">{lunchPeriod.startTime}</span>
                    </th>
                  )}
                  <th key={period.id} className="px-2 py-3 text-center text-gray-500 font-medium">
                    คาบ {period.periodNo}<br/>
                    <span className="font-normal text-[10px] text-gray-400">{period.startTime}</span>
                  </th>
                </>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1,2,3,4,5].map(day => (
              <tr key={day} className="border-b border-gray-50">
                <td className="px-3 py-2 text-gray-700 font-medium bg-gray-50">{DAYS[day]}</td>
                {teachPeriods.map((period, idx) => {
                  const cell = getCell(day, period.id);
                  const dropKey = `${day}-${period.id}`;
                  const isOver = dragOver === dropKey;
                  return (
                    <>
                      {lunchPeriod && period.periodNo === 5 && idx > 0 && (
                        <td key="lunch" className="bg-amber-50/40" />
                      )}
                      <td key={period.id}
                        className={`px-1.5 py-1.5 transition-colors ${isOver ? "bg-indigo-50" : ""}`}
                        onDragOver={e => { e.preventDefault(); setDragOver(dropKey); }}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={() => handleDrop(day, period.id)}>
                        {cell ? (
                          <div
                            draggable={!cell.isLocked}
                            onDragStart={() => setDragging(cell)}
                            onDragEnd={() => { setDragging(null); setDragOver(null); }}
                            className={`rounded-lg px-1.5 py-1.5 border text-center cursor-grab active:cursor-grabbing select-none ${
                              subjectColorMap[cell.subject.name]
                            } ${cell.isLocked ? "opacity-60 cursor-not-allowed" : ""}`}>
                            <div className="font-medium leading-tight text-[11px]">{cell.subject.name}</div>
                            <div className="text-[10px] opacity-70">{cell.room.name}</div>
                            {!cell.isLocked && (
                              <div className="flex justify-center gap-1.5 mt-1">
                                <button onClick={() => { setEditingCell(cell); setNewRoom(String(cell.room.id)); }}
                                  className="text-[10px] underline opacity-60 hover:opacity-100">ห้อง</button>
                                <button onClick={() => deleteSlot(cell.id)}
                                  className="text-[10px] underline opacity-60 hover:opacity-100 text-red-600">ลบ</button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className={`h-12 rounded-lg border border-dashed transition-colors ${isOver ? "border-indigo-400 bg-indigo-50" : "border-gray-200 bg-gray-50"}`} />
                        )}
                      </td>
                    </>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal เปลี่ยนห้องเรียน */}
      {editingCell && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-80 shadow-lg">
            <h3 className="font-medium text-gray-800 mb-1">{editingCell.subject.name}</h3>
            <p className="text-xs text-gray-500 mb-4">คาบ {editingCell.period.periodNo} วัน{DAYS[editingCell.dayOfWeek]}</p>
            <label className="text-xs text-gray-500 mb-1 block">เปลี่ยนห้องเรียน</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
              value={newRoom} onChange={e => setNewRoom(e.target.value)}>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={saveRoomChange}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
                บันทึก
              </button>
              <button onClick={() => setEditingCell(null)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
