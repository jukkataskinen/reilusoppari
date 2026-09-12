import { describe, expect, it } from "vitest";
import { KUVARAJA, windowStart } from "@/lib/security/rate-limit";

/**
 * Kutsurajan ikkunalaskenta.
 *
 * Tämä on rajan ainoa puhdas osa, ja samalla se, jonka rikkoutuminen ei
 * näkyisi mitenkään: väärin laskettu ikkuna tarkoittaisi joko sitä, että
 * jokainen kutsu saa oman rivinsä (raja ei rajoita mitään) tai sitä, että
 * kaikki kutsut osuvat samaan riviin ikuisesti (raja ei vapaudu koskaan).
 */

describe("ikkunan alku", () => {
  it("minuutin ikkuna alkaa tasaminuutilta", () => {
    const alku = windowStart(new Date("2026-09-12T13:45:37.412Z"), 1);
    expect(alku.toISOString()).toBe("2026-09-12T13:45:00.000Z");
  });

  it("tunnin ikkuna alkaa tasatunnilta", () => {
    const alku = windowStart(new Date("2026-09-12T13:45:37.412Z"), 60);
    expect(alku.toISOString()).toBe("2026-09-12T13:00:00.000Z");
  });

  it("saman ikkunan kutsut saavat saman alun", () => {
    /*
      Tämä on koko mekanismin ehto: jos kaksi saman tunnin kutsua saisi eri
      arvon, ne osuisivat eri riveille eikä raja rajoittaisi mitään.
    */
    const a = windowStart(new Date("2026-09-12T13:00:01.000Z"), 60);
    const b = windowStart(new Date("2026-09-12T13:59:59.999Z"), 60);
    expect(a.toISOString()).toBe(b.toISOString());
  });

  it("eri ikkunat saavat eri alun", () => {
    // Ja tämä on toinen ehto: raja on vapauduttava ikkunan vaihtuessa.
    const a = windowStart(new Date("2026-09-12T13:59:59.999Z"), 60);
    const b = windowStart(new Date("2026-09-12T14:00:00.000Z"), 60);
    expect(a.toISOString()).not.toBe(b.toISOString());
  });

  it("varttitunnin ikkuna pyöristyy vartin tarkkuudella", () => {
    expect(windowStart(new Date("2026-09-12T13:14:59.000Z"), 15).toISOString()).toBe(
      "2026-09-12T13:00:00.000Z",
    );
    expect(windowStart(new Date("2026-09-12T13:15:00.000Z"), 15).toISOString()).toBe(
      "2026-09-12T13:15:00.000Z",
    );
  });

  it("ei muuta annettua hetkeä", () => {
    // Kutsuja voi käyttää samaa `Date`-oliota muuhunkin.
    const nyt = new Date("2026-09-12T13:45:37.412Z");
    windowStart(nyt, 60);
    expect(nyt.toISOString()).toBe("2026-09-12T13:45:37.412Z");
  });
});

describe("kuvaraja", () => {
  it("on tunnin ikkuna ja sata kuvaa", () => {
    // CLAUDE.md kohta 6: 100/h/käyttäjä.
    expect(KUVARAJA.limit).toBe(100);
    expect(KUVARAJA.windowMinutes).toBe(60);
  });

  it("on yksi yhteinen tunniste kaikille kuvareiteille", () => {
    /*
      Erilliset tunnisteet per reitti tarkoittaisivat, että kokonaismäärä
      olisi rajojen summa — eikä kukaan laskisi sitä.
    */
    expect(KUVARAJA.endpoint).toBe("kuva");
  });
});

describe("yli tunnin ikkuna", () => {
  it("kahden tunnin ikkuna ei käyttäydy kuin tunnin", () => {
    /*
      Ensimmäinen toteutus pyöristi minuuttikentän mukaan, ja minuuttikenttä
      on aina 0–59: kahden tunnin ikkunasta olisi tullut tunnin ikkuna.
      Vika ei olisi näkynyt mitenkään — raja olisi vain ollut tiukempi kuin
      pyydettiin.
    */
    const a = windowStart(new Date("2026-09-12T12:30:00.000Z"), 120);
    const b = windowStart(new Date("2026-09-12T13:30:00.000Z"), 120);
    expect(a.toISOString()).toBe(b.toISOString());
  });

  it("kahden tunnin ikkuna vaihtuu oikeassa kohdassa", () => {
    const a = windowStart(new Date("2026-09-12T13:59:59.999Z"), 120);
    const b = windowStart(new Date("2026-09-12T14:00:00.000Z"), 120);
    expect(a.toISOString()).toBe("2026-09-12T12:00:00.000Z");
    expect(b.toISOString()).toBe("2026-09-12T14:00:00.000Z");
  });

  it("vuorokauden ikkuna alkaa keskiyöstä", () => {
    expect(windowStart(new Date("2026-09-12T23:59:00.000Z"), 1440).toISOString()).toBe(
      "2026-09-12T00:00:00.000Z",
    );
  });
});
