-- =============================================================================
-- Ilmoituksen toiston esto (CLAUDE.md 5.5)
--
-- Vuokranmaksun muistutukset lähtevät cron-ajosta, joka käy kaikki avoimet
-- kaudet läpi päivittäin. Sama viesti on siis tarjolla joka päivä sen jälkeen,
-- kun sen hetki on ohitettu — ja ilman estoa vuokralainen saisi saman
-- muistutuksen joka aamu.
--
-- `dedupe_key` on viestin ja kauden yhdistelmä, esimerkiksi
-- `rent.reminder.firm:<kauden uuid>`. Uniikkirajoite tekee toiston
-- mahdottomaksi myös silloin, kun kaksi cron-ajoa osuu päällekkäin: toinen
-- insertti kaatuu eikä lähetä mitään.
--
-- Rajoite sallii NULLin, koska kaikki ilmoitukset eivät ole ketjun osia.
-- Kertaluonteisella ilmoituksella ei ole mitään, mitä vastaan verrata.
-- =============================================================================

alter table rs_notifications
  add column if not exists dedupe_key text;

create unique index if not exists rs_notifications_dedupe_key_idx
  on rs_notifications (dedupe_key)
  where dedupe_key is not null;

comment on column rs_notifications.dedupe_key is
  'Viestin ja kohteen yhdistelmä, esim. rent.reminder.firm:<uuid>. Estää saman viestin lähettämisen kahdesti.';
