import { execFileSync } from "node:child_process";

for (const script of ["typecheck", "build", "test", "catalog:check", "library:stats", "pack:dry"]) {
  execFileSync("npm", ["run", script], { stdio: "inherit" });
}
