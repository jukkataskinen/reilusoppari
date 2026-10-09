-- =============================================================================
-- Kehitysehdotukset: yhteinen tilakäytäntö (CLAUDE.md, Jukan päätös 8.10.2026,
-- docs/kehitysehdotukset.md)
--
-- Jukan päätös koskee kaikkia sovelluksia ja määrittelee yhden tilakoneen:
--   uusi -> hyvaksytty (issue luotu) -> tyon_alla (PR avattu)
--        -> testattavana (PR yhdistetty) -> valmis (käyttäjälle ilmoitettu)
-- sivupolkuina hylätty (miltä tilalta tahansa) ja testattavana -> tyon_alla
-- ("tarvitsee muutoksen"). Uutta taulua ei tehdä (spekin ohje) — tämä
-- laajentaa migraation 0018 `rs_feature_requests`-taulua.
--
-- VANHOJEN RIVIEN SIIRTO
--
-- Vanha tila oli vapaamuotoisempi (new/planned/in_progress/done/declined) ja
-- ilman GitHub-seurantaa. Siirto on yksiselitteinen, koska vanhoja tiloja oli
-- tasan viisi ja uusia kuusi (testattavana on kokonaan uusi, ei vanhaa
-- vastinetta eikä siis mitään siirrettävää siihen):
--   new -> uusi, planned -> hyvaksytty, in_progress -> tyon_alla,
--   done -> valmis, declined -> hylatty.
-- Ei tietohäviötä: otsikko, kuvaus, vastaus ja käsittelyaika säilyvät.
--
-- GITHUB-SEURANTA
--
-- `github_issue_number` yhdistää ehdotuksen GitHub-issueen webhookista
-- tulevia tapahtumia varten (ks. src/app/api/github/webhook). Uniikki, koska
-- sama issue kuuluu tasan yhteen ehdotukseen. `approved_description` on
-- käsittelijän hyväksynnän yhteydessä muokkaama kuvaus (henkilötiedot
-- poistettuna) — se menee issueen, alkuperäinen `description` säilyy
-- sellaisenaan käyttäjän omana tekstinä. NULL = käsittelijä ei muokannut,
-- issueen menee alkuperäinen kuvaus.
-- =============================================================================

update rs_feature_requests set status = case status
  when 'new' then 'uusi'
  when 'planned' then 'hyvaksytty'
  when 'in_progress' then 'tyon_alla'
  when 'done' then 'valmis'
  when 'declined' then 'hylatty'
  else status
end;

alter table rs_feature_requests
  drop constraint if exists rs_feature_requests_status_check;

alter table rs_feature_requests
  add constraint rs_feature_requests_status_check
  check (status in ('uusi', 'hyvaksytty', 'tyon_alla', 'testattavana', 'valmis', 'hylatty'));

alter table rs_feature_requests
  alter column status set default 'uusi';

alter table rs_feature_requests
  add column if not exists github_issue_number integer,
  add column if not exists approved_description text
    check (approved_description is null or length(approved_description) <= 5000);

create unique index if not exists rs_feature_requests_github_issue_idx
  on rs_feature_requests(github_issue_number)
  where github_issue_number is not null;
