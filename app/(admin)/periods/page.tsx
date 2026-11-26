"use client";
import { useEffect, useState } from "react";

interface Period { id: number; periodNo: number; startTime: string; endTime: string; isLunch: boolean; }
type PeriodForm = Omit<Period, "id">;

export default function PeriodsPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<PeriodForm | null>(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    const response = await fetch("/api/periods");
    if (!response.ok) throw new Error("โหลดข้อมูลคาบเรียนไม่สำเร็จ");
    setPeriods(await response.json());
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (editId === null || !form) return;
    setMessage("");
    try {
      const response = await fetch(`/api/periods/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "แก้ไขคาบเรียนไม่สำเร็จ");
      setEditId(null);
      setForm(null);
      setMessage("แก้ไขคาบเรียนสำเร็จ");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "แก้ไขคาบเรียนไม่สำเร็จ");
    }
  };

  const remove = async (period: Period) => {
    if (!window.confirm(`ยืนยันลบคาบที่ ${period.periodNo} หรือไม่?`)) return;
    setMessage("");
    try {
      const response = await fetch(`/api/periods/${period.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "ลบคาบเรียนไม่สำเร็จ");
      setMessage("ลบคาบเรียนสำเร็จ");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ลบคาบเรียนไม่สำเร็จ");
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">คาบเวลา</h1>
        <p className="text-gray-500 text-sm mt-1">ตารางคาบเรียนและเวลาพัก</p>
      </div>

      {message && <p role="status" className="mb-4 text-sm text-indigo-700">{message}</p>}

      {form && (
        <div className="mb-5 rounded-xl border border-gray-100 bg-white p-4">
          <h2 className="mb-3 font-medium text-gray-800">แก้ไขคาบเรียน</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm text-gray-600">หมายเลขคาบ
              <input type="number" min="1" value={form.periodNo} onChange={(e) => setForm({ ...form, periodNo: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
            </label>
            <label className="text-sm text-gray-600">เวลาเริ่ม
              <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
            </label>
            <label className="text-sm text-gray-600">เวลาสิ้นสุด
              <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-gray-600">
              <input type="checkbox" checked={form.isLunch} onChange={(e) => setForm({ ...form, isLunch: e.target.checked })} /> พักกลางวัน
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={save} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">บันทึก</button>
            <button onClick={() => { setEditId(null); setForm(null); }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">ยกเลิก</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-center px-5 py-3 text-gray-500 font-medium">คาบที่</th>
              <th className="text-center px-5 py-3 text-gray-500 font-medium">เวลาเริ่ม</th>
              <th className="text-center px-5 py-3 text-gray-500 font-medium">เวลาสิ้นสุด</th>
              <th className="text-center px-5 py-3 text-gray-500 font-medium">ประเภท</th>
              <th className="text-center px-5 py-3 text-gray-500 font-medium">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {periods.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">ยังไม่มีคาบเวลา กรุณารัน seed ก่อน</td></tr>}
            {periods.map((p) => (
              <tr key={p.id} className={`border-b border-gray-50 ${p.isLunch ? "bg-amber-50" : "hover:bg-gray-50"}`}>
                <td className="px-5 py-3 text-center font-medium text-gray-800">
                  {p.isLunch ? "—" : p.periodNo}
                </td>
                <td className="px-5 py-3 text-center text-gray-600">{p.startTime}</td>
                <td className="px-5 py-3 text-center text-gray-600">{p.endTime}</td>
                <td className="px-5 py-3 text-center">
                  {p.isLunch ? (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">พักกลางวัน</span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700">คาบเรียน</span>
                  )}
                </td>
                <td className="px-5 py-3 text-center whitespace-nowrap">
                  <button onClick={() => { setEditId(p.id); setForm({ periodNo: p.periodNo, startTime: p.startTime, endTime: p.endTime, isLunch: p.isLunch }); setMessage(""); }} className="mr-3 text-xs text-indigo-600 hover:underline">แก้ไข</button>
                  <button onClick={() => remove(p)} className="text-xs text-red-500 hover:underline">ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3">คาบที่มีตารางเรียนหรือข้อมูลอื่นอ้างอิงอยู่จะลบไม่ได้</p>
    </div>
  );
}
