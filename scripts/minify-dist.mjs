import { readFile, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  external: ["zod"],
  platform: "node",
  target: "node20",
  format: "esm",
  minify: true
});

await build({
  entryPoints: ["dist/cli.js"],
  outfile: "dist/cli.js",
  allowOverwrite: true,
  bundle: false,
  format: "esm",
  minify: true
});

await Promise.all(
  ["apply", "compose", "conditions", "library", "safety", "schemas", "select"].map((name) =>
    rm(`dist/${name}.js`, { force: true })
  )
);

const declarations = await Promise.all(
  ["schemas", "library", "select", "apply", "compose", "conditions", "safety"].map(async (name) =>
    stripImports(await readFile(`dist/${name}.d.ts`, "utf8"))
  )
);

await writeFile("dist/index.d.ts", compactDeclaration(`import { z } from "zod";\n${declarations.join("\n")}`));

await Promise.all(
  ["apply", "cli", "compose", "conditions", "library", "safety", "schemas", "select"].map((name) =>
    rm(`dist/${name}.d.ts`, { force: true })
  )
);

function stripImports(source) {
  return source.replace(/^import .*;\n/gm, "");
}

function compactDeclaration(source) {
  return `${source
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*([{}:;,=|&<>\[\]()])\s*/g, "$1")
    .replace(/\bdeclare /g, "")
    .replace(/;}/g, "}")
    .replace(
      "class InterventionLibrary{private readonly unitsById;private readonly protocolsById;private readonly unitsByCategory;private readonly unitsByMechanism;",
      "class InterventionLibrary{private _;"
    )}\n`;
}
