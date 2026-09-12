-- =============================================================================
-- Pienoiskuva asiakirjoja varten (kapasiteettikorjaus 2026-09-12)
--
-- ONGELMA
--
-- Katselmuspöytäkirja upotti kuvat täydessä koossa (2000 px), vaikka ne
-- piirretään asiakirjaan 158 × 96 pisteen kokoisina. Kahdenkymmenen kuvan
-- pöytäkirja oli noin 13 MB — sata kertaa enemmän dataa kuin mitä näkyy.
--
-- Se osui neljään paikkaan kerralla: funktion muistiin ja aikarajaan,
-- `documents`-ämpärin 25 MB:n rajaan, eSinetille lähetettävän tiedoston
-- kokoon, ja vuokralaisen puhelimeen joka lataa sen mobiiliverkossa.
--
-- RATKAISU
--
-- Selain tallentaa kuvasta myös pienoiskuvan samalla kun se pakkaa
-- alkuperäisen. Asiakirja upottaa pienoiskuvan; täysikokoinen kuva jää
-- sovellukseen katsottavaksi.
--
-- MIKSI TÄMÄ EI HEIKENNÄ TODISTUSARVOA
--
-- Pöytäkirjassa oleva kuva on aina ollut pienennetty esitys. `sha256`
-- lasketaan edelleen täysikokoisesta tiedostosta, ja se on se tiiviste, joka
-- pöytäkirjassa lukee — kuva asiakirjassa on osoitus siitä, mihin tiiviste
-- viittaa, ei itse todiste.
--
-- Sarake on valinnainen: ennen tätä otetuilla kuvilla sitä ei ole, ja
-- asiakirja upottaa niille täysikokoisen kuvan kuten ennenkin.
-- =============================================================================

alter table rs_photos
  add column if not exists thumbnail_path text;

comment on column rs_photos.thumbnail_path is
  'Pienoiskuva asiakirjoihin upotettavaksi. sha256 lasketaan edelleen täysikokoisesta tiedostosta.';
