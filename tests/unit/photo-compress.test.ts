import { describe, expect, it } from "vitest";
import { MAX_EDGE, scaledSize } from "@/lib/photos/compress";

/**
 * Pelkkä mittalaskenta: canvas ei ole saatavilla node-ympäristössä, ja se on
 * selaimen vastuulla. Mitat sen sijaan ratkaisevat sen, paljonko dataa
 * lähtee liikkeelle asunnossa mobiiliverkossa.
 */
describe("kuvan mitat", () => {
  it("pienentää pitkän sivun mukaan ja säilyttää kuvasuhteen", () => {
    expect(scaledSize(4032, 3024)).toEqual({ width: 2000, height: 1500 });
    expect(scaledSize(3024, 4032)).toEqual({ width: 1500, height: 2000 });
  });

  it("ei suurenna pientä kuvaa", () => {
    // Suurentaminen kasvattaisi tiedostoa lisäämättä mitään näkyvää.
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("jättää rajalla olevan ennalleen", () => {
    expect(scaledSize(MAX_EDGE, 1000)).toEqual({ width: MAX_EDGE, height: 1000 });
  });

  it("selviää erittäin kapeasta kuvasta", () => {
    const tulos = scaledSize(6000, 100);
    expect(tulos.width).toBe(2000);
    expect(tulos.height).toBe(33);
  });
})
