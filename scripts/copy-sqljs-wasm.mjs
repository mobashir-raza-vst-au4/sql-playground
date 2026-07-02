// Copies the sql.js wasm binary into /public so the browser can fetch it at /sql-wasm.wasm.
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, "../node_modules/sql.js/dist/sql-wasm.wasm");
const destDir = resolve(__dirname, "../public");
const dest = resolve(destDir, "sql-wasm.wasm");

if (!existsSync(src)) {
  console.warn("[copy-sqljs-wasm] source not found (is sql.js installed?):", src);
  process.exit(0);
}
await mkdir(destDir, { recursive: true });
await copyFile(src, dest);
console.log("[copy-sqljs-wasm] copied ->", dest);
