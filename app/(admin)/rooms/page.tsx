"use client";
import { useEffect, useState } from "react";

interface Room { id: number; name: string; capacity: number; }

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [form, setForm] = useState({ name: "", capacity: "40" });
  const [editId, setEditId] = useState<number | null>(null);

  const load = () => fetch("/api/rooms").then((r) => r.json()).then(setRooms);
  useEffect(() => { load(); }, []);

  const save = async () => {
    const method = editId ? "PUT" : "POST";
    const url = editId ? `/api/rooms/${editId}` : "/api/rooms";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({ name: "", capacity: "40" }); setEditId(null); load();
  };

  const del = async (id: number) => {
    if (!confirm("ลบห้องเรียนนี้?")) return;
    await fetch(`/api/rooms/${id}`, { method: "DELETE" }); load();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">ห้องเรียน</h1>
        <p className="text-gray-500 text-sm mt-1">ห้องเรียนฟิสิคอลที่ใช้จัดตาราง</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
        <h2 className="font-medium text-gray-700 mb-4">{editId ? "แก้ไขห้องเรียน" : "เพิ่มห้องเรียน"}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">ชื่อห้อง</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="เช่น ห้อง 101, Lab 1"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">ความจุ (คน)</label>
            <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={save} disabled={!form.name}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {editId ? "บันทึก" : "เพิ่มห้อง"}
          </button>
          {editId && <button onClick={() => { setEditId(null); setForm({ name: "", capacity: "40" }); }}
            className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">ยกเลิก</button>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-gray-500 font-medium">ชื่อห้อง</th>
              <th className="text-center px-5 py-3 text-gray-500 font-medium">ความจุ</th>
              <th className="text-right px-5 py-3 text-gray-500 font-medium">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rooms.length === 0 && <tr><td colSpan={3} className="text-center py-8 text-gray-400">ยังไม่มีห้องเรียน</td></tr>}
            {rooms.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3 text-gray-800">{r.name}</td>
                <td className="px-5 py-3 text-center text-gray-600">{r.capacity} คน</td>
                <td className="px-5 py-3 text-right space-x-2">
                  <button onClick={() => { setEditId(r.id); setForm({ name: r.name, capacity: String(r.capacity) }); }}
                    className="text-xs text-indigo-600 hover:underline">แก้ไข</button>
                  <button onClick={() => del(r.id)} className="text-xs text-red-500 hover:underline">ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
