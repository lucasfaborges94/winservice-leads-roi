import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Winservice Leads & ROI",
    short_name: "Leads & ROI",
    description: "Leads, campanhas e resultados da Winservice.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "pt-BR",
    background_color: "#f4f8fc",
    theme_color: "#092748",
    icons: [
      { src: "/winservice-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/winservice-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/winservice-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
