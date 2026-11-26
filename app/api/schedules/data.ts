export function positiveInt(value: unknown) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) return undefined;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 2147483647 ? number : undefined;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const scheduleInclude = {
  subject: true,
  room: true,
  period: true,
  classGroup: true,
  groups: { include: { classGroup: true } },
} as const;

export function scheduleForGroup(classGroupId: number) {
  return { OR: [{ classGroupId }, { groups: { some: { classGroupId } } }] };
}

export const scheduleOrder = [
  { dayOfWeek: "asc" as const }, { period: { periodNo: "asc" as const } },
];
