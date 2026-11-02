import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }

    if (specifier.startsWith("@/")) {
      const base = resolve(process.cwd(), "src", specifier.slice(2));
      const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, resolve(base, "index.ts")];
      const match = candidates.find((candidate) => existsSync(candidate));
      if (match) return { url: pathToFileURL(match).href, shortCircuit: true };
    }

    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !extname(specifier)) {
      for (const suffix of [".ts", ".tsx", ".mjs", ".js"]) {
        try {
          return nextResolve(`${specifier}${suffix}`, context);
        } catch {}
      }
    }

    return nextResolve(specifier, context);
  },
});
