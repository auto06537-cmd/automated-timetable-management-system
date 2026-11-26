export function isDevelopmentPreviewEnabled(
  nodeEnv: string | undefined,
  enabledFlag: string | undefined,
): boolean {
  return nodeEnv === "development" && enabledFlag === "true";
}
