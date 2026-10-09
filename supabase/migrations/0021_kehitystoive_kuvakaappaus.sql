-- =============================================================================
-- Kehitystoiveen valinnainen kuvakaappaus (docs/kehitysehdotukset.md kohta 1,
-- PLAN.md "Valinnainen kuvakaappaus lomakkeelle" — ei toteutettu 8.10.2026
-- yötyössä, koska se vaati omaa tiedostovarastoreittiä).
--
-- Kuva poistuu samalla tavalla kuin kuittikuvat: EXIF pois palvelimella,
-- private-bucket, koko ja tyyppi rajattuina. Sarakkeet ovat suoraan tässä
-- taulussa eikä `rs_photos`-rivinä, koska rs_photos vaatii tenancy_id:n
-- (migraatio 0001) ja kuvakaappaus ei liity mihinkään vuokrasuhteeseen —
-- se on kuva sovelluksen käyttöliittymästä, ei kodista.
--
-- Kuvakaappaus on valinnainen eikä saa estää toiveen syntymistä: sovellus
-- tallentaa toiveen rivin ensin ja liittää kuvan vasta sen jälkeen
-- (src/app/kehitystoiveet/actions.ts). Sarakkeet pysyvät siis tyhjinä, jos
-- lataus epäonnistuu, eikä se ole virhe.
-- =============================================================================

alter table rs_feature_requests
  add column if not exists screenshot_storage_path text,
  add column if not exists screenshot_sha256 text,
  add column if not exists screenshot_bytes integer,
  add column if not exists screenshot_width integer,
  add column if not exists screenshot_height integer;

alter table rs_feature_requests
  drop constraint if exists rs_feature_requests_screenshot_path_check;
alter table rs_feature_requests
  add constraint rs_feature_requests_screenshot_path_check
  check (screenshot_storage_path is null or length(screenshot_storage_path) <= 300);

alter table rs_feature_requests
  drop constraint if exists rs_feature_requests_screenshot_sha256_check;
alter table rs_feature_requests
  add constraint rs_feature_requests_screenshot_sha256_check
  check (screenshot_sha256 is null or length(screenshot_sha256) = 64);

alter table rs_feature_requests
  drop constraint if exists rs_feature_requests_screenshot_bytes_check;
alter table rs_feature_requests
  add constraint rs_feature_requests_screenshot_bytes_check
  check (screenshot_bytes is null or screenshot_bytes > 0);

-- Kolme saraketta kuuluvat yhteen: joko kaikki asetettu (kuva tallennettu) tai
-- kaikki tyhjät (ei kuvaa, tai liittäminen epäonnistui). Leveys ja korkeus
-- eivät ole mukana rajoitteessa, koska ne voivat jäädä tulkitsematta kuvasta
-- muuten pätevässä tiedostossa.
alter table rs_feature_requests
  drop constraint if exists rs_feature_requests_screenshot_consistent_check;
alter table rs_feature_requests
  add constraint rs_feature_requests_screenshot_consistent_check
  check (
    (screenshot_storage_path is null) = (screenshot_sha256 is null)
    and (screenshot_storage_path is null) = (screenshot_bytes is null)
  );
