import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HealTrip AI Patient Decision Assistant",
  description: "Prototype full-stack AI triage and provider matching assistant.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
