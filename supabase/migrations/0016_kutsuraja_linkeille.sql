-- =============================================================================
-- Kutsuraja julkisille linkeille (kutsu- ja jakolinkit), CLAUDE.md kohta 6
--
-- MIKSI OMA TAULU
--
-- Migraation 0015 taulu on rivi per KÄYTTÄJÄ, ja sarake viittaa
-- rs_users-tauluun. Kutsulinkin avaaja ei ole vielä käyttäjä, joten rajan
-- avaimeksi jää vain verkko-osoite. Sen pakottaminen samaan tauluun olisi
-- vaatinut viiteavaimen purkamisen — ja se heikentäisi taulua, jonka rivit
-- nyt siivoutuvat käyttäjän mukana.
--
-- IP-OSOITETTA EI TALLENNETA
--
-- IP-osoite on henkilötieto. Tauluun kirjoitetaan vain avain, joka on
-- laskettu palvelimen salaisuudella ja päivämäärällä
-- (`src/lib/security/link-rate-limit.ts`). Avaimesta ei saa osoitetta
-- takaisin ilman salaisuutta, ja päivän vaihtuessa sama osoite saa eri
-- avaimen: rivejä ei voi yhdistää toisiinsa päivien yli.
--
-- RIVIT ELÄVÄT VUOROKAUDEN
--
-- Funktio poistaa vuorokautta vanhemmat rivit jokaisella kutsulla. Rajan
-- ikkuna on minuutteja, joten sitä vanhempaa tietoa ei tarvita mihinkään,
-- eikä tarpeetonta pseudonyymiä tietoa säilytetä.
--
-- Kasvatus on tietokantafunktiossa samasta syystä kuin 0015:ssä: kaksi
-- rinnakkaista pyyntöä voisi muuten lukea saman luvun.
-- =============================================================================

create table if not exists rs_kutsurajat_linkit (
  -- HMAC(salaisuus, päivä + IP), heksana. Ei IP-osoitetta.
  avain text not null,
  endpoint text not null,
  -- Ikkunan alku pyöristettynä alaspäin.
  ikkuna timestamptz not null,
  maara int not null default 0,
  primary key (avain, endpoint, ikkuna)
);

create index if not exists rs_kutsurajat_linkit_ikkuna_idx on rs_kutsurajat_linkit(ikkuna);

create or replace function rs_kasvata_linkkiraja(
  p_avain text,
  p_endpoint text,
  p_ikkuna timestamptz
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uusi int;
begin
  -- Siivous ensin: vuorokautta vanhemmilla riveillä ei ole käyttöä.
  delete from rs_kutsurajat_linkit where ikkuna < p_ikkuna - interval '1 day';

  insert into rs_kutsurajat_linkit (avain, endpoint, ikkuna, maara)
  values (p_avain, p_endpoint, p_ikkuna, 1)
  on conflict (avain, endpoint, ikkuna)
  do update set maara = rs_kutsurajat_linkit.maara + 1
  returning maara into uusi;

  return uusi;
end;
$$;

alter table rs_kutsurajat_linkit enable row level security;

-- Ei policya: raja on palvelun kirjanpitoa, ei kenenkään käyttäjän tietoa.
revoke all on table rs_kutsurajat_linkit from public, anon, authenticated;
grant select, insert, update, delete on table rs_kutsurajat_linkit to service_role;

revoke all on function rs_kasvata_linkkiraja(text, text, timestamptz) from public, anon, authenticated;
grant execute on function rs_kasvata_linkkiraja(text, text, timestamptz) to service_role;
