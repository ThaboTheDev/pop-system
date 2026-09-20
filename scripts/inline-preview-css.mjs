/**
 * Inlines src/app/globals.css AND public/branding/msri-logo.png into
 * design/preview.html, so the design reference is one self-contained file.
 *
 * The preview is a plain static file with no build step. Copying the rules
 * and the crest in makes it render correctly whether it is opened from disk,
 * from a file viewer, or from a static server — a preview pane twice failed
 * to load the linked assets, and each failure looked like the app had broken.
 * This script keeps those copies honest:
 *
 *     node scripts/inline-preview-css.mjs
 *
 * Run it after changing the stylesheet or the crest. It is idempotent: the
 * previously inlined stylesheet block (including its comment) and any
 * previously inlined crest are replaced, never duplicated.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = join(root, "src/app/globals.css");
const crestPath = join(root, "public/branding/msri-logo.png");
const htmlPath = join(root, "design/preview.html");

const css = readFileSync(cssPath, "utf8").trimEnd();
const crest = "data:image/png;base64," + readFileSync(crestPath).toString("base64");
const html = readFileSync(htmlPath, "utf8");

// Strip the stylesheet <link>, the previously inlined style block, and — this
// is the part the old script missed — its comment, which used to stay behind
// and duplicate on every run.
const withoutStyles = html
  .replace(
    /[ \t]*<!-- Inlined by scripts\/inline-preview-css\.mjs from src\/app\/globals\.css\.\r?\n[ \t]*Re-run that script after changing the stylesheet\. -->\r?\n/g,
    "",
  )
  .replace(/[ \t]*<link[^>]*globals\.css[^>]*>\r?\n/g, "")
  .replace(/[ \t]*<style data-inlined="globals\.css">[\s\S]*?<\/style>\r?\n/g, "");

// Embed the crest wherever it is referenced, replacing the relative path or
// an earlier embedding of it.
const withCrest = withoutStyles.replace(
  /src="(?:\.\.\/public\/branding\/msri-logo\.png|data:image\/png;base64,[A-Za-z0-9+/=]+)"/g,
  `src="${crest}"`,
);

if (!withCrest.includes("</head>")) {
  throw new Error("design/preview.html has no </head> to insert the styles into");
}

const block =
  '    <!-- Inlined by scripts/inline-preview-css.mjs from src/app/globals.css.\n' +
  "         Re-run that script after changing the stylesheet. -->\n" +
  '    <style data-inlined="globals.css">\n' +
  css +
  "\n    </style>\n";

const out = withCrest.replace("</head>", block + "  </head>");

if (!out.includes('src="data:image/png;base64,')) {
  throw new Error(
    "design/preview.html references no crest image; nothing to embed. " +
    "If the markup changed, point the script at the new <img>.",
  );
}
if (/(?:src|href)="\.\./.test(out)) {
  throw new Error("design/preview.html still references an external asset — it must be self-contained");
}

writeFileSync(htmlPath, out);

const embedded = (out.match(/src="data:image\/png;base64,/g) ?? []).length;
console.log(
  `Inlined ${(css.length / 1024).toFixed(1)} kB of CSS and the crest into design/preview.html ` +
  `(${(out.length / 1024).toFixed(1)} kB total, ${embedded} embedded images, zero external requests)`,
);
