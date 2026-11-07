import type { MetadataRoute } from "next";

// lets phones add the site to the home screen and open it without browser bars
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TrendX Trading Space",
    short_name: "TrendX",
    start_url: "/",
    display: "fullscreen",
    background_color: "#040806",
    theme_color: "#040806",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
