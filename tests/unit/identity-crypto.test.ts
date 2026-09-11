import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptSensitive,
  encryptSensitive,
  generateEncryptionKey,
  hasEncryptionKey,
  MissingEncryptionKeyError,
} from "@/lib/identity/crypto";

const AIEMPI = process.env.PERSON_DATA_KEY;

beforeEach(() => {
  process.env.PERSON_DATA_KEY = generateEncryptionKey();
});

afterEach(() => {
  if (AIEMPI === undefined) delete process.env.PERSON_DATA_KEY;
  else process.env.PERSON_DATA_KEY = AIEMPI;
});

describe("arkaluonteisen arvon salaus", () => {
  it("palautuu ennalleen", () => {
    expect(decryptSensitive(encryptSensitive("131052-308T"))).toBe("131052-308T");
  });

  it("selviää ääkkösistä", () => {
    expect(decryptSensitive(encryptSensitive("Ärjylä Öö"))).toBe("Ärjylä Öö");
  });

  it("salaa saman arvon eri tavalla joka kerta", () => {
    // Muuten kannasta näkisi, ketkä kaksi osapuolta ovat sama ihminen —
    // vaikkei tunnusta saisikaan auki.
    expect(encryptSensitive("131052-308T")).not.toBe(encryptSensitive("131052-308T"));
  });

  it("ei jätä selkokielistä arvoa näkyviin", () => {
    const salattu = encryptSensitive("131052-308T");
    expect(salattu).not.toContain("131052");
    expect(salattu.startsWith("v1:")).toBe(true);
  });

  it("huomaa muutetun arvon", () => {
    // GCM eikä CBC juuri tästä syystä: vaihdettu tavu ei saa mennä läpi.
    const salattu = encryptSensitive("131052-308T");
    const osat = salattu.split(":");
    const rikottu = [osat[0], osat[1], osat[2], `${osat[3].slice(0, -2)}AA`].join(":");

    expect(() => decryptSensitive(rikottu)).toThrow();
  });

  it("ei avaa toisella avaimella salattua", () => {
    const salattu = encryptSensitive("131052-308T");
    process.env.PERSON_DATA_KEY = generateEncryptionKey();
    expect(() => decryptSensitive(salattu)).toThrow();
  });

  it("hylkää tuntemattoman muodon selvällä virheellä eikä hiljaa", () => {
    // Hiljainen null näyttäisi sopimuksessa samalta kuin "ei annettu", ja
    // asiakirja lähtisi allekirjoitettavaksi ilman osapuolen tunnistetta.
    expect(() => decryptSensitive("v9:a:b:c")).toThrow("tuntemattomassa muodossa");
    expect(() => decryptSensitive("131052-308T")).toThrow("tuntemattomassa muodossa");
  });

  it("kertoo puuttuvasta avaimesta ennen tallennusta", () => {
    delete process.env.PERSON_DATA_KEY;
    expect(hasEncryptionKey()).toBe(false);
    expect(() => encryptSensitive("x")).toThrow(MissingEncryptionKeyError);

    process.env.PERSON_DATA_KEY = Buffer.from("liian lyhyt").toString("base64");
    expect(hasEncryptionKey()).toBe(false);
  });
});
