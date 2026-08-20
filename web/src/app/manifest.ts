import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Markova - School Management System",
    short_name: "Markova",
    description: "Self-hosted school management platform",
    start_url: "/",
    display: "standalone",
    background_color: "#1B4F72",
    theme_color: "#1B4F72",
    icons: [
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Android crops launcher icons to a circle/squircle; this copy keeps the
      // mark inside the centre safe zone so nothing is cut off.
      {
        src: "/brand/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
