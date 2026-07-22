import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Visibel",
  description:
    "From Zero to Hero — see your business the way a searching customer does, then let us fix it.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. Immersive Translate)
    // inject attributes like data-immersive-translate-page-theme onto <html>
    // before React hydrates, which otherwise logs a hydration mismatch. Scoped
    // to the <html> element only (ISS-015).
    <html lang="en" suppressHydrationWarning>
      <body className="bg-surface text-ink antialiased">{children}</body>
    </html>
  );
}
