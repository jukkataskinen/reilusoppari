-- =============================================================================
-- Julkisen avaimen (anon) oikeudet pois rs_-tauluista ja kutsurajafunktiosta
--
-- MIKSI
--
-- Supabase antaa oletuksena `anon`- ja `authenticated`-rooleille oikeudet
-- jokaiseen public-skeemaan luotavaan tauluun ja funktioon (default
-- privileges). `revoke ... from public` migraatiossa 0015 ei poista niitä,
-- koska ne on myönnetty roolille nimeltä eikä PUBLICille.
--
-- Seuraus 0015:ssä: `rs_kasvata_kutsuraja` on `security definer`, ja
-- julkisella avaimella sitä voisi kutsua PostgREST:n kautta millä tahansa
-- käyttäjätunnisteella. Sillä voisi täyttää toisen käyttäjän kuvarajan ja
-- estää häneltä kuvaamisen kesken katselmuksen. Tunnisteen arvaaminen on
-- vaikeaa (uuid), mutta oikeutta ei ole syytä olla olemassa lainkaan.
--
-- Tauluissa RLS estää jo lukemisen, mutta sovellus ei käytä julkista avainta
-- mihinkään (`getAnonClient` on vain testiä varten, joka todentaa ettei
-- anon näe mitään). Oikeuksien poisto on puolustussyvyyttä: jos jokin
-- policy joskus kirjoitetaan väärin, anon ei silti pääse tauluun.
--
-- `authenticated`-rooliin ei kosketa tauluissa: policyt on kirjoitettu sille.
-- =============================================================================

revoke execute on function rs_kasvata_kutsuraja(uuid, text, timestamptz) from anon, authenticated;

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename like 'rs\_%'
  loop
    execute format('revoke all on table %I from anon', t);
  end loop;
end $$;
