-- =============================================================================
-- Osapuolten tunnistetiedot sopimukseen (Jukan päätös 2026-09-11)
--
-- MUUTOS AIEMPAAN LINJAUKSEEN
--
-- Migraatio 0001 sanoo "EI henkilötunnusta missään". Jukka on muuttanut tätä:
-- suomalaisessa vuokrasopimuksessa osapuolet yksilöidään henkilötunnuksella,
-- ja ilman sitä sopimus on perinnässä ja käräjäoikeudessa heikompi.
--
-- Peruste käsittelylle on tietosuojalaki 1050/2018 § 29: henkilötunnusta saa
-- käsitellä, kun rekisteröidyn yksiselitteinen yksilöinti on tärkeää
-- osapuolten oikeuksien ja velvollisuuksien toteuttamiseksi. Vuokrasuhde ja
-- siihen liittyvä saatava ovat juuri tällainen tilanne.
--
-- MITEN RISKI PIDETÄÄN PIENENÄ
--
-- 1. Henkilötunnus tallennetaan VAIN salattuna (AES-256-GCM,
--    `src/lib/identity/crypto.ts`). Avain on ympäristömuuttujassa, ei
--    kannassa: tietokantavedos ei siis sisällä henkilötunnuksia.
-- 2. Se ei ole indeksoitu eikä haettavissa. Kannasta ei voi kysyä
--    "kuka on 131052-308T" — salattu arvo on joka rivillä erilainen.
-- 3. Se puretaan vain asiakirjaa muodostettaessa ja näytettäväksi sille,
--    jota se koskee (peitettynä: 131052-***T).
--
-- MIKSI TIEDOT OVAT OSAPUOLIRIVILLÄ EIKÄ VAIN KÄYTTÄJÄSSÄ
--
-- Sopimus on asiakirja tietyltä hetkeltä. Jos tiedot olisivat vain
-- `rs_users`-rivillä, profiilin muokkaus muuttaisi takautuvasti sitä, mitä
-- allekirjoitetussa sopimuksessa lukee. `rs_users`-kentät ovat siis vain
-- vuokranantajan omat perustiedot, joilla lomake esitäytetään.
-- =============================================================================

-- --- Vuokranantajan perustiedot: esitäyttöä varten, ei sopimuksen totuus -----

alter table rs_users
  add column if not exists party_type text not null default 'henkilo'
    check (party_type in ('henkilo','yritys')),
  -- Salattu. Selkokielisenä tätä ei kirjoiteta kantaan missään tilanteessa.
  add column if not exists party_id_encrypted text,
  add column if not exists business_id text,
  -- Yrityksen puolesta allekirjoittava ihminen. Yritys ei allekirjoita itse.
  add column if not exists signatory_name text;

comment on column rs_users.party_id_encrypted is
  'Salattu tunniste (AES-256-GCM, src/lib/identity/crypto.ts). Vain esitäyttöä varten.';

-- --- Sopimuksen osapuolet: nämä ovat ne, jotka asiakirjaan tulostuvat -------

alter table rs_tenancy_parties
  add column if not exists party_name text,
  add column if not exists party_type text not null default 'henkilo'
    check (party_type in ('henkilo','yritys')),
  add column if not exists party_id_encrypted text,
  add column if not exists business_id text,
  add column if not exists signatory_name text,
  add column if not exists phone text,
  -- Sopimukseen tulostuva sähköposti. Eri asia kuin `invite_email`, joka
  -- kertoo mihin kutsu lähetettiin ja jolla kirjautuminen tarkistetaan.
  add column if not exists contact_email text;

comment on column rs_tenancy_parties.party_id_encrypted is
  'Salattu henkilötunnus tai y-tunnus. Puretaan vain asiakirjaa varten ja omalle osapuolelle peitettynä.';

comment on column rs_tenancy_parties.contact_email is
  'Sopimukseen tulostuva osoite. invite_email on kutsun kohde, ei sama asia.';

-- Yrityksellä on oltava y-tunnus ja allekirjoittaja, henkilöllä ei kumpaakaan.
-- Tarkistus on kannassa eikä vain lomakkeella: puolikas yritysosapuoli
-- tuottaisi sopimuksen, jossa lukee yrityksen nimi ilman allekirjoittajaa.
alter table rs_tenancy_parties
  drop constraint if exists rs_tenancy_parties_yritys_tiedot;

alter table rs_tenancy_parties
  add constraint rs_tenancy_parties_yritys_tiedot check (
    party_type = 'henkilo'
    or (business_id is not null and signatory_name is not null)
  );
