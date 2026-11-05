import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "TrendX Trading Office", description: "TrendX Ultimate AI Pro accounts" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="th"><body>{children}</body></html>;
}
