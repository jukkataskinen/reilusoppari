import { describe, expect, it } from "vitest";
import {
  defaultCheckpoints,
  groupByRoom,
  type PropertyType,
} from "@/lib/property/default-checkpoints";

const TYPES: PropertyType[] = ["kerrostalo", "rivitalo", "omakotitalo", "muu"];

describe("oletus-checkpointit", () => {
  it("yksiössä ainoa huone on olohuone ja makuuhuone yhdessä", () => {
    const rooms = groupByRoom(defaultCheckpoints("kerrostalo", 1)).map((g) => g.room);
    expect(rooms).toContain("Olohuone / makuuhuone");
    expect(rooms).not.toContain("Makuuhuone");
  });

  it("kaksiossa on olohuone ja yksi makuuhuone ilman numeroa", () => {
    const rooms = groupByRoom(defaultCheckpoints("kerrostalo", 2)).map((g) => g.room);
    expect(rooms).toContain("Olohuone");
    expect(rooms).toContain("Makuuhuone");
    expect(rooms).not.toContain("Makuuhuone 1");
  });

  it("kolmesta huoneesta ylöspäin makuuhuoneet numeroidaan", () => {
    const rooms = groupByRoom(defaultCheckpoints("kerrostalo", 4)).map((g) => g.room);
    expect(rooms).toContain("Makuuhuone 1");
    expect(rooms).toContain("Makuuhuone 3");
    expect(rooms).not.toContain("Makuuhuone 4");
  });

  it("keittiö on aina mukana, vaikka huoneluku on 1", () => {
    // Suomalainen huoneluku EI sisalla keittiota: 1h+k on yksi huone ja keittio.
    const rooms = groupByRoom(defaultCheckpoints("kerrostalo", 1)).map((g) => g.room);
    expect(rooms).toContain("Keittiö");
  });

  it("sauna on rivi- ja omakotitalossa, ei kerrostalossa", () => {
    const hasSauna = (t: PropertyType) =>
      groupByRoom(defaultCheckpoints(t, 3))
        .map((g) => g.room)
        .includes("Sauna");

    expect(hasSauna("rivitalo")).toBe(true);
    expect(hasSauna("omakotitalo")).toBe(true);
    expect(hasSauna("kerrostalo")).toBe(false);
  });

  it("ulkotilat riippuvat asuntotyypistä", () => {
    const outdoor = (t: PropertyType) =>
      groupByRoom(defaultCheckpoints(t, 3)).find((g) => g.room === "Ulkotilat")?.items ?? [];

    expect(outdoor("kerrostalo")).toContain("Parveke");
    expect(outdoor("omakotitalo")).toContain("Katto ja räystäät");
    expect(outdoor("kerrostalo")).not.toContain("Katto ja räystäät");
  });

  it("mittarilukemat ja avaimet ovat mukana kaikilla tyypeillä", () => {
    for (const type of TYPES) {
      const general = groupByRoom(defaultCheckpoints(type, 2)).find(
        (g) => g.room === "Yleiset",
      )?.items;
      expect(general, type).toContain("Avaimet");
      expect(general, type).toContain("Vesimittarin lukema");
    }
  });

  it("kestää puuttuvan tai järjettömän huoneluvun", () => {
    for (const rooms of [null, undefined, 0, -3, 999, Number.NaN]) {
      const seeds = defaultCheckpoints("kerrostalo", rooms as number);
      expect(seeds.length, String(rooms)).toBeGreaterThan(0);
      // Ei raja-arvo-ongelmia: huoneita on aina 1-10.
      const bedrooms = groupByRoom(seeds).filter((g) => g.room.startsWith("Makuuhuone"));
      expect(bedrooms.length, String(rooms)).toBeLessThanOrEqual(9);
    }
  });

  it("ryhmittely säilyttää läpikävelyjärjestyksen", () => {
    const rooms = groupByRoom(defaultCheckpoints("omakotitalo", 3)).map((g) => g.room);
    // Eteinen ensin, yleiset viimeisena - sama jarjestys toistetaan
    // loppukatselmuksessa, jotta kohdat voi verrata pari kerrallaan.
    expect(rooms[0]).toBe("Eteinen");
    expect(rooms[rooms.length - 1]).toBe("Yleiset");
    expect(rooms.indexOf("Keittiö")).toBeLessThan(rooms.indexOf("Kylpyhuone"));
  });

  it("ei tuota kahta samaa kohtaa samaan huoneeseen", () => {
    for (const type of TYPES) {
      for (const group of groupByRoom(defaultCheckpoints(type, 5))) {
        expect(new Set(group.items).size, `${type} ${group.room}`).toBe(group.items.length);
      }
    }
  });
});
