import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create a new admin only when an operator supplies a password.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (adminPassword !== undefined) {
    if (adminPassword.trim().length < 16 || adminPassword.includes("\0") ||
        Buffer.byteLength(adminPassword, "utf8") > 72) {
      throw new Error("SEED_ADMIN_PASSWORD must contain at least 16 characters and at most 72 UTF-8 bytes");
    }
    await prisma.admin.upsert({
      where: { username: "admin" },
      update: {},
      create: { username: "admin", password: await bcrypt.hash(adminPassword, 10) },
    });
  }

  // ========== คาบเวลา ==========
  const periods = [
    { periodNo: 1, startTime: "08:00", endTime: "09:00" },
    { periodNo: 2, startTime: "09:00", endTime: "10:00" },
    { periodNo: 3, startTime: "10:00", endTime: "11:00" },
    { periodNo: 4, startTime: "11:00", endTime: "12:00" },
    { periodNo: 0, startTime: "12:00", endTime: "13:00", isLunch: true },
    { periodNo: 5, startTime: "13:00", endTime: "14:00" },
    { periodNo: 6, startTime: "14:00", endTime: "15:00" },
    { periodNo: 7, startTime: "15:00", endTime: "16:00" },
    { periodNo: 8, startTime: "16:00", endTime: "17:00" },
  ];
  for (const p of periods) {
    await prisma.period.upsert({ where: { periodNo: p.periodNo }, update: {}, create: p as any });
  }

  // ========== ห้องเรียน (ทดสอบ) ==========
  const rooms = ["ห้อง 101", "ห้อง 102", "ห้อง 103", "Lab คอม 1", "Lab คอม 2"];
  for (const name of rooms) {
    await prisma.room.upsert({ where: { name }, update: {}, create: { name } });
  }

  // ========== ห้องนักเรียน (ทดสอบ: 3 ชั้นปี ชั้นปีละ 2 กลุ่ม = จับคู่กันพอดี) ==========
  // โครงสร้างนี้เป็นตัวอย่าง ผู้ใช้เพิ่ม/ลดกลุ่มเองได้ในหน้า "ห้องนักเรียน"
  const classGroupsData = [
    { name: "1ชทส1", year: 1, pairKey: "1A" },
    { name: "1ชทส2", year: 1, pairKey: "1A" },
    { name: "2ชทส1", year: 2, pairKey: "2A" },
    { name: "2ชทส2", year: 2, pairKey: "2A" },
    { name: "3ชทส1", year: 3, pairKey: "3A" },
    { name: "3ชทส2", year: 3, pairKey: "3A" },
  ];
  for (const g of classGroupsData) {
    await prisma.classGroup.upsert({
      where: { name: g.name }, update: { year: g.year, pairKey: g.pairKey },
      create: { name: g.name, year: g.year, pairKey: g.pairKey, maxEndPeriod: 8 },
    });
  }

  // ========== วิชาตัวอย่าง (ทดสอบ ไม่ครบ ผู้ใช้กรอกเพิ่มเอง) ==========
  // isCommon = true → วิชาสามัญ เรียนรวมกันตาม pairKey
  // isCommon = false → วิชาแผนก เรียนแยกแต่ละกลุ่ม
  const subjectsData = [
    { code: "20000-1101", name: "ภาษาไทยพื้นฐาน",  periodsPerWeek: 2, isCommon: true },
    { code: "20000-1201", name: "ภาษาอังกฤษพื้นฐาน", periodsPerWeek: 2, isCommon: true },
    { code: "21901-2001", name: "วิชาแผนกตัวอย่าง 1", periodsPerWeek: 3, isCommon: false },
    { code: "21901-2002", name: "วิชาแผนกตัวอย่าง 2", periodsPerWeek: 4, isCommon: false },
    { code: "HOME-ROOM",  name: "Home Room",          periodsPerWeek: 1, isCommon: false },
  ];
  for (const s of subjectsData) {
    await prisma.subject.upsert({
      where: { code: s.code }, update: { isCommon: s.isCommon },
      create: s,
    });
  }

  // ========== ล็อกคาบกิจกรรม วันพฤหัส คาบ 7-8 (15:00-17:00) ทุกกลุ่ม ==========
  const allGroups = await prisma.classGroup.findMany();
  const period7 = await prisma.period.findUnique({ where: { periodNo: 7 } });
  const period8 = await prisma.period.findUnique({ where: { periodNo: 8 } });

  if (period7 && period8) {
    for (const group of allGroups) {
      await prisma.lockedSlot.upsert({
        where: { dayOfWeek_classGroupId_periodId: { dayOfWeek: 4, classGroupId: group.id, periodId: period7.id } },
        update: {},
        create: { dayOfWeek: 4, classGroupId: group.id, periodId: period7.id, label: "กิจกรรมหน้าเสาธง" },
      });
      await prisma.lockedSlot.upsert({
        where: { dayOfWeek_classGroupId_periodId: { dayOfWeek: 4, classGroupId: group.id, periodId: period8.id } },
        update: {},
        create: { dayOfWeek: 4, classGroupId: group.id, periodId: period8.id, label: "กิจกรรมหน้าเสาธง" },
      });
    }
  }

  console.log("✅ Seed (ข้อมูลทดสอบ) เสร็จแล้ว!");
  console.log("📋 ห้องนักเรียน:", classGroupsData.map(g => g.name).join(", "));
  console.log("📚 วิชาตัวอย่าง:", subjectsData.map(s => s.name).join(", "));
  console.log("ℹ️  เพิ่มข้อมูลจริงทั้งหมดได้ที่หน้าเว็บ: รายวิชา, ห้องนักเรียน");
}

main()
  .catch(() => {
    console.error("Seed failed. Check the database and seed configuration.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
