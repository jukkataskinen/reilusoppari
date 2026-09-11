/**
 * Synteettinen "valokuva" esimerkkiasiakirjoihin.
 *
 * Tarkoituksella selvästi piirretty eikä oikea valokuva: esimerkkipöytäkirja
 * ei saa näyttää siltä, että siinä olisi jonkun oikean kodin kuvia. Tekstikin
 * kertoo sen suoraan.
 */
import { createCanvas } from "@napi-rs/canvas";
import { createHash } from "node:crypto";

export interface FakePhoto {
  dataUri: string;
  sha256: string;
}

export function fakePhoto(label: string, tint: string): FakePhoto {
  const canvas = createCanvas(480, 360);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 480, 360);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(1, tint);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 480, 360);

  ctx.strokeStyle = "rgba(27,42,65,0.18)";
  ctx.lineWidth = 6;
  ctx.strokeRect(40, 40, 400, 280);

  ctx.fillStyle = "rgba(27,42,65,0.55)";
  ctx.font = "28px sans-serif";
  ctx.fillText(label, 60, 180);
  ctx.font = "18px sans-serif";
  ctx.fillText("esimerkkikuva", 60, 214);

  const jpeg = canvas.toBuffer("image/jpeg", 80);

  return {
    dataUri: "data:image/jpeg;base64," + jpeg.toString("base64"),
    sha256: createHash("sha256").update(jpeg).digest("hex"),
  };
}
