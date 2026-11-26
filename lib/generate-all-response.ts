export interface GenerateAllGroupResult {
  classGroup: string;
  success: boolean;
  count?: number;
  error?: string;
  unplaced?: Array<{
    subjectName?: string;
    missingPeriods?: number;
    reason?: string;
  }>;
}

export interface GenerateAllView {
  kind: "success" | "partial" | "failure" | "server_error" | "unknown";
  summary: string;
  successCount?: number;
  failureCount?: number;
  results: GenerateAllGroupResult[];
  shouldReload: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

const SAFE_ERROR_MESSAGES = new Set([
  "รหัสกลุ่มเรียนไม่ถูกต้อง",
  "ไม่พบกลุ่มเรียน",
  "จัดตารางได้บางกลุ่ม โปรดตรวจผลรายกลุ่ม",
  "จัดตารางไม่ครบ",
  "จัดตารางไม่สำเร็จ",
  "จัดตารางคู่ไม่สำเร็จ",
  "มีวิชาที่จัดตารางคู่ไม่ครบ จึงไม่ได้บันทึกตารางของคู่",
  "ไม่ได้บันทึกตารางคู่ เนื่องจากมีอีกกลุ่มในชุดจับคู่จัดตารางไม่ครบ",
  "ไม่มีผลการจัดตาราง",
  "ครบเพดานคาบรายวิชาต่อวัน",
  "กลุ่มไม่ว่าง คาบล็อก หรือเกินคาบเลิกเรียน",
  "ช่วงว่างระหว่างคาบยาวเกินกำหนด",
  "ห้องว่างไม่พอ",
  "ครูว่างไม่พอหรือถึงเพดานสอนรายวัน",
  "ไม่มีคาบสอนให้จัด",
]);

const INTERNAL_ERROR_PATTERN = /(?:\bprisma\b|\bsqlite\b|\bsql(?:\s+error)?\b|SQLITE_[A-Z0-9_]*|\bP\d{4}\b|\b(?:TypeError|ReferenceError|SyntaxError|RangeError|Error):|\bstack\s+trace\b|\bnode_modules\b|\bnode:internal\b|\binternal\/|(?:^|\s)at\s+[\w.$<>]+\s*\(|[A-Za-z]:[\\/]|(?:^|[\s(])\/(?:[^\s)]+\/)+)/i;

export function safeMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const message = value.trim();
  if (!message || message.length > 300 || INTERNAL_ERROR_PATTERN.test(message)) return undefined;

  if (SAFE_ERROR_MESSAGES.has(message)) return message;
  if (/^จับคู่ไม่ครบสำหรับ pairKey [\p{L}\p{N}_.:-]{1,80}$/u.test(message)) {
    return "จับคู่กลุ่มเรียนไม่ครบ";
  }
  if (/^วิชานี้ต้องมีครูผู้สอนอย่างน้อย \d{1,3} คน$/.test(message)) return message;
  if (/^ต้องมีห้องเรียนอย่างน้อย \d{1,3} ห้อง$/.test(message)) return message;

  const reasons = message.split(" / ");
  if (reasons.length > 1 && reasons.every((reason) => SAFE_ERROR_MESSAGES.has(reason))) return message;
  return undefined;
}

export function sanitizeSubjectName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  if (!name || name.length > 160 || /[\u0000-\u001F\u007F]/.test(name)) return undefined;
  return name;
}

function sanitizeClassGroupName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  if (!name || name.length > 120 || /[\u0000-\u001F\u007F-\u009F]/.test(name)) return undefined;
  return name;
}

function readGroupResult(value: unknown): GenerateAllGroupResult | null {
  if (!isRecord(value) || typeof value.success !== "boolean") return null;
  const classGroup = sanitizeClassGroupName(value.classGroup);
  if (!classGroup) return null;

  const result: GenerateAllGroupResult = {
    classGroup,
    success: value.success,
  };
  const count = nonNegativeInt(value.count);
  if (count !== undefined) result.count = count;

  const error = safeMessage(value.error);
  if (error) result.error = error;

  if (Array.isArray(value.unplaced)) {
    result.unplaced = value.unplaced.flatMap((item) => {
      if (!isRecord(item)) return [];
      const unplaced: NonNullable<GenerateAllGroupResult["unplaced"]>[number] = {};
      const subjectName = sanitizeSubjectName(item.subjectName);
      const reason = safeMessage(item.reason);
      const missingPeriods = nonNegativeInt(item.missingPeriods);
      if (subjectName) unplaced.subjectName = subjectName;
      if (reason) unplaced.reason = reason;
      if (missingPeriods !== undefined) unplaced.missingPeriods = missingPeriods;
      return Object.keys(unplaced).length ? [unplaced] : [];
    });
  }
  return result;
}

function readResults(body: Record<string, unknown>): GenerateAllGroupResult[] {
  return Array.isArray(body.results)
    ? body.results.map(readGroupResult).filter((result): result is GenerateAllGroupResult => result !== null)
    : [];
}

function readCounts(body: Record<string, unknown>, results: GenerateAllGroupResult[]) {
  const reportedSuccess = nonNegativeInt(body.successCount);
  const reportedFailure = nonNegativeInt(body.failureCount);
  const hasCompleteResults = Array.isArray(body.results) && results.length === body.results.length;
  return {
    successCount: reportedSuccess ?? (hasCompleteResults ? results.filter((item) => item.success).length : undefined),
    failureCount: reportedFailure ?? (hasCompleteResults ? results.filter((item) => !item.success).length : undefined),
  };
}

export function normalizeGenerateAllResponse(httpStatus: number, payload: unknown): GenerateAllView {
  if (httpStatus === 500) {
    return {
      kind: "server_error",
      summary: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ กรุณาลองใหม่ภายหลัง",
      results: [],
      shouldReload: false,
    };
  }

  if (!isRecord(payload)) {
    return {
      kind: "unknown",
      summary: "ไม่ได้รับรายละเอียดผลการจัดตารางที่ถูกต้อง",
      results: [],
      shouldReload: false,
    };
  }

  const apiStatus = payload.status;
  const results = readResults(payload);
  const counts = readCounts(payload, results);
  const resultHasSuccess = results.some((item) => item.success);
  const shouldReload = resultHasSuccess || (counts.successCount !== undefined && counts.successCount > 0);

  if (httpStatus === 200 && apiStatus === "success") {
    return {
      kind: "success",
      summary: "จัดตารางสำเร็จทั้งหมด",
      ...counts,
      results,
      shouldReload,
    };
  }

  if (httpStatus === 207 && apiStatus === "partial_success") {
    return {
      kind: "partial",
      summary: safeMessage(payload.error) ?? "จัดตารางได้บางกลุ่ม โปรดตรวจผลรายกลุ่ม",
      ...counts,
      results,
      shouldReload,
    };
  }

  if (httpStatus === 422 && apiStatus === "failure") {
    return {
      kind: "failure",
      summary: safeMessage(payload.error) ?? "ไม่สามารถจัดตารางได้ โปรดตรวจรายละเอียดที่แสดง",
      ...counts,
      results,
      shouldReload: false,
    };
  }

  return {
    kind: "unknown",
    summary: "ผลตอบกลับจากเซิร์ฟเวอร์ไม่ครบถ้วน กรุณาลองใหม่",
    results: [],
    shouldReload: false,
  };
}

export function requestFailureView(): GenerateAllView {
  return {
    kind: "unknown",
    summary: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่",
    results: [],
    shouldReload: false,
  };
}
