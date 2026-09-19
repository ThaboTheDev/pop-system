/**
 * Inlines src/app/globals.css into design/preview.html.
 *
 * The preview is a plain static file, so it has no build step to resolve a
 * stylesheet link. Copying the rules in makes the file render correctly whether
 * it is opened from disk, from the file viewer or from a static server — and
 * this script keeps that copy honest:
 *
 *     node scripts/inline-preview-css.mjs
 *
 * Run it after changing the stylesheet. It is idempotent: the previous block is
 * removed before the current one is inserted.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = join(root, "src/app/globals.css");
const htmlPath = join(root, "design/preview.html");

const css = readFileSync(cssPath, "utf8").trimEnd();
const html = readFileSync(htmlPath, "utf8");

// Drop the <link> to the stylesheet and any previously inlined block.
const withoutStyles = html
  .replace(/[ \t]*<link[^>]*globals\.css[^>]*>\n/, "")
  .replace(/[ \t]*<style data-inlined="globals\.css">[\s\S]*?<\/style>\n/, "");

if (!withoutStyles.includes("</head>")) {
  throw new Error("design/preview.html has no </head> to insert the styles into");
}

const block =
  '    <!-- Inlined by scripts/inline-preview-css.mjs from src/app/globals.css.\n' +
  "         Re-run that script after changing the stylesheet. -->\n" +
  '    <style data-inlined="globals.css">\n' +
  css +
  "\n    </style>\n";

const out = withoutStyles.replace("</head>", block + "  </head>");
writeFileSync(htmlPath, out);

console.log(
  `Inlined ${(css.length / 1024).toFixed(1)} kB of CSS into design/preview.html`,
);
