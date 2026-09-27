-- =============================================================================
-- Kehitystoiveet (DECISIONS.md 2026-09-27)
--
-- Käyttäjä jättää toiveen ja valitsee toiminnon, jota toive koskee. Toiminnot
-- ovat samat kuin ohjesivuston aiheet (src/lib/help/topics.ts), jotta toiveet
-- ryhmittyvät samoin kuin ohjeet. Toiveen voi jättää suoraan sivulta, jolloin
-- toiminto ja sivun osoite täyttyvät valmiiksi.
--
-- KUKA NÄKEE MITÄ
--
-- Reilusopparissa ei ole organisaatiota eikä pääkäyttäjää: käyttäjät ovat
-- toisilleen tuntemattomia vuokranantajia ja vuokralaisia. Siksi käyttäjä
-- näkee vain omat toiveensa. Toiveessa voi olla omaa vuokrasuhdetta koskevaa
-- tekstiä, eikä sitä saa näyttää muille käyttäjille.
--
-- Toiveet käsittelee palvelun ylläpito. Käsittelijät ovat ympäristömuuttujassa
-- FEATURE_REQUEST_ADMIN_EMAILS, ja käsittely kulkee palvelinkoodissa
-- service_role-yhteydellä. Siksi authenticated-roolille ei anneta
-- päivitysoikeutta: policy olisi tässä vain puolustussyvyyttä.
--
-- Rivi poistuu käyttäjän mukana (on delete cascade): toive on käyttäjän
-- omaa tietoa, ei vuokrasuhteen yhteistä asiakirjaa.
-- =============================================================================

create table if not exists rs_feature_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references rs_users(id) on delete cascade,
  -- Ohjesivuston aiheen tunnus (esim. "vuokranmaksu") tai "muu".
  feature text not null check (length(feature) between 1 and 60),
  -- Sivu, jolta toive jätettiin. Osoitteissa on vain tunnisteita, ei nimiä.
  page_path text check (page_path is null or length(page_path) <= 200),
  title text not null check (length(title) between 1 and 200),
  description text not null check (length(description) between 1 and 5000),
  importance text not null default 'nice'
    check (importance in ('nice', 'important', 'blocking')),
  status text not null default 'new'
    check (status in ('new', 'planned', 'in_progress', 'done', 'declined')),
  response text check (response is null or length(response) <= 5000),
  handled_by uuid references rs_users(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rs_feature_requests_user_idx
  on rs_feature_requests(user_id, created_at desc);

create index if not exists rs_feature_requests_status_idx
  on rs_feature_requests(status, created_at desc);

create trigger rs_feature_requests_set_updated_at
  before update on rs_feature_requests
  for each row execute function rs_set_updated_at();

-- --- RLS ---------------------------------------------------------------------

alter table rs_feature_requests enable row level security;

-- Käyttäjä näkee ja jättää vain omia toiveitaan.
create policy rs_feature_requests_own_select on rs_feature_requests
  for select using (user_id = rs_current_user_id());

create policy rs_feature_requests_own_insert on rs_feature_requests
  for insert with check (user_id = rs_current_user_id());

revoke all on table rs_feature_requests from public, anon;
grant select, insert on table rs_feature_requests to authenticated;
grant select, insert, update, delete on table rs_feature_requests to service_role;
