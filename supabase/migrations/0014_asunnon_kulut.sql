-- =============================================================================
-- Kulu ja kuitti ilman vuokrasuhdetta (Jukan linjaus 2026-09-12)
--
-- ONGELMA
--
-- Kulut kohdistuvat asuntoon riippumatta vuokralaisesta. Asunnon remontti
-- vuokralaisten välissä, vakuutusmaksu tyhjältä kuukaudelta tai taloyhtiön
-- erillislasku eivät kuulu kenenkään vuokrasuhteeseen. `rs_expenses.tenancy_id`
-- on jo valinnainen, mutta kuitin kuva ei ollut: `rs_photos.tenancy_id` oli
-- pakollinen, joten kuitille ei ollut paikkaa.
--
-- Ilman tätä tällainen kulu olisi pitänyt kirjata jonkun vuokralaisen alle.
-- Se olisi väärin kahdesti: kulu näyttäisi liittyvän häneen, ja se kertoisi
-- hänen vuokrasuhteestaan jotain, mitä siihen ei kuulu.
--
-- RATKAISU
--
-- `rs_photos` saa `property_id`-sarakkeen, ja `tenancy_id` muuttuu
-- valinnaiseksi. Täsmälleen toinen on aina asetettu.
--
-- MIKSI CHECK-RAJOITE EIKÄ PELKKÄ SOPIMUS
--
-- Jos molemmat voisivat olla tyhjiä, kuva jäisi ilman omistajaa eikä
-- näkyisi kenellekään — eikä mikään kertoisi siitä. Jos molemmat voisivat
-- olla asetettuja, sama kuva näkyisi kahdella eri säännöllä, ja
-- osapuolirajaus riippuisi siitä, kumpaa kysytään ensin.
-- =============================================================================

alter table rs_photos
  add column if not exists property_id uuid references rs_properties(id) on delete cascade;

alter table rs_photos
  alter column tenancy_id drop not null;

-- Täsmälleen toinen: vuokrasuhteen kuva tai asunnon kuva, ei kumpaakaan
-- molempina eikä kumpaakaan puuttuvana.
alter table rs_photos
  drop constraint if exists rs_photos_kohde;

alter table rs_photos
  add constraint rs_photos_kohde
  check (num_nonnulls(tenancy_id, property_id) = 1);

create index if not exists rs_photos_property_idx on rs_photos(property_id);

comment on column rs_photos.property_id is
  'Asunnon kuva ilman vuokrasuhdetta: kuitti kulusta, joka ei kuulu kenenkään vuokrasuhteeseen.';

-- --- RLS ---------------------------------------------------------------------
--
-- Asunnon kuva näkyy vain omistajalle. Ei `rs_is_party`-tarkistusta:
-- vuokralainen on vuokrasuhteen osapuoli muttei näe kuitteja, ja juuri
-- niitä nämä rivit ovat.
--
-- Sovellus ajaa kyselyt service_rolella, joka ohittaa RLS:n; rajaus on
-- koodissa (`db/expenses.ts`). Tämä policy on puolustussyvyyttä sen rinnalla.
create policy rs_photos_property_owner on rs_photos
  for select using (
    property_id is not null
    and exists (
      select 1 from rs_properties p
      where p.id = property_id and p.owner_user_id = rs_current_user_id()
    )
  );
