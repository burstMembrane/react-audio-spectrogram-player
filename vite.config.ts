import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import wasm from "vite-plugin-wasm";
// @ts-ignore
import tailwindcss from "@tailwindcss/vite";
import topLevelAwait from "vite-plugin-top-level-await";
export default defineConfig({
  build: {
    minify: false,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "src/lib/index.tsx"),
      name: "SpectrogramPlayer",
      fileName: (format) => `react-audio-spectrogram-player.${format}.js`,
    },
    rollupOptions: {
      external: ["react", "react-dom"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },

      },
    },
  },
  plugins: [
    react(),
    dts(),
    cssInjectedByJsPlugin(),
    wasm(),
    tailwindcss(),
    topLevelAwait(),
  ],
  worker: {
    format: "es",
    plugins: [wasm(), topLevelAwait()],
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'workers/[name]-[hash].js',
      }
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["rust-melspec-wasm"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
