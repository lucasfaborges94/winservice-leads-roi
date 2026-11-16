import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./winservice-brand.css";
import "./mobile-brand.css";

export const metadata: Metadata = {
  title: "Winservice | Leads & ROI",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/winservice-192.png", apple: "/winservice-apple-touch.png" },
  appleWebApp: { capable: true, title: "Leads & ROI" },
  description: "Acompanhe leads, orçamentos, campanhas e faturamento da Winservice.",
};

export const viewport: Viewport = { themeColor: "#001439", viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html:
          'try{var t=localStorage.getItem("winservice-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch{}',
        }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
