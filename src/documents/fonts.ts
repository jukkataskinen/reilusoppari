import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

export function registerDocumentFonts(): void {
  if (registered) return;
  const dir = path.join(process.cwd(), "src/documents/fonts");
  Font.register({
    family: "Jakarta",
    fonts: [
      { src: path.join(dir, "plus-jakarta-sans-400.ttf"), fontWeight: 400 },
      { src: path.join(dir, "plus-jakarta-sans-600.ttf"), fontWeight: 600 },
      { src: path.join(dir, "plus-jakarta-sans-700.ttf"), fontWeight: 700 },
    ],
  });
  registered = true;
}
