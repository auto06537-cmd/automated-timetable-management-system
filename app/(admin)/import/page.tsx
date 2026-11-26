"use client";
import { useState, useRef } from "react";
import * as XLSX from "xlsx";

type ImportType = "subjects" | "classgroups" | "rooms" | "teachers";

interface Template {
  type: ImportType;
  label: string;
  icon: string;
  columns: string[];
  example: Record<string, string>[];
  notes: string[];
}

const TEMPLATES: Template[] = [
  {
    type: "subjects",
    label: "รายวิชา",
    icon: "📚",
    columns: ["code", "name", "periodsPerWeek", "isCommon"],
    example: [
      { code: "20000-1101", name: "ภาษาไทยพื้นฐาน", periodsPerWeek: "2", isCommon: "สามัญ" },
      { code: "21901-2007", name: "เทคโนโลยีระบบสมองกล", periodsPerWeek: "3", isCommon: "แผนก" },
    ],
    notes: ["isCommon ใส่ สามัญ หรือ แผนก", "ถ้ารหัสซ้ำจะอัปเดตข้อมูลแทน"],
  },
  {
    type: "classgroups",
    label: "ห้องนักเรียน",
    icon: "👥",
    columns: ["name", "year", "pairKey", "maxEndPeriod"],
    example: [
      { name: "1ชทส1", year: "1", pairKey: "1A", maxEndPeriod: "8" },
      { name: "1ชทส2", year: "1", pairKey: "1A", maxEndPeriod: "8" },
      { name: "2ชทส1", year: "2", pairKey: "2A", maxEndPeriod: "8" },
    ],
    notes: ["pairKey คู่เดียวกัน = เรียนวิชาสามัญพร้อมกัน", "maxEndPeriod ปล่อยว่างได้ถ้าไม่จำกัด"],
  },
  {
    type: "rooms",
    label: "ห้องเรียน",
    icon: "🚪",
    columns: ["name", "capacity"],
    example: [
      { name: "ห้อง 101", capacity: "40" },
      { name: "Lab คอม 1", capacity: "30" },
    ],
    notes: ["capacity คือจำนวนที่นั่ง (ไม่บังคับ ค่าเริ่มต้น 40)"],
  },
  {
    type: "teachers",
    label: "ครูผู้สอน",
    icon: "🧑‍🏫",
    columns: ["code", "name", "maxPeriodsPerDay", "subjectCodes"],
    example: [
      { code: "T001", name: "นายสมชาย ใจดี", maxPeriodsPerDay: "4", subjectCodes: "20000-1101,20000-1201" },
      { code: "T002", name: "นางสาววิภา รักงาน", maxPeriodsPerDay: "4", subjectCodes: "21901-2007" },
    ],
    notes: ["subjectCodes คั่นด้วย , (ต้องเพิ่มวิชาก่อน)", "maxPeriodsPerDay คาบสูงสุดต่อวัน"],
  },
];

export default function ImportPage() {
  const [selectedType, setSelectedType] = useState<ImportType>("subjects");
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: number; error: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const template = TEMPLATES.find((t) => t.type === selectedType)!;

  // ดาวน์โหลด template Excel
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const wsData = [template.columns, ...template.example.map((r) => template.columns.map((c) => r[c] ?? ""))];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    // ปรับความกว้างคอลัมน์
    ws["!cols"] = template.columns.map(() => ({ wch: 25 }));
    XLSX.utils.book_append_sheet(wb, ws, "data");
    XLSX.writeFile(wb, `template_${selectedType}.xlsx`);
  };

  // อ่านไฟล์ Excel
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
      setPreview(rows.slice(0, 5));
    };
    reader.readAsArrayBuffer(file);
  };

  // นำเข้าข้อมูล
  const doImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setLoading(true); setResult(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: selectedType, rows }),
      });
      const result = await res.json();
      setResult(result);
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">นำเข้าข้อมูล</h1>
        <p className="text-gray-500 text-sm mt-1">อัปโหลดไฟล์ Excel เพื่อนำเข้าข้อมูลจำนวนมากได้เลย</p>
      </div>

      {/* เลือกประเภทข้อมูล */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {TEMPLATES.map((t) => (
          <button key={t.type} onClick={() => { setSelectedType(t.type); setPreview([]); setFileName(""); setResult(null); if (fileRef.current) fileRef.current.value = ""; }}
            className={`p-4 rounded-xl border text-left transition-colors ${
              selectedType === t.type ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200" : "border-gray-100 bg-white hover:border-gray-200"
            }`}>
            <div className="text-2xl mb-2">{t.icon}</div>
            <div className="text-sm font-medium text-gray-800">{t.label}</div>
            <div className="text-xs text-gray-400 mt-0.5">{t.columns.length} คอลัมน์</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ซ้าย: คำแนะนำ + ดาวน์โหลด template */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="font-medium text-gray-800 mb-3">📋 {template.label}</h2>
            <div className="mb-4">
              <div className="text-xs text-gray-500 mb-2">คอลัมน์ที่ต้องมี</div>
              <div className="flex flex-wrap gap-1.5">
                {template.columns.map((c) => (
                  <span key={c} className="px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs font-mono text-gray-700">{c}</span>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <div className="text-xs text-gray-500 mb-2">หมายเหตุ</div>
              <ul className="space-y-1">
                {template.notes.map((n, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <span className="text-indigo-400 mt-0.5">•</span> {n}
                  </li>
                ))}
              </ul>
            </div>
            <button onClick={downloadTemplate}
              className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors text-center">
              ⬇️ ดาวน์โหลด Template Excel
            </button>
          </div>

          {/* ตัวอย่างข้อมูล */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-3">ตัวอย่างข้อมูลใน Template</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {template.columns.map((c) => (
                      <th key={c} className="px-2 py-2 text-left text-gray-500 font-medium whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {template.example.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {template.columns.map((c) => (
                        <td key={c} className="px-2 py-2 text-gray-700 whitespace-nowrap">{row[c] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ขวา: อัปโหลดไฟล์ */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="font-medium text-gray-800 mb-4">อัปโหลดไฟล์</h2>

            {/* Drop zone */}
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors mb-4"
              onClick={() => fileRef.current?.click()}>
              <div className="text-3xl mb-2">📂</div>
              <div className="text-sm font-medium text-gray-700">คลิกเพื่อเลือกไฟล์</div>
              <div className="text-xs text-gray-400 mt-1">รองรับ .xlsx, .xls, .csv</div>
              {fileName && <div className="mt-2 text-xs text-indigo-600 font-medium">{fileName}</div>}
            </div>

            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />

            {/* Preview */}
            {preview.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-gray-500 mb-2">ตัวอย่างข้อมูลที่จะนำเข้า (5 แถวแรก)</div>
                <div className="overflow-x-auto border border-gray-100 rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {Object.keys(preview[0]).map((k) => (
                          <th key={k} className="px-2 py-1.5 text-left text-gray-500 font-medium whitespace-nowrap">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          {Object.values(row).map((v, j) => (
                            <td key={j} className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{String(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <button onClick={doImport} disabled={!fileName || loading}
              className="w-full px-4 py-2.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors">
              {loading ? "กำลังนำเข้า..." : "🚀 นำเข้าข้อมูล"}
            </button>
          </div>

          {/* ผลลัพธ์ */}
          {result && (
            <div className={`bg-white rounded-xl border p-5 ${result.error > 0 ? "border-amber-200" : "border-emerald-200"}`}>
              <div className="text-sm font-medium text-gray-800 mb-3">ผลการนำเข้า</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-semibold text-emerald-700">{result.success}</div>
                  <div className="text-xs text-emerald-600">สำเร็จ</div>
                </div>
                <div className={`rounded-lg p-3 text-center ${result.error > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                  <div className={`text-2xl font-semibold ${result.error > 0 ? "text-red-700" : "text-gray-400"}`}>{result.error}</div>
                  <div className={`text-xs ${result.error > 0 ? "text-red-600" : "text-gray-400"}`}>ผิดพลาด</div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="text-xs text-red-700 font-medium mb-1">รายการที่มีปัญหา</div>
                  {result.errors.map((e, i) => (
                    <div key={i} className="text-xs text-red-600 mt-0.5">{e}</div>
                  ))}
                </div>
              )}
              {result.error === 0 && (
                <div className="text-xs text-emerald-600 text-center">✅ นำเข้าข้อมูลทั้งหมดสำเร็จ!</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
