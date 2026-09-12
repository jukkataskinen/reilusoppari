-- =============================================================================
-- Laskutuksen tilatiedot (CLAUDE.md kohta 2, vaihe 5)
--
-- MAKSUTIETOJA EI TALLENNETA TÄNNE
--
-- Korttinumerot, voimassaolot ja turvakoodit eivät kulje Reilusopparin läpi
-- eivätkä päädy tähän tietokantaan. Maksaminen tapahtuu Stripen omalla
-- sivulla. Tänne jää vain se, mitä tarvitaan sen tietämiseen, mitä on
-- maksettu ja mitä käyttöoikeuksia siitä seuraa.
--
-- MIKSI `paid_at` ON OMA SARAKKEENSA
--
-- Kuluttajan peruutusoikeus lasketaan maksun hetkestä (kuluttajansuojalaki
-- 6:14). `created_at` on vuokrasuhteen luontihetki, joka voi olla viikkoja
-- aiemmin — sopimusta täytetään ja kuvataan ennen kuin maksetaan. Jos
-- määräaika laskettaisiin siitä, se olisi käyttäjän tappioksi.
--
-- MIKSI SUOSTUMUS TALLENNETAAN
--
-- Peruutusoikeus raukeaa, kun palvelu on kuluttajan nimenomaisesta
-- pyynnöstä aloitettu JA hänelle on kerrottu, että oikeus silloin raukeaa.
-- Jälkimmäisen on oltava todennettavissa jälkikäteen; ilman merkintää
-- väite "kerroimme kyllä" on pelkkä väite.
--
-- WEBHOOKIN TOISTON ESTO
--
-- Stripe lähettää saman tapahtuman uudelleen, jos vastaus ei tule perille.
-- `rs_billing_events` on tapahtumatunnisteiden lokitaulu, jonka uniikki
-- indeksi tekee käsittelystä kertaluonteisen. Ilman sitä toistettu
-- `checkout.session.completed` voisi antaa saman krediitin kahdesti.
-- =============================================================================

-- --- Vuokrasuhteen maksun hetki ja suostumus --------------------------------

alter table rs_tenancies
  add column if not exists paid_at timestamptz,
  add column if not exists withdrawal_consent_at timestamptz,
  add column if not exists signing_started_at timestamptz;

comment on column rs_tenancies.paid_at is
  'Maksun hetki. Kuluttajan 14 päivän peruutusaika lasketaan tästä, ei created_at-sarakkeesta.';

comment on column rs_tenancies.withdrawal_consent_at is
  'Milloin kuluttaja hyväksyi palvelun aloittamisen ja peruutusoikeuden raukeamisen.';

comment on column rs_tenancies.signing_started_at is
  'Milloin allekirjoituskierros lähetettiin. Tästä hetkestä palvelu on aloitettu ja peruutusoikeus rauennut.';

-- --- Salkkutilaus ------------------------------------------------------------

-- Salkku on käyttäjän tilaus, ei asunnon: se kattaa kaikki hänen asuntonsa,
-- ja asuntomäärä on tilauksen määrä (quantity). Asuntokohtainen rivi
-- tarkoittaisi, että uuden asunnon lisääminen vaatisi uuden tilauksen.
create table if not exists rs_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references rs_users(id) on delete cascade,
  kind text not null check (kind in ('portfolio_yearly','plus_yearly')),
  stripe_subscription_id text not null unique,
  quantity int not null default 1,
  status text not null check (status in ('active','past_due','canceled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rs_subscriptions_user_idx on rs_subscriptions(user_id);

-- --- Webhookien toiston esto -------------------------------------------------

create table if not exists rs_billing_events (
  id uuid primary key default gen_random_uuid(),
  -- Stripen tapahtumatunniste. Uniikki: sama tapahtuma käsitellään kerran.
  stripe_event_id text not null unique,
  event_type text not null,
  handled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- --- RLS ---------------------------------------------------------------------

alter table rs_subscriptions enable row level security;
alter table rs_billing_events enable row level security;

-- Sovellus ajaa service_rolella, joka ohittaa RLS:n; rajaus on koodissa
-- (`db/access.ts`). Policyt ovat puolustussyvyyttä sen rinnalla.
create policy rs_subscriptions_own on rs_subscriptions
  for select using (user_id = rs_current_user_id());

-- Laskutustapahtumat eivät kuulu kenellekään käyttäjälle: ne ovat
-- toiston eston kirjanpitoa. Ei select-policya lainkaan.

grant select on rs_subscriptions to authenticated;

-- --- updated_at --------------------------------------------------------------

create trigger rs_subscriptions_set_updated_at
  before update on rs_subscriptions
  for each row execute function rs_set_updated_at();
