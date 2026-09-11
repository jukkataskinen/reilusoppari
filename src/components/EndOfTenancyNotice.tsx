/**
 * Ilmoitus loppuarviosta.
 *
 * ===========================================================================
 * TÄMÄ EI SAA TULLA YLLÄTYKSENÄ LOPUSSA
 *
 * Vuokrasuhteen päättyessä kumpikin antaa toisestaan arvion ja saa oman
 * todistuksensa. Se on osa sitä, mihin allekirjoituksella sitoudutaan, joten
 * se kerrotaan **molemmille jo alussa** — vuokranantajalle vuokrasuhdetta
 * luodessa ja vuokralaiselle kutsulinkin takana (CLAUDE.md 5.1 ja 5.2,
 * DECISIONS.md 2026-09-10).
 *
 * Sama komponentti kaikissa kolmessa paikassa, jotta teksti ei voi erkaantua
 * eri sanamuodoiksi eri näkymissä. Jos se erkaantuisi, jompikumpi osapuoli
 * saisi eri käsityksen kuin toinen.
 * ===========================================================================
 */

export function EndOfTenancyNotice() {
  return (
    <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4">
      <p className="font-medium">Vuokrasuhteen päättyessä</p>
      <p className="mt-1.5 text-sm text-ink/70">
        Kun vuokrasuhde päättyy, kumpikin osapuoli voi antaa toisestaan arvion ja saa oman
        vuokratodistuksensa. Todistus syntyy aina, ja siinä näkyvät vuokrasuhteen
        perustiedot. Arvion antaminen on vapaaehtoista.
      </p>
      <p className="mt-2 text-sm text-ink/70">
        Tämä kerrotaan nyt, jotta se ei tule kummallekaan yllätyksenä lopussa.
      </p>
    </div>
  );
}
