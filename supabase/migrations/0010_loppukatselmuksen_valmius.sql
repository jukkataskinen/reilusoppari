-- =============================================================================
-- Loppukatselmuksen omat valmiusleimat (CLAUDE.md 5.8)
--
-- MIKSI EI VOI KÄYTTÄÄ SAMOJA SARAKKEITA
--
-- `first_seen_inspection_at` ja `inspection_ready_at` kertovat, milloin
-- vuokralainen näki alkukatselmuksen ja merkitsi olevansa siinä valmis.
-- Niiden varassa on lukitussääntö: vuokranantaja ei voi lukita katselmusta
-- ennen kuin vuokralaisella on ollut aito mahdollisuus lisätä omat kuvansa.
--
-- Jos loppukatselmus käyttäisi samoja sarakkeita, sääntö ei toimisi
-- lainkaan: vuokralainen on merkinnyt olevansa valmis vuosia aiemmin
-- alkukatselmuksessa, ja lukitus olisi mahdollinen heti — ennen kuin hän on
-- edes nähnyt loppukatselmusta.
--
-- Kaksi saraketta lisää on halpa hinta siitä, että sääntö pätee myös siinä
-- katselmuksessa, jossa sillä on eniten merkitystä. Loppukatselmus ratkaisee
-- vakuuden palautuksen.
-- =============================================================================

alter table rs_tenancy_parties
  add column if not exists final_seen_inspection_at timestamptz,
  add column if not exists final_inspection_ready_at timestamptz;

comment on column rs_tenancy_parties.final_seen_inspection_at is
  'Milloin vuokralainen avasi loppukatselmuksen ensimmäisen kerran. 24 h lasketaan tästä.';

comment on column rs_tenancy_parties.final_inspection_ready_at is
  'Milloin vuokralainen merkitsi olevansa valmis loppukatselmuksessa.';
