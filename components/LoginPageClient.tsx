"use client";

import { useState, type FormEvent } from "react";
import DevelopmentPreview from "@/components/DevelopmentPreview";

export default function LoginPageClient({ previewEnabled }: { previewEnabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ message: string; ok: boolean } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const { username, password } = Object.fromEntries(new FormData(form));
    setPending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();
      if (response.ok && result.ok === true) {
        form.reset();
        window.location.replace("/");
      } else {
        setStatus({
          ok: false,
          message: typeof result.error === "string" ? result.error : "ตรวจสอบการเข้าสู่ระบบไม่ได้ในขณะนี้",
        });
      }
    } catch {
      setStatus({ ok: false, message: "เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่" });
    } finally {
      setPending(false);
    }
  }

  if (showPreview && previewEnabled) {
    return <DevelopmentPreview onExit={() => setShowPreview(false)} />;
  }

  return (
    <section className="mx-auto mt-12 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-xl font-semibold text-gray-900">เข้าสู่ระบบผู้ดูแล</h1>
      <form method="post" onSubmit={submit} className="mt-6 space-y-4" aria-busy={pending}>
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700">ชื่อผู้ใช้</label>
          <input id="username" name="username" autoComplete="username" required maxLength={128}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">รหัสผ่าน</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={72}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <button type="submit" disabled={pending}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {pending ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
        </button>
        {status && (
          <p role={status.ok ? "status" : "alert"} className={status.ok ? "text-sm text-green-700" : "text-sm text-red-700"}>
            {status.message}
          </p>
        )}
      </form>

      {previewEnabled && (
        <div className="mt-6 border-t border-gray-100 pt-5">
          <p className="mb-3 text-sm text-gray-600">ต้องการดูหน้าจอระบบด้วยข้อมูลตัวอย่างหรือไม่</p>
          <button type="button" onClick={() => setShowPreview(true)}
            className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-800 hover:bg-indigo-100">
            เข้าใช้งานโหมดตัวอย่าง (Bypass)
          </button>
          <p className="mt-2 text-xs text-gray-500">โหมดนี้แสดงข้อมูลจำลองเท่านั้น และไม่มีการบันทึกข้อมูล</p>
        </div>
      )}
    </section>
  );
}
