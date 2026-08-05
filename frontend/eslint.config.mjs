import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare adapter build output — generated code, never edited by hand.
    ".open-next/**",
  ]),
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "react-hooks/set-state-in-effect": "off",
      // Not enabled by the Next preset, which assumes TypeScript catches it. This is
      // a plain-JS codebase, so a missing import stays silent until it throws in the
      // browser — which is exactly how `toList` shipped undefined into orders.js.
      "no-undef": "error",
    },
  },
]);

export default eslintConfig;
