import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { codecovVitePlugin } from "@codecov/vite-plugin";
import { fileURLToPath } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],
      manifest: {
        name: "Lift",
        short_name: "Lift",
        description: "Lift - Task management with focus on today's tasks",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
    codecovVitePlugin({
      enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
      bundleName: "lift",
      uploadToken: process.env.CODECOV_TOKEN,
    }),
  ],
  base: "./",
  // Vite's dependency optimizer otherwise moves the Matrix WASM loader into
  // node_modules/.vite/deps while leaving its relative `pkg/*.wasm` URL behind.
  // Keeping this package external lets Vite serve the artifact from its real
  // package directory in development; Rollup handles the production asset.
  optimizeDeps: {
    exclude: ["@matrix-org/matrix-sdk-crypto-wasm"],
  },
  resolve: {
    alias: [
      { find: "@", replacement: "/src" },
      {
        find: /^@automerge\/automerge$/,
        replacement: fileURLToPath(
          new URL(
            "./node_modules/@automerge/automerge/dist/mjs/entrypoints/fullfat_base64.js",
            import.meta.url
          )
        ),
      },
    ],
  },
});
