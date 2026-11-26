"use client";
import { useEffect, useState } from "react";

interface ClassGroup { id: number; name: string; }
interface Subject { id: number; code: string; name: string; }
interface Period { id: number; periodNo: number; startTime: string; endTime: string; isLunch: boolean; }
interface LockedSlot { id: number; dayOfWeek: number; label: string; period: Period; subject?: Subject | null; }

const DAY_NAMES = ["", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"];

export default function LockedSlotsPage() {
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [slots, setSlots] = useState<LockedSlot[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [form, setForm] = useState({ dayOfWeek: "1", periodId: "", subjectId: "", label: "" });
  const [applyAll, setApplyAll] = useState(false);

  const load = async (groupId: number) => {
    const res = await fetch(`/api/locked-slots?classGroupId=${groupId}`);
    setSlots(await res.json());
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/classgroups").then(r => r.json()),
      fetch("/api/subjects").then(r => r.json()),
      fetch("/api/periods").then(r => r.json()),
    ]).then(([g, s, p]) => {
      setGroups(g); setSubjects(s);
      setPeriods(p.filter((x: Period) => !x.isLunch));
      if (g.length > 0) { setSelectedGroup(g[0].id); load(g[0].id); }
    });
  }, []);

  const save = async () => {
    if (!selectedGroup || !form.periodId || !form.label) return;
    const body = { classGroupId: selectedGroup, periodId: Number(form.periodId),
      dayOfWeek: Number(form.dayOfWeek), label: form.label,
      subjectId: form.subjectId ? Number(form.subjectId) : null };

    if (applyAll) {
      // ล็อกทุกกลุ่มพร้อมกัน
      for (const g of groups) {
        await fetch("/api/locked-slots", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, classGroupId: g.id }) });
      }
    } else {
      await fetch("/api/locked-slots", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body) });
    }
    setForm({ dayOfWeek: "1", periodId: "", subjectId: "", label: "" });
    load(selectedGroup);
  };

  const del = async (id: number) => {
    await fetch(`/api/locked-slots?id=${id}`, { method: "DELETE" });
    if (selectedGroup) load(selectedGroup);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">ล็อกคาบ</h1>
        <p className="text-gray-500 text-sm mt-1">กำหนดคาบที่ไม่ให้ระบบจัดตาราง เช่น วิชาสามัญ กิจกรรม โฮมรูม</p>
      </div>

      {/* ฟอร์มล็อกคาบ */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
        <h2 className="font-medium text-gray-700 mb-4">เพิ่มคาบล็อก</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">วัน</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={form.dayOfWeek} onChange={e => setForm({ ...form, dayOfWeek: e.target.value })}>
              {[1,2,3,4,5].map(d => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">คาบ</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={form.periodId} onChange={e => setForm({ ...form, periodId: e.target.value })}>
              <option value="">เลือก</option>
              {periods.map(p => <option key={p.id} value={p.id}>คาบ {p.periodNo} ({p.startTime})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">วิชา (ไม่บังคับ)</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={form.subjectId} onChange={e => setForm({ ...form, subjectId: e.target.value })}>
              <option value="">ไม่ระบุ</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">ชื่อกิจกรรม</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="เช่น กิจกรรม, โฮมรูม" value={form.label}
              onChange={e => setForm({ ...form, label: e.target.value })} />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={applyAll} onChange={e => setApplyAll(e.target.checked)}
              className="rounded" />
            ล็อกพร้อมกันทุกห้อง
          </label>
          <button onClick={save} disabled={!form.periodId || !form.label}
            className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-40 transition-colors">
            + ล็อกคาบ
          </button>
        </div>
      </div>

      {/* Tabs ห้อง */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {groups.map(g => (
          <button key={g.id} onClick={() => { setSelectedGroup(g.id); load(g.id); }}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors border ${
              selectedGroup === g.id ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"}`}>
            {g.name}
          </button>
        ))}
      </div>

      {/* รายการคาบล็อก */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-gray-500 font-medium">วัน</th>
              <th className="text-left px-5 py-3 text-gray-500 font-medium">คาบ / เวลา</th>
              <th className="text-left px-5 py-3 text-gray-500 font-medium">กิจกรรม</th>
              <th className="text-left px-5 py-3 text-gray-500 font-medium">วิชา</th>
              <th className="text-right px-5 py-3 text-gray-500 font-medium">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {slots.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">ยังไม่มีคาบล็อก</td></tr>
            )}
            {slots.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period.periodNo - b.period.periodNo).map(s => (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3 text-gray-700">{DAY_NAMES[s.dayOfWeek]}</td>
                <td className="px-5 py-3 text-gray-600">
                  คาบ {s.period.periodNo} ({s.period.startTime}–{s.period.endTime})
                </td>
                <td className="px-5 py-3">
                  <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs">{s.label}</span>
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs">{s.subject?.name ?? "—"}</td>
                <td className="px-5 py-3 text-right">
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
