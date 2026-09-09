import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The whole app runs in the browser, so it ships as a static bundle. That is
  // what Cloudflare Pages serves out of ./out with no server-side runtime.
  output: "export",
  images: { unoptimized: true },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
