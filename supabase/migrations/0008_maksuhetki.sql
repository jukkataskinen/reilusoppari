-- =============================================================================
-- Milloin vuokra merkittiin maksetuksi (Jukan linjaus 2026-09-12)
--
-- Vuokratodistuksessa maksut jaetaan kolmeen:
--
--   1. Maksettu ensimmäisellä tarkistuksella (0–3 pv)  → "maksettu ajallaan"
--   2. Maksettu muistutuksen jälkeen (4–10 pv)         → "vähän myöhässä mutta ok"
--   3. Muut                                            → "vuokranmaksu viivästynyt"
--
-- MIKSI OMA SARAKE EIKÄ `confirmed_at`
--
-- `confirmed_at` on ensimmäisen kuittauksen hetki, eikä se muutu kun
-- merkintää muutetaan — niin on tarkoituskin, koska 30 päivän muutosikkuna
-- lasketaan siitä. Mutta luokittelu tarvitsee eri tiedon: milloin merkintä
-- muuttui maksetuksi.
--
-- Ilman tätä saraketta tieto olisi vain `rs_audit_log`:issa, ja todistuksen
-- luokittelu riippuisi lokin jäsentämisestä. Loki on todiste tapahtumista,
-- ei tietolähde laskennalle.
--
-- Sarake nollataan, jos merkintä muuttuu pois maksetusta: silloin vuokraa ei
-- ole maksettu, eikä maksuhetkeä ole olemassa.
-- =============================================================================

alter table rs_rent_confirmations
  add column if not exists paid_at timestamptz;

comment on column rs_rent_confirmations.paid_at is
  'Hetki, jolloin merkintä muuttui maksetuksi. Vuokratodistuksen luokittelu perustuu tähän, ei confirmed_at-sarakkeeseen.';
