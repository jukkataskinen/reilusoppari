/**
 * Käyttöliittymän tekstit (CLAUDE.md kohta 2). Rakenne sallii sv/en myöhemmin.
 *
 * Sävy on sama kuin sivustolla: sinuttelu, rauhallinen, ei huutomerkkejä,
 * ei emojeja. Mitattava sitä vasten, että teksti kuulostaa ystävälliseltä
 * naapurilta joka sattuu olemaan kirjanpitäjä.
 */
export const fi = {
  app: {
    name: "Reilusoppari",
    tagline: "Vuokrasuhteen yhteinen työkalu",
  },
  nav: {
    properties: "Asunnot",
    tenancies: "Vuokrasuhteet",
    ownDetails: "Omat tiedot",
    parties: "Osapuolten tiedot",
    inspection: "Alkukatselmus",
    signing: "Allekirjoitus",
    settings: "Asetukset",
  },
  role: {
    landlord: "Vuokranantaja",
    tenant: "Vuokralainen",
  },
  tenancyStatus: {
    draft: "Luonnos",
    inspection: "Katselmus kesken",
    signing: "Odottaa allekirjoitusta",
    active: "Voimassa",
    ending: "Päättymässä",
    ended: "Päättynyt",
    certified: "Todistukset annettu",
  },
  inspection: {
    title: "Alkukatselmus",
    finalTitle: "Loppukatselmus",
    addOwnCheckpoint: "Lisää oma kohta",
    // Oletuslista on muistin tueksi, ei rajoite (DECISIONS.md).
    listIsAHint: "Lista on muistin tueksi. Kuvaa myös se, minkä itse katsot tärkeäksi.",
    ready: "Olen valmis",
    lock: "Lukitse katselmus",
    lockWaitingForTenant: "Odotetaan, että vuokralainen on käynyt kohdat läpi",
  },
  rent: {
    confirmQuestion: "Maksoiko {name} {amount} eräpäivään {date} mennessä?",
    paid: "Kyllä, maksoi",
    notYet: "Ei vielä",
    partial: "Osittain",
  },
  tenancy: {
    new: "Uusi vuokrasuhde",
    tenant: "Vuokralainen",
    tenants: "Vuokralaiset",
    startDate: "Alkupäivä",
    endDate: "Päättymispäivä",
    rent: "Vuokra",
    dueDay: "Eräpäivä",
    deposit: "Vakuus",
    fixedTerm: "Määräaikainen",
    openEnded: "Toistaiseksi voimassa",
    invitePending: "Kutsu lähettämättä",
    inviteSent: "Kutsu lähetetty",
    joined: "Liittynyt",
  },
  invite: {
    title: "Sinut on kutsuttu vuokrasuhteeseen",
    signIn: "Kirjaudu ja liity",
    expired:
      "Tämä kutsulinkki ei ole voimassa. Pyydä vuokranantajaa lähettämään uusi.",
    wrongAccount:
      "Tämä kutsu on tarkoitettu toiselle sähköpostiosoitteelle. Kirjaudu sillä osoitteella, johon kutsu lähetettiin.",
  },
  certificate: {
    // Kerrotaan jo alussa, ei lopussa (DECISIONS.md 2026-09-10).
    upfrontNotice:
      "Vuokrasuhteen päättyessä kumpikin antaa toisestaan arvion ja saa oman todistuksensa.",
    recommend: "Suosittelen",
    noRecommendation: "En anna suositusta",
  },
  common: {
    save: "Tallenna",
    cancel: "Peruuta",
    continue: "Jatka",
    back: "Takaisin",
  },
} as const;

export type Translations = typeof fi;
