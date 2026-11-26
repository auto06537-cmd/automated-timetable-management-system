"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  subjects: number;
  rooms: number;
  classGroups: number;
  periods: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ subjects: 0, rooms: 0, classGroups: 0, periods: 0 });

  useEffect(() => {
    Promise.all([
      fetch("/api/subjects").then((r) => r.json()),
      fetch("/api/rooms").then((r) => r.json()),
      fetch("/api/classgroups").then((r) => r.json()),
      fetch("/api/periods").then((r) => r.json()),
    ]).then(([subjects, rooms, classGroups, periods]) => {
      setStats({
        subjects: subjects.length,
        rooms: rooms.length,
        classGroups: classGroups.length,
        periods: periods.filter((p: { isLunch: boolean }) => !p.isLunch).length,
      });
    });
  }, []);

  const cards = [
    { label: "รายวิชา", value: stats.subjects, icon: "📚", href: "/subjects", color: "bg-indigo-50 text-indigo-700" },
    { label: "ห้องเรียน", value: stats.rooms, icon: "🚪", href: "/rooms", color: "bg-emerald-50 text-emerald-700" },
    { label: "ห้องนักเรียน", value: stats.classGroups, icon: "👥", href: "/classgroups", color: "bg-amber-50 text-amber-700" },
    { label: "คาบเรียน/วัน", value: stats.periods, icon: "⏰", href: "/periods", color: "bg-rose-50 text-rose-700" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-800">ภาพรวม</h1>
        <p className="text-gray-500 text-sm mt-1">ระบบจัดตารางเรียนอัตโนมัติสำหรับสถานศึกษา</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <Link href={c.href} key={c.label}>
            <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-sm transition-shadow cursor-pointer">
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${c.color} text-xl mb-3`}>
                {c.icon}
              </div>
              <div className="text-2xl font-semibold text-gray-800">{c.value}</div>
              <div className="text-sm text-gray-500 mt-0.5">{c.label}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="font-medium text-gray-800 mb-4">เริ่มต้นใช้งาน</h2>
        <ol className="space-y-3">
          {[
            { step: "1", text: "เพิ่มรายวิชาและจำนวนคาบ", href: "/subjects" },
            { step: "2", text: "เพิ่มห้องเรียน (ฟิสิคอล)", href: "/rooms" },
            { step: "3", text: "เพิ่มห้องนักเรียน เช่น ปวช.1/1", href: "/classgroups" },
            { step: "4", text: "ตรวจสอบคาบเวลา", href: "/periods" },
            { step: "5", text: "จัดตารางเรียนอัตโนมัติ", href: "/schedules" },
          ].map((item) => (
            <li key={item.step}>
              <Link href={item.href} className="flex items-center gap-3 group">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium flex items-center justify-center flex-shrink-0">
                  {item.step}
                </span>
                <span className="text-sm text-gray-600 group-hover:text-indigo-600 transition-colors">
                  {item.text}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
