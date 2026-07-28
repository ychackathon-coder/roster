// Bundles src/index.ts into a single self-contained ESM bin at
// dist/roster-runner.mjs. Only node builtins are used, so nothing is external.
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "dist", "roster-runner.mjs");

const result = await build({
  entryPoints: [path.join(root, "src", "index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  write: false,
});

// The entry's `#!/usr/bin/env tsx` shebang must not reach consumers (tsx is
// not installed for them), and esbuild's banner/hashbang ordering is not
// something to depend on — so compose the final file by hand: strip any
// surviving shebang, then prepend the node shebang plus a createRequire shim
// (ESM output has no `require` for any CJS-interop helpers esbuild emits).
const bundled = result.outputFiles[0].text.replace(/^#![^\n]*\n/, "");
const header = [
  "#!/usr/bin/env node",
  'import { createRequire } from "node:module";',
  "const require = createRequire(import.meta.url);",
  "",
].join("\n");

mkdirSync(path.dirname(outfile), { recursive: true });
writeFileSync(outfile, header + bundled);
// npm only preserves the executable bit if it is set in the packed tarball
chmodSync(outfile, 0o755);

console.log(`built ${path.relative(process.cwd(), outfile)}`);
