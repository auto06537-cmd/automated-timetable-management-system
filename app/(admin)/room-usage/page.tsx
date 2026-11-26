"use client";
import { useEffect, useState } from "react";

interface Room { id: number; name: string; capacity: number; }
interface Period { id: number; periodNo: number; startTime: string; endTime: string; }
interface UsageCell { subject: string; classGroup: string; }
interface Summary { roomId: number; roomName: string; used: number; total: number; percent: number; }

const DAY_NAMES = ["", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"];

export default function RoomUsagePage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [usage, setUsage] = useState<Record<number, Record<string, UsageCell>>>({});
  const [summary, setSummary] = useState<Summary[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/room-usage").then((r) => r.json()).then((data) => {
      setRooms(data.rooms);
      setPeriods(data.periods);
      setUsage(data.usage);
      setSummary(data.summary);
      if (data.rooms.length > 0) setSelectedRoom(data.rooms[0].id);
      setLoading(false);
    });
  }, []);

  const getCell = (roomId: number, day: number, periodId: number) =>
    usage[roomId]?.[`${day}-${periodId}`];

  const room = rooms.find((r) => r.id === selectedRoom);
  const roomSummary = summary.find((s) => s.roomId === selectedRoom);

  if (loading) {
    return <div className="text-center py-12 text-gray-400">กำลังโหลด...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">การใช้ห้องเรียน</h1>
        <p className="text-gray-500 text-sm mt-1">ดูว่าห้องไหนว่างหรือไม่ว่างในแต่ละคาบ</p>
      </div>

      {/* สรุปทุกห้อง */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {summary.map((s) => (
          <button key={s.roomId} onClick={() => setSelectedRoom(s.roomId)}
            className={`text-left bg-white rounded-xl border p-4 transition-colors ${
              selectedRoom === s.roomId ? "border-indigo-300 ring-1 ring-indigo-200" : "border-gray-100 hover:border-gray-200"
            }`}>
            <div className="text-sm font-medium text-gray-800 mb-2">{s.roomName}</div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${
                  s.percent >= 80 ? "bg-red-400" : s.percent >= 50 ? "bg-amber-400" : "bg-emerald-400"
                }`} style={{ width: `${s.percent}%` }} />
              </div>
              <span className="text-xs text-gray-500 w-9 text-right">{s.percent}%</span>
            </div>
            <div className="text-xs text-gray-400">{s.used}/{s.total} คาบ</div>
          </button>
        ))}
      </div>

      {/* รายละเอียดห้องที่เลือก */}
      {room && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-gray-800">{room.name}</h2>
            <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
              ใช้งาน {roomSummary?.percent ?? 0}%
            </span>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-3 text-left text-gray-500 font-medium w-20">วัน</th>
                  {periods.map((p) => (
                    <th key={p.id} className="px-2 py-3 text-center text-gray-500 font-medium">
                      คาบ {p.periodNo}<br/>
                      <span className="font-normal text-[10px] text-gray-400">{p.startTime}-{p.endTime}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((day) => (
                  <tr key={day} className="border-b border-gray-50">
                    <td className="px-3 py-2 text-gray-700 font-medium bg-gray-50">{DAY_NAMES[day]}</td>
                    {periods.map((p) => {
                      const cell = getCell(room.id, day, p.id);
                      return (
                        <td key={p.id} className="px-1.5 py-1.5">
                          {cell ? (
                            <div className="rounded-lg px-1.5 py-2 border bg-rose-50 border-rose-100 text-center">
                              <div className="font-medium text-rose-800 leading-tight">{cell.subject}</div>
                              <div className="text-[10px] text-rose-600 opacity-80 mt-0.5">{cell.classGroup}</div>
                            </div>
                          ) : (
                            <div className="h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 text-[10px]">
                              ว่าง
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-100 inline-block" /> ว่าง
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 rounded bg-rose-50 border border-rose-100 inline-block" /> ไม่ว่าง
            </div>
          </div>
        </>
      )}

      {rooms.length === 0 && (
        <div className="text-center py-12 text-gray-400">ยังไม่มีห้องเรียน</div>
      )}
    </div>
  );
}
