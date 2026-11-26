"use client";
import { useEffect, useState } from "react";

interface Subject {
  id: number;
  code: string;
  name: string;
  periodsPerWeek: number;
  isCommon: boolean;
}

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [form, setForm] = useState({ code: "", name: "", periodsPerWeek: "", isCommon: false });
  const [editId, setEditId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => fetch("/api/subjects").then((r) => r.json()).then(setSubjects);
  useEffect(() => { load(); }, []);

  const save = async () => {
    setLoading(true);
    const method = editId ? "PUT" : "POST";
    const url = editId ? `/api/subjects/${editId}` : "/api/subjects";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, periodsPerWeek: Number(form.periodsPerWeek) }),
    });
    setForm({ code: "", name: "", periodsPerWeek: "", isCommon: false });
    setEditId(null); setLoading(false); load();
  };

  const del = async (id: number) => {
    if (!confirm("ลบรายวิชานี้?")) return;
    await fetch(`/api/subjects/${id}`, { method: "DELETE" }); load();
  };

  const edit = (s: Subject) => {
    setEditId(s.id);
    setForm({ code: s.code, name: s.name, periodsPerWeek: String(s.periodsPerWeek), isCommon: s.isCommon });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">รายวิชา</h1>
        <p className="text-gray-500 text-sm mt-1">จัดการรายวิชาและจำนวนคาบต่อสัปดาห์</p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
        <h2 className="font-medium text-gray-700 mb-4">{editId ? "แก้ไขรายวิชา" : "เพิ่มรายวิชา"}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">รหัสวิชา</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="เช่น 20000-1101" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">ชื่อวิชา</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="เช่น ภาษาไทยพื้นฐาน" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">คาบต่อสัปดาห์ (ช.)</label>
            <input type="number" min={1} max={10}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="เช่น 3" value={form.periodsPerWeek}
              onChange={(e) => setForm({ ...form, periodsPerWeek: e.target.value })} />
          </div>
        </div>

        {/* เลือกประเภทวิชา */}
        <div className="mb-4">
          <label className="text-xs text-gray-500 mb-2 block">ประเภทวิชา</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm({ ...form, isCommon: false })}
              className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                !form.isCommon ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
              }`}>
              🔧 วิชาแผนก (เรียนแยกแต่ละกลุ่ม)
            </button>
            <button type="button" onClick={() => setForm({ ...form, isCommon: true })}
              className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                form.isCommon ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-600 border-gray-200 hover:border-amber-300"
              }`}>
              📖 วิชาสามัญ (เรียนรวมกัน)
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={save} disabled={loading || !form.code || !form.name || !form.periodsPerWeek}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {loading ? "กำลังบันทึก..." : editId ? "บันทึก" : "เพิ่มวิชา"}
          </button>
          {editId && (
            <button onClick={() => { setEditId(null); setForm({ code: "", name: "", periodsPerWeek: "", isCommon: false }); }}
              className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
              ยกเลิก
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-gray-500 font-medium">รหัสวิชา</th>
              <th className="text-left px-5 py-3 text-gray-500 font-medium">ชื่อวิชา</th>
              <th className="text-center px-5 py-3 text-gray-500 font-medium">ประเภท</th>
              <th className="text-center px-5 py-3 text-gray-500 font-medium">คาบ/สัปดาห์</th>
              <th className="text-right px-5 py-3 text-gray-500 font-medium">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {subjects.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">ยังไม่มีรายวิชา</td></tr>
            )}
            {subjects.map((s) => (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-mono text-indigo-600 text-xs">{s.code}</td>
                <td className="px-5 py-3 text-gray-800">{s.name}</td>
                <td className="px-5 py-3 text-center">
                  {s.isCommon ? (
                    <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs">สามัญ</span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs">แผนก</span>
                  )}
                </td>
                <td className="px-5 py-3 text-center">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-50 text-gray-700 text-xs font-medium">
                    {s.periodsPerWeek}
                  </span>
                </td>
                <td className="px-5 py-3 text-right space-x-2">
                  <button onClick={() => edit(s)} className="text-xs text-indigo-600 hover:underline">แก้ไข</button>
                  <button onClick={() => del(s.id)} className="text-xs text-red-500 hover:underline">ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
