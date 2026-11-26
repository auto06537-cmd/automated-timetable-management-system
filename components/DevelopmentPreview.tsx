"use client";

import { useState } from "react";

type PreviewPage =
  | "dashboard" | "schedules" | "edit-schedule" | "year-overview"
  | "teacher-schedule" | "room-usage" | "subjects" | "rooms"
  | "classgroups" | "teachers" | "locked-slots" | "import"
  | "print" | "periods";

const navigation: { id: PreviewPage; icon: string; label: string }[] = [
  { id: "dashboard", icon: "📊", label: "ภาพรวม" },
  { id: "schedules", icon: "📅", label: "ตารางเรียน" },
  { id: "edit-schedule", icon: "✏️", label: "แก้ตารางด้วยมือ" },
  { id: "year-overview", icon: "📈", label: "ภาพรวมรายชั้นปี" },
  { id: "teacher-schedule", icon: "📋", label: "ตารางสอนครู" },
  { id: "room-usage", icon: "🏢", label: "การใช้ห้องเรียน" },
  { id: "subjects", icon: "📚", label: "รายวิชา" },
  { id: "rooms", icon: "🚪", label: "ห้องเรียน" },
  { id: "classgroups", icon: "👥", label: "ห้องนักเรียน" },
  { id: "teachers", icon: "🧑‍🏫", label: "ครูผู้สอน" },
  { id: "locked-slots", icon: "🔒", label: "ล็อกคาบ" },
  { id: "import", icon: "📥", label: "นำเข้าข้อมูล" },
  { id: "print", icon: "🖨️", label: "พิมพ์ตาราง" },
  { id: "periods", icon: "⏰", label: "คาบเวลา" },
];

const groups = [
  { name: "ปวช.1/1", year: "ปวช.1", students: 28 },
  { name: "ปวช.1/2", year: "ปวช.1", students: 26 },
  { name: "ปวช.2/1", year: "ปวช.2", students: 25 },
  { name: "ปวช.3/1", year: "ปวช.3", students: 23 },
];

const subjects = [
  ["ทส.1001", "พื้นฐานเทคโนโลยีสารสนเทศ", "3 คาบ/สัปดาห์", "ปวช.1"],
  ["ทส.2002", "การออกแบบฐานข้อมูล", "4 คาบ/สัปดาห์", "ปวช.2"],
  ["ทส.3003", "โครงงานเทคโนโลยี", "3 คาบ/สัปดาห์", "ปวช.3"],
  ["สท.1004", "การสื่อสารภาษาไทย", "2 คาบ/สัปดาห์", "ทุกระดับ"],
];

const teachers = [
  ["ครูตัวอย่าง 01", "ทส.1001, ทส.2002", "4 คาบ"],
  ["ครูตัวอย่าง 02", "ทส.3003", "5 คาบ"],
  ["ครูตัวอย่าง 03", "สท.1004", "4 คาบ"],
];

const rooms = [
  ["ห้องเรียน 101", "ห้องบรรยาย", "32 ที่นั่ง", "พร้อมใช้งาน"],
  ["ห้องปฏิบัติการ 201", "ห้องคอมพิวเตอร์", "30 ที่นั่ง", "พร้อมใช้งาน"],
  ["ห้องปฏิบัติการ 202", "ห้องคอมพิวเตอร์", "28 ที่นั่ง", "พร้อมใช้งาน"],
];

const periods = [
  ["1", "08:00", "09:00", "เรียน"],
  ["2", "09:00", "10:00", "เรียน"],
  ["3", "10:00", "11:00", "เรียน"],
  ["4", "11:00", "12:00", "เรียน"],
  ["พัก", "12:00", "13:00", "พักกลางวัน"],
  ["5", "13:00", "14:00", "เรียน"],
  ["6", "14:00", "15:00", "เรียน"],
];

const scheduleRows = [
  ["จันทร์", "1", "พื้นฐานเทคโนโลยีสารสนเทศ", "ห้องปฏิบัติการ 201", "ครูตัวอย่าง 01"],
  ["จันทร์", "2", "การสื่อสารภาษาไทย", "ห้องเรียน 101", "ครูตัวอย่าง 03"],
  ["อังคาร", "3", "การออกแบบฐานข้อมูล", "ห้องปฏิบัติการ 202", "ครูตัวอย่าง 01"],
  ["พุธ", "5", "โครงงานเทคโนโลยี", "ห้องปฏิบัติการ 201", "ครูตัวอย่าง 02"],
  ["ศุกร์", "2", "พื้นฐานเทคโนโลยีสารสนเทศ", "ห้องปฏิบัติการ 201", "ครูตัวอย่าง 01"],
];

function PageHeading({ title, description }: { title: string; description: string }) {
  return <div className="mb-6"><h1 className="text-2xl font-semibold text-gray-800">{title}</h1><p className="mt-1 text-sm text-gray-500">{description}</p></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="mb-4 font-medium text-gray-800">{title}</h2>{children}</section>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{children}</p>;
}

function DisabledAction({ label, explanation }: { label: string; explanation: string }) {
  return <div className="inline-flex flex-col items-start gap-1"><button type="button" disabled title={explanation} className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-400">{label}</button><span className="text-xs text-gray-500">{explanation}</span></div>;
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-gray-100 text-xs text-gray-500">{headers.map((header) => <th key={header} className="px-3 py-3 font-medium">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${String(row[0])}-${index}`} className="border-b border-gray-50 last:border-0">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3 text-gray-700">{cell}</td>)}</tr>)}</tbody></table></div>;
}

function ScheduleTable() {
  return <Table headers={["วัน", "คาบ", "รายวิชา", "ห้อง", "ครูผู้สอน"]} rows={scheduleRows} />;
}

function SelectGroup() {
  return <label className="mb-4 flex flex-wrap items-center gap-2 text-sm text-gray-600">กลุ่มเรียน
    <select aria-label="กลุ่มเรียนตัวอย่าง" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-800" defaultValue={groups[0].name}>
      {groups.map((group) => <option key={group.name}>{group.name}</option>)}
    </select>
  </label>;
}

export default function DevelopmentPreview({ onExit }: { onExit: () => void }) {
  const [page, setPage] = useState<PreviewPage>("dashboard");
  const current = navigation.find((item) => item.id === page) ?? navigation[0];

  function renderPage() {
    switch (page) {
      case "dashboard":
        return <>
          <PageHeading title="ภาพรวม" description="สรุปข้อมูลระบบจัดตารางเรียนอัตโนมัติ" />
          <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
            {[["รายวิชา", "24", "📚", "bg-indigo-50"], ["ห้องเรียน", "8", "🚪", "bg-emerald-50"], ["ห้องนักเรียน", "12", "👥", "bg-amber-50"], ["คาบเรียน/วัน", "7", "⏰", "bg-rose-50"]].map(([label, value, icon, color]) => <div key={label} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg text-xl ${color}`}>{icon}</div><div className="text-2xl font-semibold text-gray-800">{value}</div><div className="mt-1 text-sm text-gray-500">{label}</div></div>)}
          </div>
          <Panel title="เริ่มต้นใช้งาน"><ol className="space-y-3 text-sm text-gray-600">{navigation.slice(6, 10).map((item, index) => <li key={item.id} className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-700">{index + 1}</span><button type="button" onClick={() => setPage(item.id)} className="hover:text-indigo-700">ดูตัวอย่าง{item.label}</button></li>)}<li className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-700">5</span><button type="button" onClick={() => setPage("schedules")} className="hover:text-indigo-700">ดูตัวอย่างตารางเรียน</button></li></ol></Panel>
        </>;
      case "schedules":
        return <><PageHeading title="ตารางเรียน" description="ตัวอย่างตารางเรียนของกลุ่มเรียน" /><Panel title="ตารางรายสัปดาห์"><SelectGroup /><ScheduleTable /><Notice>ปุ่มสร้างตารางถูกปิดในโหมดตัวอย่าง ไม่มีการเรียก API หรือบันทึกข้อมูล</Notice><div className="mt-4 flex gap-3"><DisabledAction label="จัดตารางกลุ่มนี้" explanation="ต้องออกจาก Preview และเข้าสู่ระบบจริงเพื่อใช้งาน" /><DisabledAction label="จัดตารางทุกกลุ่ม" explanation="ต้องออกจาก Preview และเข้าสู่ระบบจริงเพื่อใช้งาน" /></div></Panel></>;
      case "edit-schedule":
        return <><PageHeading title="แก้ตารางด้วยมือ" description="ตัวอย่างหน้าตรวจสอบและแก้ไขคาบเรียน" /><Panel title="คาบเรียนตัวอย่าง"><SelectGroup /><ScheduleTable /><Notice>การย้าย แก้ไข หรือลบคาบถูกปิด ไม่มีการเปลี่ยนแปลงตารางจริง</Notice></Panel></>;
      case "year-overview":
        return <><PageHeading title="ภาพรวมรายชั้นปี" description="ตัวอย่างจำนวนกลุ่มและคาบเรียนตามระดับชั้น" /><Panel title="สรุปชั้นปี"><Table headers={["ระดับชั้น", "จำนวนกลุ่ม", "วิชาในแผน", "สถานะตัวอย่าง"]} rows={[["ปวช.1", 4, 12, "มีตารางตัวอย่าง"], ["ปวช.2", 4, 14, "มีตารางตัวอย่าง"], ["ปวช.3", 4, 10, "มีตารางตัวอย่าง"]]} /></Panel></>;
      case "teacher-schedule":
        return <><PageHeading title="ตารางสอนครู" description="ตัวอย่างตารางสอนของครูผู้สอน" /><Panel title="เลือกครู"><label className="mb-4 flex items-center gap-2 text-sm text-gray-600">ครูผู้สอน<select aria-label="ครูตัวอย่าง" className="rounded-lg border border-gray-200 bg-white px-3 py-2">{teachers.map((teacher) => <option key={teacher[0]}>{teacher[0]}</option>)}</select></label><ScheduleTable /></Panel></>;
      case "room-usage":
        return <><PageHeading title="การใช้ห้องเรียน" description="ภาพรวมการใช้ห้องในข้อมูลจำลอง" /><div className="grid gap-4 md:grid-cols-2">{rooms.map((room, index) => <Panel key={room[0]} title={room[0]}><div className="mb-2 flex justify-between text-sm"><span className="text-gray-500">การใช้งานตัวอย่าง</span><span className="font-medium text-gray-700">{[68, 52, 41][index]}%</span></div><div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-indigo-500" style={{ width: `${[68, 52, 41][index]}%` }} /></div></Panel>)}</div></>;
      case "subjects":
        return <><PageHeading title="รายวิชา" description="รายการวิชาตัวอย่างสำหรับสาธิตหน้าจอ" /><Panel title="รายวิชาทั้งหมด"><Table headers={["รหัสวิชา", "ชื่อวิชา", "จำนวนคาบ", "ระดับชั้น"]} rows={subjects} /><Notice>เพิ่ม แก้ไข และลบวิชาถูกปิดในโหมดตัวอย่าง</Notice><div className="mt-4"><DisabledAction label="เพิ่มรายวิชา" explanation="ต้องออกจาก Preview และเข้าสู่ระบบจริงเพื่อใช้งาน" /></div></Panel></>;
      case "rooms":
        return <><PageHeading title="ห้องเรียน" description="รายการห้องเรียนตัวอย่าง" /><Panel title="ห้องเรียนทั้งหมด"><Table headers={["ชื่อห้อง", "ประเภท", "ความจุ", "สถานะ"]} rows={rooms} /><Notice>ข้อมูลนี้เป็นข้อมูลสมมติ ไม่มีการแก้ไขห้องจริง</Notice><div className="mt-4"><DisabledAction label="เพิ่มห้องเรียน" explanation="ต้องออกจาก Preview และเข้าสู่ระบบจริงเพื่อใช้งาน" /></div></Panel></>;
      case "classgroups":
        return <><PageHeading title="ห้องนักเรียน" description="กลุ่มเรียนตัวอย่างตามระดับชั้น" /><Panel title="กลุ่มเรียนทั้งหมด"><Table headers={["กลุ่มเรียน", "ระดับชั้น", "จำนวนนักเรียนตัวอย่าง"]} rows={groups.map((group) => [group.name, group.year, group.students])} /><Notice>เพิ่ม แก้ไข และลบกลุ่มเรียนถูกปิดในโหมดตัวอย่าง</Notice></Panel></>;
      case "teachers":
        return <><PageHeading title="ครูผู้สอน" description="รายชื่อครูและวิชาที่สอนในข้อมูลจำลอง" /><Panel title="ครูทั้งหมด"><Table headers={["ผู้สอนตัวอย่าง", "วิชาที่สอน", "เพดานสอน/วัน"]} rows={teachers} /><Notice>ไม่มีข้อมูลบุคคลจริง และการจัดการครูถูกปิด</Notice></Panel></>;
      case "locked-slots":
        return <><PageHeading title="ล็อกคาบ" description="ตัวอย่างคาบที่กำหนดเงื่อนไขไว้" /><Panel title="เงื่อนไขตัวอย่าง"><Table headers={["กลุ่มเรียน", "วัน", "คาบ", "หมายเหตุ"]} rows={[["ปวช.1/1", "พฤหัสบดี", "7", "กิจกรรมตัวอย่าง"], ["ปวช.2/1", "จันทร์", "1", "ล็อกตัวอย่าง"]]} /><Notice>เพิ่มหรือลบ Locked Slot ไม่ได้ใน Preview</Notice></Panel></>;
      case "import":
        return <><PageHeading title="นำเข้าข้อมูล" description="ตัวอย่างหน้าสำหรับนำเข้าข้อมูลตาราง" /><Panel title="นำเข้าไฟล์"><div className="rounded-xl border-2 border-dashed border-gray-200 p-10 text-center"><div className="text-3xl">📄</div><p className="mt-3 text-sm text-gray-600">เลือกไฟล์ตัวอย่างเพื่อดูหน้าจอ (การอัปโหลดถูกปิด)</p><input aria-label="เลือกไฟล์ (ปิดใน Preview)" type="file" disabled className="mx-auto mt-4 block max-w-full text-sm text-gray-400" /><div className="mt-5"><DisabledAction label="นำเข้าข้อมูล" explanation="ปิดการนำเข้าเพื่อป้องกันการเขียนฐานข้อมูล" /></div></div></Panel></>;
      case "print":
        return <><PageHeading title="พิมพ์ตาราง" description="ตัวอย่างหน้าจัดเตรียมตารางสำหรับพิมพ์" /><Panel title="ตัวอย่างเอกสาร"><SelectGroup /><div className="rounded-lg border border-gray-200 bg-white p-6"><div className="mb-5 text-center"><h2 className="font-semibold text-gray-800">ตารางเรียนประจำสัปดาห์</h2><p className="text-sm text-gray-500">{groups[0].name} · ข้อมูลจำลอง</p></div><ScheduleTable /></div><div className="mt-4"><DisabledAction label="พิมพ์ตาราง" explanation="การพิมพ์ถูกปิดในโหมดตัวอย่าง" /></div></Panel></>;
      case "periods":
        return <><PageHeading title="คาบเวลา" description="ช่วงเวลาเรียนตัวอย่าง" /><Panel title="คาบเรียนในหนึ่งวัน"><Table headers={["คาบ", "เริ่ม", "สิ้นสุด", "ประเภท"]} rows={periods} /><Notice>เพิ่ม แก้ไข และลบคาบเวลาถูกปิดในโหมดตัวอย่าง</Notice></Panel></>;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 sm:px-6">
        <div><p className="text-sm font-semibold">โหมดตัวอย่างสำหรับ Development</p><p className="text-xs text-amber-800">ใช้ข้อมูลสมมติเท่านั้น · ไม่ Login · ไม่เรียก API · ไม่บันทึกฐานข้อมูล</p></div>
        <button type="button" onClick={onExit} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium hover:bg-amber-100">ออกจาก Preview กลับหน้า Login</button>
      </div>
      <div className="mx-auto flex min-h-[calc(100vh-65px)] max-w-[1600px]">
        <aside className="hidden w-60 shrink-0 border-r border-gray-100 bg-white lg:block">
          <div className="border-b border-gray-100 px-5 py-5"><div className="flex items-center gap-2"><span className="text-xl">🗓️</span><span className="text-sm font-semibold leading-tight text-gray-800">ระบบจัดตารางเรียน</span></div></div>
          <nav aria-label="เมนูตัวอย่าง" className="space-y-1 px-3 py-4">{navigation.map((item) => <button type="button" key={item.id} aria-current={page === item.id ? "page" : undefined} onClick={() => setPage(item.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${page === item.id ? "bg-indigo-50 font-medium text-indigo-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"}`}><span>{item.icon}</span>{item.label}</button>)}</nav>
          <div className="px-5 pb-5 text-xs text-gray-400">Development Preview · v1.0.0</div>
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mb-5 flex items-center gap-2 text-sm text-gray-500 lg:hidden"><span>{current.icon}</span><span>{current.label}</span></div>
          <nav aria-label="เมนูตัวอย่างแบบย่อ" className="mb-6 flex gap-2 overflow-x-auto pb-2 lg:hidden">{navigation.map((item) => <button type="button" key={item.id} onClick={() => setPage(item.id)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${page === item.id ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-white text-gray-600"}`}>{item.icon} {item.label}</button>)}</nav>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
