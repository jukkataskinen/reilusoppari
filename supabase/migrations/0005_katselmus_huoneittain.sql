-- =============================================================================
-- Katselmus kuvataan huoneittain (Jukan linjaus 2026-09-11)
--
-- ALKUPERÄINEN MALLI OLI LIIAN TIUKKA
--
-- Migraatiossa 0001 kuva kiinnittyi checkpointiin: ennalta määrättyyn
-- kohtaan asunnossa. Jukka linjasi toisin:
--
--   "Alkukatselmuksessa sen verran, että voit ohjeistaa ottamaan kuvia
--    huoneittain, mutta älä pakota ottamaan kuvia mistään tietystä kohdasta,
--    vaan molemmat osapuolet saavat ottaa haluamansa kuvat."
--
-- Kuva kiinnittyy siis HUONEESEEN, ei kohtaan. Jokaisella kuvalla on lisäksi
-- vapaaehtoinen selite (`note`, on jo olemassa): miksi juuri tämä kohta on
-- kuvattu. Selite on vapaaehtoinen, koska pakollinen kenttä johtaisi
-- tyhjänpäiväisiin teksteihin, ja tyhjä selite on rehellisempi kuin "ok".
--
-- MIKSI HUONE ON TEKSTIÄ EIKÄ VIITE TAULUUN
--
-- Huoneluettelo syntyy asunnon tyypistä ja huoneluvusta, ja kumpi tahansa
-- osapuoli voi kuvata huoneen, jota listalla ei ole. Erillinen huonetaulu
-- vaatisi rivin luomista ennen ensimmäistä kuvaa — ja huone ilman kuvia ei
-- ole mitään. Näin lisätty huone syntyy siitä, että joku kuvaa sen.
--
-- `checkpoint_id` jää paikalleen: loppukatselmuksessa ja huoltokirjassa
-- kuvan voi haluta kiinnittää tiettyyn kohtaan. Se on nyt valinnainen
-- tarkennus huoneen sisällä, ei kuvan paikka.
-- =============================================================================

alter table rs_photos
  add column if not exists room text;

comment on column rs_photos.room is
  'Huone, jossa kuva on otettu. Vapaa teksti: huoneluettelo on ehdotus, ei rajoite.';

-- Pöytäkirja luetaan huone kerrallaan, kuvat aikajärjestyksessä.
create index if not exists rs_photos_inspection_room_idx
  on rs_photos (inspection_id, room, taken_at_server);
