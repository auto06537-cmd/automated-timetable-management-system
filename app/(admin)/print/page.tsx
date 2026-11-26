"use client";
import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";

interface Period { id: number; periodNo: number; startTime: string; endTime: string; isLunch: boolean; }
interface Schedule {
  id: number; dayOfWeek: number;
  subject: { code: string; name: string; isCommon: boolean };
  room: { name: string };
  period: { id: number; periodNo: number };
  teacher: { name: string } | null;
}
interface SubjectSummary {
  subject: { code: string; name: string; isCommon: boolean };
  total: number;
}
interface ClassGroup { id: number; name: string; year: number; }

const DAYS = ["", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์"];

export default function PrintPage() {
  const params = useSearchParams();
  const classGroupId = params.get("classGroupId");

  const [data, setData] = useState<{ classGroup: ClassGroup; schedules: Schedule[]; periods: Period[]; subjectSummary: SubjectSummary[]; totalPeriods: number } | null>(null);
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string>(classGroupId ?? "");
  const [schoolName, setSchoolName] = useState("วิทยาลัยเทคนิคนครศรีธรรมราช");
  const [semester, setSemester] = useState("1/2569");
  const [studentId, setStudentId] = useState("");
  const [advisorName, setAdvisorName] = useState("");

  useEffect(() => {
    fetch("/api/classgroups").then(r => r.json()).then(setGroups);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    fetch(`/api/print-data?classGroupId=${selectedId}`)
      .then(r => r.json()).then(setData);
  }, [selectedId]);

  const getCell = (day: number, periodId: number) =>
    data?.schedules.find(s => s.dayOfWeek === day && s.period.id === periodId);

  const teachPeriods = data?.periods.filter(p => !p.isLunch) ?? [];
  const lunchPeriod = data?.periods.find(p => p.isLunch);

  const doPrint = () => window.print();

  return (
    <div>
      {/* Controls — ซ่อนตอนพิมพ์ */}
      <div className="print:hidden bg-white border-b border-gray-100 px-6 py-4 flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className="text-xs text-gray-500 block mb-1">ห้องนักเรียน</label>
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={selectedId} onChange={e => setSelectedId(e.target.value)}>
            <option value="">เลือกห้อง</option>
            {[1,2,3].map(y => (
              <optgroup key={y} label={`ปวช.${y}`}>
                {groups.filter(g => g.year === y).map(g => (
                  <option key={g.id} value={String(g.id)}>{g.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">ชื่อสถานศึกษา</label>
          <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64"
            value={schoolName} onChange={e => setSchoolName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">ภาคเรียนที่</label>
          <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-24"
            value={semester} onChange={e => setSemester(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">รหัสประจำตัว</label>
          <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36"
            placeholder="ไม่บังคับ" value={studentId} onChange={e => setStudentId(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">ครูที่ปรึกษา</label>
          <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-48"
            placeholder="ไม่บังคับ" value={advisorName} onChange={e => setAdvisorName(e.target.value)} />
        </div>
        <button onClick={doPrint} disabled={!data}
          className="px-6 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
          🖨️ พิมพ์ / บันทึก PDF
        </button>
      </div>

      {!data && (
        <div className="print:hidden text-center py-16 text-gray-400">เลือกห้องนักเรียนเพื่อดูตัวอย่างก่อนพิมพ์</div>
      )}

      {data && (
        <div id="print-area" className="print-area bg-white mx-auto"
          style={{ width: "297mm", minHeight: "210mm", padding: "8mm 10mm", fontFamily: "TH SarabunPSK, Sarabun, sans-serif", fontSize: "11pt" }}>

          {/* ===== หัวตาราง ===== */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "4px" }}>
            <tbody>
              <tr>
                {/* ซ้าย: ข้อมูลโรงเรียน */}
                <td style={{ width: "30%", verticalAlign: "top", border: "1px solid #000", padding: "4px 6px" }}>
                  <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "13pt" }}>{schoolName}</div>
                  <div style={{ marginTop: "4px", fontSize: "10pt" }}>
                    <div>ภาคเรียนที่ <strong>{semester}</strong></div>
                    {studentId && <div>รหัสประจำตัว {studentId}</div>}
                    <div>ห้อง-กลุ่ม <strong>{data.classGroup.name}</strong></div>
                    {advisorName && <div>ครูที่ปรึกษา {advisorName}</div>}
                  </div>
                </td>

                {/* กลาง: ตารางวิชา (ซ้าย) */}
                <td style={{ width: "35%", border: "1px solid #000", padding: 0, verticalAlign: "top" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
                    <thead>
                      <tr style={{ background: "#f0f0f0" }}>
                        <th style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>รหัสวิชา</th>
                        <th style={{ border: "1px solid #000", padding: "2px 4px" }}>ชื่อรายวิชา</th>
                        <th style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center", width: "20px" }}>ท.</th>
                        <th style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center", width: "20px" }}>ป.</th>
                        <th style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center", width: "20px" }}>น.</th>
                        <th style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center", width: "25px" }}>ช.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.subjectSummary.slice(0, Math.ceil(data.subjectSummary.length / 2)).map((s, i) => (
                        <tr key={i}>
                          <td style={{ border: "1px solid #000", padding: "1px 4px", textAlign: "center", fontSize: "8pt" }}>{s.subject.code}</td>
                          <td style={{ border: "1px solid #000", padding: "1px 4px" }}>{s.subject.name}</td>
                          <td style={{ border: "1px solid #000", padding: "1px 4px", textAlign: "center" }}></td>
                          <td style={{ border: "1px solid #000", padding: "1px 4px", textAlign: "center" }}></td>
                          <td style={{ border: "1px solid #000", padding: "1px 4px", textAlign: "center" }}></td>
                          <td style={{ border: "1px solid #000", padding: "1px 4px", textAlign: "center", fontWeight: "bold" }}>{s.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>

                {/* ขวา: ตารางวิชา (ขวา) */}
                <td style={{ width: "35%", border: "1px solid #000", padding: 0, verticalAlign: "top" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
                    <thead>
                      <tr style={{ background: "#f0f0f0" }}>
                        <th style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>รหัสวิชา</th>
                        <th style={{ border: "1px solid #000", padding: "2px 4px" }}>ชื่อรายวิชา</th>
                        <th style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center", width: "20px" }}>ท.</th>
                        <th style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center", width: "20px" }}>ป.</th>
                        <th style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center", width: "20px" }}>น.</th>
                        <th style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center", width: "25px" }}>ช.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.subjectSummary.slice(Math.ceil(data.subjectSummary.length / 2)).map((s, i) => (
                        <tr key={i}>
                          <td style={{ border: "1px solid #000", padding: "1px 4px", textAlign: "center", fontSize: "8pt" }}>{s.subject.code}</td>
                          <td style={{ border: "1px solid #000", padding: "1px 4px" }}>{s.subject.name}</td>
                          <td style={{ border: "1px solid #000", padding: "1px 4px", textAlign: "center" }}></td>
                          <td style={{ border: "1px solid #000", padding: "1px 4px", textAlign: "center" }}></td>
                          <td style={{ border: "1px solid #000", padding: "1px 4px", textAlign: "center" }}></td>
                          <td style={{ border: "1px solid #000", padding: "1px 4px", textAlign: "center", fontWeight: "bold" }}>{s.total}</td>
                        </tr>
                      ))}
                      {/* แถว รวม */}
                      <tr>
                        <td colSpan={5} style={{ border: "1px solid #000", padding: "1px 4px", textAlign: "right", fontWeight: "bold" }}>รวม</td>
                        <td style={{ border: "1px solid #000", padding: "1px 4px", textAlign: "center", fontWeight: "bold" }}>{data.totalPeriods}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* ===== ตารางเรียน ===== */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
            <thead>
              {/* แถวเวลา */}
              <tr>
                <th style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center", width: "60px" }}>เวลา</th>
                {teachPeriods.map((p, idx) => (
                  <>
                    {lunchPeriod && p.periodNo === 5 && idx > 0 && (
                      <th key="lunch-time" style={{ border: "1px solid #000", padding: "2px 2px", textAlign: "center", width: "40px", fontSize: "8pt", background: "#fffbeb" }}>
                        {lunchPeriod.startTime}<br/>–<br/>{lunchPeriod.endTime}
                      </th>
                    )}
                    <th key={p.id} style={{ border: "1px solid #000", padding: "2px 3px", textAlign: "center" }}>
                      {p.startTime} – {p.endTime}
                    </th>
                  </>
                ))}
              </tr>
              {/* แถวคาบ */}
              <tr>
                <th style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>วัน/คาบ</th>
                {teachPeriods.map((p, idx) => (
                  <>
                    {lunchPeriod && p.periodNo === 5 && idx > 0 && (
                      <th key="lunch-period" style={{ border: "1px solid #000", padding: "2px", textAlign: "center", fontSize: "8pt", background: "#fffbeb" }}>พัก</th>
                    )}
                    <th key={p.id} style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>{p.periodNo}</th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1,2,3,4,5].map(day => (
                <tr key={day}>
                  <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center", fontWeight: "bold", background: "#f9f9f9", width: "60px" }}>
                    {DAYS[day]}
                  </td>
                  {teachPeriods.map((p, idx) => {
                    const cell = getCell(day, p.id);
                    return (
                      <>
                        {lunchPeriod && p.periodNo === 5 && idx > 0 && (
                          <td key="lunch-cell" style={{ border: "1px solid #000", background: "#fffbeb" }} />
                        )}
                        <td key={p.id} style={{ border: "1px solid #000", padding: "2px 3px", textAlign: "center", verticalAlign: "middle", minHeight: "40px", height: "40px" }}>
                          {cell && (
                            <>
                              <div style={{ fontWeight: "bold", fontSize: "9pt" }}>{cell.subject.code}</div>
                              <div style={{ fontSize: "8pt" }}>{cell.room.name}</div>
                              {cell.teacher && <div style={{ fontSize: "7pt", color: "#555" }}>{cell.teacher.name.split(" ")[0]}</div>}
                            </>
                          )}
                          {!cell && day === 1 && p.periodNo === 1 && (
                            <div style={{ fontSize: "7pt", color: "#aaa" }}>กิจกรรม<br/>หน้าเสาธง</div>
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
      )}

      {/* CSS สำหรับพิมพ์ */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; }
          @page { size: A4 landscape; margin: 5mm; }
        }
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
      `}</style>
    </div>
  );
}
