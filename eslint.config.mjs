import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// eslint-config-next 15.x tarjoaa vielä vanhamuotoisen (.eslintrc-tyylisen)
// konfiguraation, joten se muunnetaan flat configiksi FlatCompatilla –
// tämä on Next.js 15:n virallinen suositeltu tapa (ks. DECISIONS.md).
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", ".claude/**"],
  },
];

export default eslintConfig;
