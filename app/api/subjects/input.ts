import { isObject, positiveInt } from "../schedules/data";

export function subjectInput(body: unknown, current?: { isCommon: boolean; pairedMode: string | null }) {
  if (!isObject(body)) return;
  const { code, name, pairedMode } = body;
  const periodsPerWeek = positiveInt(body.periodsPerWeek);
  const isCommon = body.isCommon === undefined ? current?.isCommon ?? false : body.isCommon;
  if (typeof code !== "string" || !code.trim() || typeof name !== "string" || !name.trim() ||
      periodsPerWeek === undefined || typeof isCommon !== "boolean" ||
      (pairedMode !== undefined && pairedMode !== null && pairedMode !== "SHARED_ROOM" && pairedMode !== "SEPARATE_ROOMS") ||
      (!isCommon && pairedMode != null)) return;
  return {
    code: code.trim(), name: name.trim(), periodsPerWeek, isCommon,
    pairedMode: isCommon ? (pairedMode === undefined ? current?.pairedMode ?? null : pairedMode) : null,
  };
}
