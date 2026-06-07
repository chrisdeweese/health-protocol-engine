import { execFileSync } from "node:child_process";

run("tsc", ["-p", "tsconfig.build.json"]);
run("node", ["scripts/prepare-package-data.mjs"]);
run("node", ["scripts/minify-dist.mjs"]);

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}
