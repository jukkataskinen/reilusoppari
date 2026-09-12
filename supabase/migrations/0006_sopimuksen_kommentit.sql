-- =============================================================================
-- Sopimusluonnoksen kommentit (CLAUDE.md 5.2)
--
-- Vuokralainen ei muokkaa sopimusta. Hän lukee luonnoksen ja kertoo, mitä
-- haluaisi muuttaa; vuokranantaja muokkaa ehtoja ja esikatselu päivittyy.
-- Ilman tätä taulua keskustelu käytäisiin puhelimessa, eikä siitä jäisi
-- mitään — ja sopimus muuttuisi ilman että kukaan muistaa miksi.
--
-- MOLEMMAT SAAVAT KOMMENTOIDA
--
-- CLAUDE.md puhuu vuokralaisen kommentista, mutta yksisuuntainen kanava on
-- outo: vuokranantajan on voitava vastata. Kumpikin kommentoi omalla
-- nimellään, ja kumpikin näkee kaiken. Sama periaate kuin kuittauksissa ja
-- huoltokirjassa: kummastakaan osapuolesta ei puhuta hänen selkänsä takana
-- palvelun sisällä.
--
-- KOMMENTTIA EI POISTETA
--
-- Ei poisto-operaatiota eikä `deleted_at`-saraketta. Jos kommentin voisi
-- poistaa, keskustelu kertoisi vain sen, mitä poistamatta jättänyt halusi
-- sen kertovan — sama sääntö kuin katselmuksen kuvilla.
-- =============================================================================

create table if not exists rs_contract_comments (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references rs_tenancies(id) on delete cascade,
  author_user_id uuid not null references rs_users(id) on delete restrict,
  -- Sama raja kuin muissa kommenttikentissä (CLAUDE.md kohta 5.5).
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rs_contract_comments_tenancy_idx
  on rs_contract_comments (tenancy_id, created_at);

alter table rs_contract_comments enable row level security;

-- Sovellus lukee service_role-avaimella ja rajaa osapuoleen koodissa
-- (`lib/db/access.ts`). RLS on puolustussyvyyttä: anon-avaimella tänne ei
-- pääse lainkaan, mikä on tarkoitus.
grant select, insert on rs_contract_comments to service_role;
