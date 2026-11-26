import LoginPageClient from "@/components/LoginPageClient";
import { isDevelopmentPreviewEnabled } from "@/lib/development-preview-access";

export default function LoginPage() {
  // NODE_ENV is inlined as "production" in production builds. The private flag
  // is an additional opt-in for the local development server only.
  const previewEnabled = isDevelopmentPreviewEnabled(
    process.env.NODE_ENV,
    process.env.ENABLE_UI_PREVIEW,
  );

  return <LoginPageClient previewEnabled={previewEnabled} />;
}
