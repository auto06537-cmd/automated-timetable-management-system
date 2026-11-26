"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/",                 icon: "📊", label: "ภาพรวม" },
  { href: "/schedules",        icon: "📅", label: "ตารางเรียน" },
  { href: "/edit-schedule",    icon: "✏️", label: "แก้ตารางด้วยมือ" },
  { href: "/year-overview",    icon: "📊", label: "ภาพรวมรายชั้นปี" },
  { href: "/teacher-schedule", icon: "📋", label: "ตารางสอนครู" },
  { href: "/room-usage",       icon: "🏢", label: "การใช้ห้องเรียน" },
  { href: "/subjects",         icon: "📚", label: "รายวิชา" },
  { href: "/rooms",            icon: "🚪", label: "ห้องเรียน" },
  { href: "/classgroups",      icon: "👥", label: "ห้องนักเรียน" },
  { href: "/teachers",         icon: "🧑‍🏫", label: "ครูผู้สอน" },
  { href: "/locked-slots",     icon: "🔒", label: "ล็อกคาบ" },
  { href: "/import",           icon: "📥", label: "นำเข้าข้อมูล" },
  { href: "/print",            icon: "🖨️", label: "พิมพ์ตาราง" },
  { href: "/periods",          icon: "⏰", label: "คาบเวลา" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  async function logout() {
    setLoggingOut(true);
    setLogoutError(false);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      window.location.replace("/login");
    } catch {
      setLogoutError(true);
      setLoggingOut(false);
    }
  }
  return (
    <aside className="w-56 bg-white border-r border-gray-100 flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xl">🗓️</span>
          <span className="font-semibold text-gray-800 text-sm leading-tight">
            ระบบจัดตารางเรียน
          </span>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-gray-100">
        <button type="button" onClick={logout} disabled={loggingOut} className="mb-3 text-sm font-medium text-indigo-700 hover:underline disabled:opacity-60">
          {loggingOut ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
        </button>
        {logoutError && <p role="alert" className="mb-2 text-xs text-red-700">ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง</p>}
        <p className="text-xs text-gray-400">v1.0.0</p>
      </div>
    </aside>
  );
}
