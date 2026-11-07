import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "TrendX Trading Space", description: "TrendX Ultimate AI Pro accounts", appleWebApp: { capable: true, title: "TrendX", statusBarStyle: "black" } };

export const viewport: Viewport = { themeColor: "#040806", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="th"><body>{children}</body></html>;
}
