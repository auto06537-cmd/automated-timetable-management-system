"use client";
import { useEffect, useState } from "react";

interface ClassGroup { id: number; name: string; year: number; pairKey: string | null; maxEndPeriod: number | null; }

export default function ClassGroupsPage() {
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [form, setForm] = useState({ name: "", year: "1", pairKey: "", maxEndPeriod: "" });
  const [editId, setEditId] = useState<number | null>(null);

  const load = () => fetch("/api/classgroups").then((r) => r.json()).then(setGroups);
  useEffect(() => { load(); }, []);

  const save = async () => {
    const method = editId ? "PUT" : "POST";
    const url = editId ? `/api/classgroups/${editId}` : "/api/classgroups";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({ name: "", year: "1", pairKey: "", maxEndPeriod: "" }); setEditId(null); load();
  };

  const del = async (id: number) => {
    if (!confirm("ลบห้องนักเรียนนี้?")) return;
    await fetch(`/api/classgroups/${id}`, { method: "DELETE" }); load();
  };

  // จัดกลุ่มตามชั้นปี เพื่อแสดงผล
  const grouped = groups.reduce((acc, g) => {
    if (!acc[g.year]) acc[g.year] = [];
    acc[g.year].push(g);
    return acc;
  }, {} as Record<number, ClassGroup[]>);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">ห้องนักเรียน</h1>
        <p className="text-gray-500 text-sm mt-1">จัดการห้องนักเรียนแต่ละชั้นปี เช่น ปวช.1, ปวช.2, ปวช.3</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
        <h2 className="font-medium text-gray-700 mb-4">{editId ? "แก้ไข" : "เพิ่มห้องนักเรียน"}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">ชื่อห้อง</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="เช่น 1ชทส1" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">ชั้นปี</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}>
              <option value="1">ปวช.1</option>
              <option value="2">ปวช.2</option>
              <option value="3">ปวช.3</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">รหัสคู่เรียนสามัญ</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="เช่น 1A" value={form.pairKey}
              onChange={(e) => setForm({ ...form, pairKey: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">คาบสุดท้ายสูงสุด</label>
            <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="เช่น 8" value={form.maxEndPeriod}
              onChange={(e) => setForm({ ...form, maxEndPeriod: e.target.value })} />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          💡 ห้องที่ใส่ "รหัสคู่เรียนสามัญ" เหมือนกัน จะเรียนวิชาสามัญพร้อมกันในคาบเดียว เช่น 1ชทส1 กับ 1ชทส2 ใส่ "1A" เหมือนกัน
        </p>
        <div className="flex gap-2 mt-4">
          <button onClick={save} disabled={!form.name}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {editId ? "บันทึก" : "เพิ่มห้อง"}
          </button>
          {editId && <button onClick={() => { setEditId(null); setForm({ name: "", year: "1", pairKey: "", maxEndPeriod: "" }); }}
            className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">ยกเลิก</button>}
        </div>
      </div>

      {/* แสดงเป็นกลุ่มตามชั้นปี */}
      {Object.keys(grouped).sort().map((year) => (
        <div key={year} className="mb-5">
          <h3 className="text-sm font-medium text-gray-600 mb-2">ปวช.{year}</h3>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-2.5 text-gray-500 font-medium">ชื่อห้อง</th>
                  <th className="text-center px-5 py-2.5 text-gray-500 font-medium">รหัสคู่เรียนสามัญ</th>
                  <th className="text-center px-5 py-2.5 text-gray-500 font-medium">คาบสุดท้ายสูงสุด</th>
                  <th className="text-right px-5 py-2.5 text-gray-500 font-medium">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {grouped[Number(year)].map((g) => (
                  <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-2.5 text-gray-800 font-medium">{g.name}</td>
                    <td className="px-5 py-2.5 text-center text-gray-500">
                      {g.pairKey ? <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">{g.pairKey}</span> : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-center text-gray-500">
                      {g.maxEndPeriod ? `คาบที่ ${g.maxEndPeriod}` : "ไม่จำกัด"}
                    </td>
                    <td className="px-5 py-2.5 text-right space-x-2">
                      <button onClick={() => { setEditId(g.id); setForm({ name: g.name, year: String(g.year), pairKey: g.pairKey ?? "", maxEndPeriod: String(g.maxEndPeriod ?? "") }); }}
                        className="text-xs text-indigo-600 hover:underline">แก้ไข</button>
                      <button onClick={() => del(g.id)} className="text-xs text-red-500 hover:underline">ลบ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {groups.length === 0 && (
        <div className="text-center py-12 text-gray-400">ยังไม่มีห้องนักเรียน</div>
      )}
    </div>
  );
}
