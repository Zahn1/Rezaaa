import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "REZAA — Intelligence Beyond Interaction",
  description: "A personal AI operating system with a holographic interface.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-void text-white antialiased">{children}</body>
    </html>
  );
}
