"use client";
import { useEffect, useState } from "react";

interface Subject { id: number; code: string; name: string; }
interface Period { id: number; periodNo: number; startTime: string; endTime: string; }
interface TeacherBusy { id: number; dayOfWeek: number; periodId: number; reason?: string; period: Period; }
interface Teacher {
  id: number; code: string; name: string; maxPeriodsPerDay: number;
  teacherSubjects: { subject: Subject }[];
  teacherBusy: TeacherBusy[];
}

const DAY_NAMES = ["", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"];

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [form, setForm] = useState({ code: "", name: "", maxPeriodsPerDay: "4" });
  const [editId, setEditId] = useState<number | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [selectedSubjects, setSelectedSubjects] = useState<number[]>([]);
  const [busyForm, setBusyForm] = useState({ dayOfWeek: "1", periodId: "", reason: "" });

  const load = async () => {
    const [t, s, p] = await Promise.all([
      fetch("/api/teachers").then((r) => r.json()),
      fetch("/api/subjects").then((r) => r.json()),
      fetch("/api/periods").then((r) => r.json()),
    ]);
    setTeachers(t); setSubjects(s);
    setPeriods(p.filter((p: Period & { isLunch: boolean }) => !p.isLunch));
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const method = editId ? "PUT" : "POST";
    const url = editId ? `/api/teachers/${editId}` : "/api/teachers";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, subjectIds: selectedSubjects }),
    });
    const teacher = await res.json();
    if (!editId) {
      // กำหนดวิชาทันทีหลังสร้าง
      if (selectedSubjects.length > 0) {
        await fetch(`/api/teachers/${teacher.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, subjectIds: selectedSubjects }),
        });
      }
    }
    setForm({ code: "", name: "", maxPeriodsPerDay: "4" });
    setSelectedSubjects([]); setEditId(null); load();
  };

  const del = async (id: number) => {
    if (!confirm("ลบครูคนนี้?")) return;
    await fetch(`/api/teachers/${id}`, { method: "DELETE" }); load();
  };

  const openDetail = (t: Teacher) => {
    setSelectedTeacher(t);
    setSelectedSubjects(t.teacherSubjects.map((ts) => ts.subject.id));
  };

  const saveSubjects = async () => {
    if (!selectedTeacher) return;
    await fetch(`/api/teachers/${selectedTeacher.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: selectedTeacher.code,
        name: selectedTeacher.name,
        maxPeriodsPerDay: selectedTeacher.maxPeriodsPerDay,
        subjectIds: selectedSubjects,
      }),
    });
    load();
    alert("บันทึกวิชาแล้ว!");
  };

  const addBusy = async () => {
    if (!selectedTeacher || !busyForm.periodId) return;
    await fetch(`/api/teachers/${selectedTeacher.id}/busy`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(busyForm),
    });
    setBusyForm({ dayOfWeek: "1", periodId: "", reason: "" });
    load();
  };

  const removeBusy = async (busyId: number) => {
    if (!selectedTeacher) return;
    await fetch(`/api/teachers/${selectedTeacher.id}/busy?busyId=${busyId}`, { method: "DELETE" });
    load();
  };

  const toggleSubject = (id: number) => {
    setSelectedSubjects((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">ครูผู้สอน</h1>
        <p className="text-gray-500 text-sm mt-1">จัดการครู วิชาที่สอน และคาบที่ไม่ว่าง</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ซ้าย: ฟอร์มและรายชื่อ */}
        <div>
          <div className="bg-white rounded-xl border border-gray-100 p-5 mb-4">
            <h2 className="font-medium text-gray-700 mb-4">{editId ? "แก้ไขครู" : "เพิ่มครู"}</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">รหัสครู</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="เช่น T001" value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">คาบสอนสูงสุด/วัน</label>
                  <input type="number" min={1} max={8}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    value={form.maxPeriodsPerDay}
                    onChange={(e) => setForm({ ...form, maxPeriodsPerDay: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ชื่อ-นามสกุล</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="เช่น นายสมชาย ใจดี" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              {/* เลือกวิชา */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">วิชาที่สอนได้</label>
                <div className="flex flex-wrap gap-2">
                  {subjects.map((s) => (
                    <button key={s.id} onClick={() => toggleSubject(s.id)}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                        selectedSubjects.includes(s.id)
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                      }`}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={save} disabled={!form.code || !form.name}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                {editId ? "บันทึก" : "เพิ่มครู"}
              </button>
              {editId && (
                <button onClick={() => { setEditId(null); setForm({ code: "", name: "", maxPeriodsPerDay: "4" }); setSelectedSubjects([]); }}
                  className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
                  ยกเลิก
                </button>
              )}
            </div>
          </div>

          {/* รายชื่อครู */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">ครู</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">วิชาที่สอน</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {teachers.length === 0 && (
                  <tr><td colSpan={3} className="text-center py-8 text-gray-400">ยังไม่มีครู</td></tr>
                )}
                {teachers.map((t) => (
                  <tr key={t.id} className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${selectedTeacher?.id === t.id ? "bg-indigo-50" : ""}`}
                    onClick={() => openDetail(t)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800 text-xs">{t.code}</div>
                      <div className="text-gray-600">{t.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {t.teacherSubjects.slice(0, 2).map((ts) => (
                          <span key={ts.subject.id} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs">
                            {ts.subject.name}
                          </span>
                        ))}
                        {t.teacherSubjects.length > 2 && (
                          <span className="text-xs text-gray-400">+{t.teacherSubjects.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => {
                        setEditId(t.id);
                        setForm({ code: t.code, name: t.name, maxPeriodsPerDay: String(t.maxPeriodsPerDay) });
                        setSelectedSubjects(t.teacherSubjects.map((ts) => ts.subject.id));
                      }} className="text-xs text-indigo-600 hover:underline">แก้ไข</button>
                      <button onClick={() => del(t.id)} className="text-xs text-red-500 hover:underline">ลบ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ขวา: รายละเอียดครูที่เลือก */}
        {selectedTeacher && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-medium text-gray-800">{selectedTeacher.name}</h2>
                <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">{selectedTeacher.code}</span>
              </div>

              {/* วิชาที่สอน */}
              <div className="mb-4">
                <label className="text-xs text-gray-500 mb-2 block">วิชาที่สอนได้</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {subjects.map((s) => (
                    <button key={s.id} onClick={() => toggleSubject(s.id)}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                        selectedSubjects.includes(s.id)
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                      }`}>
                      {s.name}
                    </button>
                  ))}
                </div>
                <button onClick={saveSubjects}
                  className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700">
                  บันทึกวิชา
                </button>
              </div>
            </div>

            {/* คาบที่ครูไม่ว่าง */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="font-medium text-gray-700 mb-3">คาบที่ไม่ว่าง</h3>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">วัน</label>
                  <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                    value={busyForm.dayOfWeek}
                    onChange={(e) => setBusyForm({ ...busyForm, dayOfWeek: e.target.value })}>
                    {[1,2,3,4,5].map((d) => (
                      <option key={d} value={d}>{DAY_NAMES[d]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">คาบ</label>
                  <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                    value={busyForm.periodId}
                    onChange={(e) => setBusyForm({ ...busyForm, periodId: e.target.value })}>
                    <option value="">เลือก</option>
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>คาบ {p.periodNo}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">เหตุผล</label>
                  <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                    placeholder="ประชุม..." value={busyForm.reason}
                    onChange={(e) => setBusyForm({ ...busyForm, reason: e.target.value })} />
                </div>
              </div>
              <button onClick={addBusy} disabled={!busyForm.periodId}
                className="px-3 py-1.5 bg-amber-500 text-white text-xs rounded-lg hover:bg-amber-600 disabled:opacity-40 mb-3">
                + เพิ่มคาบไม่ว่าง
              </button>

              <div className="space-y-1">
                {(teachers.find((t) => t.id === selectedTeacher.id)?.teacherBusy ?? []).map((b) => (
                  <div key={b.id} className="flex items-center justify-between px-3 py-1.5 bg-amber-50 rounded-lg">
                    <span className="text-xs text-amber-800">
                      {DAY_NAMES[b.dayOfWeek]} คาบ {b.period.periodNo}
                      {b.reason && <span className="text-amber-600 ml-1">({b.reason})</span>}
                    </span>
                    <button onClick={() => removeBusy(b.id)} className="text-xs text-red-500 hover:underline">ลบ</button>
                  </div>
                ))}
                {(teachers.find((t) => t.id === selectedTeacher.id)?.teacherBusy ?? []).length === 0 && (
                  <p className="text-xs text-gray-400">ไม่มีคาบที่ล็อกไว้</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
