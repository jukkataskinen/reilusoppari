import { describe, expect, it } from "vitest";
import {
  canGiveRating,
  canReply,
  certificateStage,
  certificateSubject,
  ratingDeadline,
  replyDeadline,
  REPLY_WINDOW_DAYS,
  type CertificateState,
} from "@/lib/certificates/rules";

const ALLEKIRJOITETTU = "2026-09-01T10:00:00.000Z";

const tila = (yli: Partial<CertificateState> = {}): CertificateState => ({
  signedAt: ALLEKIRJOITETTU,
  commentAt: null,
  rating: null,
  replyAt: null,
  sealedAt: null,
  now: new Date("2026-09-03T10:00:00.000Z"),
  ...yli,
});

describe("todistuksen vaiheet", () => {
  it("ei ole olemassa ennen loppukatselmuksen allekirjoitusta", () => {
    /*
      Arvio ennen allekirjoitusta olisi painostuskeino: "allekirjoita, niin
      saat hyvän arvion". Allekirjoituksen jälkeen kumpikaan ei voi enää
      muuttaa toisen tilannetta.
    */
    expect(certificateStage(tila({ signedAt: null }))).toBe("not_ready");
  });

  it("odottaa arviota seitsemän päivää", () => {
    expect(certificateStage(tila())).toBe("awaiting_rating");
  });

  it("syntyy ilman arviota, kun määräaika umpeutuu", () => {
    // Antaja ei voi estää todistuksen syntymistä jättämällä arvion
    // antamatta. Ilman arviota todistus kertoo tilastot.
    expect(certificateStage(tila({ now: new Date("2026-09-08T11:00:00.000Z") }))).toBe(
      "sealable",
    );
  });

  it("odottaa vastinetta seitsemän päivää arviosta", () => {
    const annettu = tila({
      commentAt: "2026-09-03T10:00:00.000Z",
      rating: "recommend",
      now: new Date("2026-09-05T10:00:00.000Z"),
    });
    expect(certificateStage(annettu)).toBe("awaiting_reply");
  });

  it("sinetöitävissä, kun vastine on annettu", () => {
    const vastattu = tila({
      commentAt: "2026-09-03T10:00:00.000Z",
      replyAt: "2026-09-04T10:00:00.000Z",
      now: new Date("2026-09-04T12:00:00.000Z"),
    });
    expect(certificateStage(vastattu)).toBe("sealable");
  });

  it("sinetöitävissä, kun vastineen määräaika umpeutuu", () => {
    // Vastaanottaja ei voi jättää todistusta roikkumaan olemalla tekemättä
    // mitään — ja juuri silloin todistusta eniten tarvitaan.
    const myohassa = tila({
      commentAt: "2026-09-03T10:00:00.000Z",
      now: new Date("2026-09-11T10:00:00.000Z"),
    });
    expect(certificateStage(myohassa)).toBe("sealable");
  });

  it("sinetöity pysyy sinetöitynä", () => {
    expect(certificateStage(tila({ sealedAt: "2026-09-12T10:00:00.000Z" }))).toBe("sealed");
  });
});

describe("arvion antaminen", () => {
  it("onnistuu allekirjoituksen jälkeen", () => {
    expect(canGiveRating(tila())).toBe(true);
  });

  it("ei onnistu ennen allekirjoitusta", () => {
    expect(canGiveRating(tila({ signedAt: null }))).toBe(false);
  });

  it("onnistuu vielä määräajan jälkeenkin, jos sinetöintiä ei ole tehty", () => {
    // Myöhäinen arvio on parempi kuin ei arviota. Määräaika sallii
    // sinetöinnin, se ei kiellä kirjoittamista.
    expect(canGiveRating(tila({ now: new Date("2026-09-20T10:00:00.000Z") }))).toBe(true);
  });

  it("ei onnistu enää, kun vastine on annettu", () => {
    /*
      Vastine on kirjoitettu siihen arvioon, joka silloin oli. Arvion
      muuttaminen jälkikäteen tekisi vastineesta käsittämättömän.
    */
    expect(
      canGiveRating(tila({ commentAt: "2026-09-02T10:00:00.000Z", replyAt: "2026-09-03T10:00:00.000Z" })),
    ).toBe(false);
  });

  it("ei onnistu sinetöinnin jälkeen", () => {
    expect(canGiveRating(tila({ sealedAt: "2026-09-12T10:00:00.000Z" }))).toBe(false);
  });
});

describe("vastine", () => {
  it("onnistuu seitsemän päivän ajan arviosta", () => {
    const tuore = tila({
      commentAt: "2026-09-03T10:00:00.000Z",
      now: new Date("2026-09-09T10:00:00.000Z"),
    });
    expect(canReply(tuore)).toBe(true);
  });

  it("ei onnistu määräajan jälkeen", () => {
    const vanha = tila({
      commentAt: "2026-09-03T10:00:00.000Z",
      now: new Date("2026-09-11T10:00:00.000Z"),
    });
    expect(canReply(vanha)).toBe(false);
  });

  it("ei onnistu, jos arviota ei ole annettu", () => {
    // Vastine on vastaus johonkin. Ilman arviota ei ole mihin vastata.
    expect(canReply(tila())).toBe(false);
  });

  it("ei onnistu kahdesti", () => {
    expect(
      canReply(tila({ commentAt: "2026-09-03T10:00:00.000Z", replyAt: "2026-09-04T10:00:00.000Z" })),
    ).toBe(false);
  });

  it("määräaika on tasan seitsemän päivää arviosta", () => {
    const raja = replyDeadline("2026-09-03T10:00:00.000Z");
    expect(raja?.toISOString()).toBe("2026-09-10T10:00:00.000Z");
    expect(REPLY_WINDOW_DAYS).toBe(7);
  });

  it("ilman arviota ei ole määräaikaa", () => {
    expect(replyDeadline(null)).toBeNull();
  });
});

describe("kuka arvioi kenet", () => {
  it("todistus kuuluu sille, josta se kertoo", () => {
    // Vuokranantajan arvio päätyy vuokralaisen todistukseen.
    expect(certificateSubject("landlord")).toBe("tenant");
    expect(certificateSubject("tenant")).toBe("landlord");
  });

  it("arvion määräaika lasketaan allekirjoituksesta", () => {
    expect(ratingDeadline(ALLEKIRJOITETTU)?.toISOString()).toBe("2026-09-08T10:00:00.000Z");
    expect(ratingDeadline(null)).toBeNull();
  });
});
