import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Winservice | Leads & ROI",
  description: "Acompanhe leads, orçamentos, campanhas e faturamento da Winservice.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
