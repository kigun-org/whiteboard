import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function copyFonts(): Plugin {
  return {
    name: "excalidraw-fonts",
    closeBundle() {
      const require = createRequire(import.meta.url);
      // The package entry is dist/prod/index.js. Fonts sit beside it.
      const prodDir = dirname(require.resolve("@excalidraw/excalidraw"));
      cpSync(resolve(prodDir, "fonts"), resolve(import.meta.dirname, "dist/fonts"), {
        recursive: true,
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  publicDir: false,
  plugins: [react(), copyFonts()],
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      mode === "production" ? "production" : "development",
    ),
    global: "globalThis",
  },
  build: {
    cssCodeSplit: false,
    assetsInlineLimit: 1024 * 1024,
    rolldownOptions: {
      output: {
        codeSplitting: false,
      },
    },
    lib: {
      entry: resolve(import.meta.dirname, "src/whiteboard-editor.tsx"),
      formats: ["es"],
      fileName: () => "whiteboard.js",
      cssFileName: "whiteboard",
    },
  },
}));
