import type { MetadataRoute } from "next";

/**
 * Web App Manifest — makes "Add to Home Screen" on iOS/Android install
 * Wanderer's Rest as a standalone app (own icon, no browser chrome) on
 * iPad/iPhone/Android. Single manifest for the whole app: "/" already
 * does the role-based landing/redirect (see app/page.tsx), so one
 * install works for Back Office, Cashier, and Staff Mobile alike —
 * whichever areas that staff member's permissions reach.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wanderer's Rest",
    short_name: "Wanderer's Rest",
    description: "POS + CRM for Wanderer's Rest board game café",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#241a3d",
    theme_color: "#241a3d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
