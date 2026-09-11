-- =============================================================================
-- Maksutili sopimukseen (Jukan pyyntö 2026-09-11)
--
-- Vuokrasopimuksesta on käytävä ilmi, mille tilille vuokra maksetaan. Ilman
-- sitä ensimmäinen vuokranmaksu vaatii erillisen viestin, ja juuri siinä
-- kohdassa syntyy väärinkäsityksiä.
--
-- Ei salattu, toisin kuin henkilötunnus: tilinumero on jokaisessa laskussa ja
-- jokaisessa tilisiirrossa. Sen suojaaminen salauksella antaisi väärän kuvan
-- siitä, kuinka salainen se on — ja monimutkaistaisi koodia ilman hyötyä.
-- Osapuolirajaus koskee sitä silti kuten kaikkea muutakin.
-- =============================================================================

alter table rs_users
  add column if not exists bank_account text;

alter table rs_tenancy_parties
  add column if not exists bank_account text;

comment on column rs_tenancy_parties.bank_account is
  'IBAN, jolle vuokra maksetaan. Tulostuu sopimukseen. Ei salattu: numero on joka tapauksessa jokaisessa tilisiirrossa.';
