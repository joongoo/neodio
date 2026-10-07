import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "네오디오(Neodio)",
    short_name: "Neodio",
    description: "브랜드 가시성 대시보드",
    lang: "ko",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/neodio-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/neodio-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
