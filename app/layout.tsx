import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ระบบจัดตารางเรียนอัตโนมัติ",
  description: "ระบบจัดตารางเรียนอัตโนมัติสำหรับสถานศึกษา",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="font-sans bg-gray-50">
        {children}
      </body>
    </html>
  );
}
