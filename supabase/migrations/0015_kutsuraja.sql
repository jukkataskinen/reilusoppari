-- =============================================================================
-- Kutsuraja per käyttäjä per endpoint per minuutti
--
-- MIKSI JUURI NYT
--
-- Kuitin luku on ensimmäinen reitti tässä sovelluksessa, jossa yksi kutsu
-- maksaa suoraan oikeaa rahaa (Anthropic-kutsu). Kuvakoon raja rajoittaa
-- yhden kutsun hintaa muttei kutsujen määrää: rikkinäinen silmukka
-- selaimessa tai tahallinen hakkaus kasvattaisi laskua ilman että mikään
-- pysäyttäisi sitä.
--
-- CLAUDE.md kohta 6 vaatii rajan myös kuvien lataukseen (100/h/käyttäjä) ja
-- kutsulinkkeihin. Tämä taulu on yhteinen niille kaikille: `endpoint`
-- erottaa rajat toisistaan, joten uusi raja ei tarvitse uutta taulua.
--
-- SAMA RATKAISU KUIN KASAMASTERISSA
--
-- Jukan toinen järjestelmä (`kasamaster/app/api/_kutsuraja.js`) ratkaisee
-- saman ongelman samalla tavalla: rivi per (käyttäjä, endpoint, minuutti),
-- ja kasvatus tehdään tietokantafunktiossa. Funktio on olennainen — kaksi
-- rinnakkaista pyyntöä voisi muuten lukea saman luvun ja päättää kumpikin,
-- että tilaa on vielä yksi.
--
-- MINUUTTI PYÖRISTETÄÄN ALASPÄIN
--
-- Silloin sama arvo osuu koko minuutin ajan samaan riviin. Liukuva ikkuna
-- olisi tarkempi mutta vaatisi rivin per kutsu; tämä riittää siihen, mihin
-- rajaa tarvitaan — pysäyttämään silmukka ennen kuin lasku kasvaa.
-- =============================================================================

create table if not exists rs_kutsurajat (
  user_id uuid not null references rs_users(id) on delete cascade,
  endpoint text not null,
  -- Minuutti alaspäin pyöristettynä.
  minuutti timestamptz not null,
  maara int not null default 0,
  primary key (user_id, endpoint, minuutti)
);

-- Vanhat rivit siivotaan ajoittain; indeksi tekee siitä halvan.
create index if not exists rs_kutsurajat_minuutti_idx on rs_kutsurajat(minuutti);

/*
  Kasvattaa laskuria ja palauttaa uuden arvon.

  `security definer`, koska taululla ei ole select-policya eikä sitä ole
  tarkoituskaan olla: kutsuraja on palvelun kirjanpitoa, ei käyttäjän tietoa.
  `search_path` kiinnitetään, jottei kutsuja voi ohjata funktiota toiseen
  skeemaan.

  Atomisuus tulee `on conflict do update`:sta: kaksi rinnakkaista kutsua
  päätyy samalle riville ja kumpikin saa oman järjestysnumeronsa.
*/
create or replace function rs_kasvata_kutsuraja(
  p_user_id uuid,
  p_endpoint text,
  p_minuutti timestamptz
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uusi int;
begin
  insert into rs_kutsurajat (user_id, endpoint, minuutti, maara)
  values (p_user_id, p_endpoint, p_minuutti, 1)
  on conflict (user_id, endpoint, minuutti)
  do update set maara = rs_kutsurajat.maara + 1
  returning maara into uusi;

  return uusi;
end;
$$;

alter table rs_kutsurajat enable row level security;

-- Ei policya: kutsuraja ei ole kenenkään käyttäjän tietoa, eikä sitä lueta
-- käyttäjän tunnisteella. Sovellus kutsuu funktiota service_rolella.
revoke all on function rs_kasvata_kutsuraja(uuid, text, timestamptz) from public;
grant execute on function rs_kasvata_kutsuraja(uuid, text, timestamptz) to service_role;
