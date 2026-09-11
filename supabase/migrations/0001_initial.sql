-- 0001: Reilusopparin tietomalli (CLAUDE.md kohta 4)
--
-- Kaikissa tauluissa: id uuid, created_at, updated_at + trigger.
-- RLS päällä kaikissa. GRANTit eksplisiittisesti (CLAUDE.md / esinetti kohta 0).
--
-- ===========================================================================
-- PÄÄSYSÄÄNTÖ
--
-- Rivin näkee vain se, joka on kyseisen vuokrasuhteen osapuoli
-- (`rs_tenancy_parties`) tai asunnon omistaja. Tämä on toteutettu yhtenä
-- funktiona `rs_is_party(tenancy_id)`, jota kaikki policyt käyttävät.
--
-- HUOM kuka funktion näkökulmasta on "nykyinen käyttäjä": sovellus käyttää
-- Auth0:aa eikä Supabase Authia, joten `auth.uid()` ei ole käytettävissä.
-- Palvelinkoodi ajaa kyselyt `service_role`-avaimella ja tekee osapuolirajauksen
-- eksplisiittisesti koodissa – sama malli kuin esinetti-repossa.
--
-- RLS on siis tässä **puolustussyvyyttä**, ei ainoa suoja: se varmistaa, ettei
-- anon-avaimella pääse käsiksi mihinkään, vaikka avain vuotaisi tai joku
-- kytkisi PostgRESTin päälle vahingossa. Funktio lukee käyttäjän
-- istuntomuuttujasta `app.current_user_id`, jonka palvelin voi asettaa, jos
-- joskus siirrytään käyttäjäkohtaiseen yhteyteen.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Apufunktiot
-- ---------------------------------------------------------------------------

create or replace function rs_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

/**
 * Nykyinen käyttäjä istuntomuuttujasta. NULL jos ei asetettu (esim.
 * service_role-yhteys, joka ohittaa RLS:n muutenkin).
 */
create or replace function rs_current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- ---------------------------------------------------------------------------
-- Käyttäjät ja asunnot
-- ---------------------------------------------------------------------------

create table rs_users (
  id uuid primary key default gen_random_uuid(),
  auth0_sub text not null unique,
  email text not null,
  name text,
  phone text,
  birthdate date,
  -- Vahva tunnistautuminen tulee eSinetistä allekirjoituksen yhteydessä.
  -- EI henkilötunnusta missään (CLAUDE.md kohta 6).
  identity_verified_at timestamptz,
  free_tenancy_used boolean not null default false,
  stripe_customer_id text,
  locale text not null default 'fi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rs_properties (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references rs_users(id) on delete restrict,
  name text,
  street text not null,
  postal_code text not null,
  city text not null,
  property_type text not null check (property_type in ('kerrostalo','rivitalo','omakotitalo','muu')),
  rooms int,
  area_m2 numeric(6,1),
  housing_company text,
  tenure text check (tenure in ('osake','kiinteisto','muu')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rs_properties_owner_idx on rs_properties(owner_user_id) where archived_at is null;

-- Kuvattava kohta. `added_by_user_id` kertoo kumpi osapuoli kohdan lisäsi;
-- NULL = oletuslistalta generoitu. Vuokralaisen lisäämä kohta on
-- samanarvoinen vuokranantajan lisäämän kanssa (DECISIONS.md 2026-09-10).
create table rs_checkpoints (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references rs_properties(id) on delete cascade,
  room text not null,
  item text not null,
  position int not null default 0,
  active boolean not null default true,
  added_by_user_id uuid references rs_users(id) on delete set null,
  -- Jos kohta lisättiin yhden vuokrasuhteen katselmuksessa, se merkitään tähän.
  -- Kohta säilyy asunnolla ja käydään läpi myös loppukatselmuksessa.
  added_for_tenancy_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rs_checkpoints_property_idx on rs_checkpoints(property_id) where active;

-- ---------------------------------------------------------------------------
-- Vuokrasuhde
-- ---------------------------------------------------------------------------

create table rs_tenancies (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references rs_properties(id) on delete restrict,
  landlord_user_id uuid not null references rs_users(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft','inspection','signing','active','ending','ended','certified')),
  start_date date,
  end_date date,
  rent_amount numeric(10,2),
  rent_due_day int check (rent_due_day between 1 and 31),
  deposit_amount numeric(10,2),
  deposit_returned_at date,
  deposit_returned_amount numeric(10,2),
  notice_given_at date,
  notice_by text check (notice_by in ('landlord','tenant')),
  paid_via text check (paid_via in ('free','tenancy_29','portfolio','credit')),
  stripe_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rs_tenancies_property_idx on rs_tenancies(property_id);
create index rs_tenancies_landlord_idx on rs_tenancies(landlord_user_id);

alter table rs_checkpoints
  add constraint rs_checkpoints_tenancy_fk
  foreign key (added_for_tenancy_id) references rs_tenancies(id) on delete set null;

create table rs_tenancy_parties (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references rs_tenancies(id) on delete cascade,
  -- NULL kunnes kutsuttu on kirjautunut ensimmäisen kerran.
  user_id uuid references rs_users(id) on delete restrict,
  role text not null check (role in ('landlord','tenant')),
  invite_email text,
  -- Kutsulinkki tallennetaan VAIN tiivisteenä, kuten eSinetin allekirjoituslinkit.
  invite_token_hash text,
  invite_expires_at timestamptz,
  joined_at timestamptz,
  position int not null default 0,
  -- Katselmuksen lukitus odottaa vuokralaista: tästä nähdään milloin hänellä
  -- oli ensimmäisen kerran mahdollisuus lisätä omat kuvansa.
  first_seen_inspection_at timestamptz,
  inspection_ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenancy_id, role, position)
);

create index rs_tenancy_parties_user_idx on rs_tenancy_parties(user_id);
create index rs_tenancy_parties_tenancy_idx on rs_tenancy_parties(tenancy_id);

create table rs_contracts (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null unique references rs_tenancies(id) on delete cascade,
  template_key text not null,
  template_version int not null,
  template_data jsonb not null default '{}',
  esinetti_round_id text,
  esinetti_document_id text,
  sealed_sha256 text,
  sealed_path text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rs_inspections (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references rs_tenancies(id) on delete cascade,
  kind text not null check (kind in ('initial','final')),
  status text not null default 'open' check (status in ('open','locked','signed')),
  locked_at timestamptz,
  locked_by uuid references rs_users(id) on delete set null,
  esinetti_round_id text,
  esinetti_document_id text,
  sealed_sha256 text,
  sealed_path text,
  signed_at timestamptz,
  summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenancy_id, kind)
);

-- ---------------------------------------------------------------------------
-- Kuvat ja huoltokirja
-- ---------------------------------------------------------------------------

-- Kuvaa ei voi muokata eikä poistaa kumpikaan osapuoli. Virheellinen merkitään
-- `flagged_by`-kentällä "ei kuulu tähän" molempien nähden (CLAUDE.md kohta 2).
create table rs_photos (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references rs_tenancies(id) on delete cascade,
  inspection_id uuid references rs_inspections(id) on delete cascade,
  maintenance_entry_id uuid,
  expense_id uuid,
  checkpoint_id uuid references rs_checkpoints(id) on delete set null,
  uploader_user_id uuid not null references rs_users(id) on delete restrict,
  storage_path text not null,
  sha256 text not null,
  bytes int not null,
  width int,
  height int,
  -- Ainoa aikaleima on palvelimen. Asiakkaan ilmoittamaa kuvausaikaa ei
  -- tallenneta, eikä EXIF-dataa (erityisesti GPS) säilytetä (kohta 6).
  taken_at_server timestamptz not null default now(),
  note text,
  flagged_by uuid references rs_users(id) on delete set null,
  flagged_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rs_photos_inspection_idx on rs_photos(inspection_id);
create index rs_photos_tenancy_idx on rs_photos(tenancy_id);

create table rs_maintenance_entries (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references rs_tenancies(id) on delete cascade,
  kind text not null check (kind in ('defect','repair','note')),
  author_user_id uuid not null references rs_users(id) on delete restrict,
  title text not null,
  body text,
  resolved_at timestamptz,
  resolved_by uuid references rs_users(id) on delete set null,
  expense_id uuid,
  -- Merkintöjä ei poisteta; virheellinen merkitään peruutetuksi.
  cancelled_at timestamptz,
  cancelled_by uuid references rs_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rs_maintenance_tenancy_idx on rs_maintenance_entries(tenancy_id);

alter table rs_photos
  add constraint rs_photos_maintenance_fk
  foreign key (maintenance_entry_id) references rs_maintenance_entries(id) on delete cascade;

create table rs_maintenance_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references rs_maintenance_entries(id) on delete cascade,
  author_user_id uuid not null references rs_users(id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Vuokrakuittaukset
-- ---------------------------------------------------------------------------

create table rs_rent_periods (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references rs_tenancies(id) on delete cascade,
  period_month date not null,
  due_date date not null,
  amount numeric(10,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenancy_id, period_month)
);

create index rs_rent_periods_due_idx on rs_rent_periods(due_date);

-- Kuittaus on vuokranantajan OMA MERKINTÄ, ei todiste maksamattomuudesta.
-- Vuokralainen näkee sen ja voi kommentoida (CLAUDE.md kohta 2).
create table rs_rent_confirmations (
  id uuid primary key default gen_random_uuid(),
  rent_period_id uuid not null unique references rs_rent_periods(id) on delete cascade,
  confirmed_by uuid not null references rs_users(id) on delete restrict,
  status text not null check (status in ('paid','not_yet','partial')),
  amount_paid numeric(10,2),
  confirmed_at timestamptz not null default now(),
  tenant_comment text,
  tenant_commented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Plus: kulut ja verolaskelma
-- ---------------------------------------------------------------------------

create table rs_expenses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references rs_properties(id) on delete cascade,
  tenancy_id uuid references rs_tenancies(id) on delete set null,
  date date not null,
  amount numeric(10,2) not null,
  vat_included boolean not null default true,
  category text not null check (category in (
    'hoitovastike','rahoitusvastike_tuloutettu','rahoitusvastike_rahastoitu',
    'vuosikorjaus','perusparannus','kalusteet','matkat','vakuutus','korot','muu'
  )),
  description text,
  km numeric(8,1),
  recurring_monthly boolean not null default false,
  recurring_until date,
  receipt_photo_id uuid references rs_photos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rs_expenses_property_year_idx on rs_expenses(property_id, date);

alter table rs_photos
  add constraint rs_photos_expense_fk
  foreign key (expense_id) references rs_expenses(id) on delete set null;

alter table rs_maintenance_entries
  add constraint rs_maintenance_expense_fk
  foreign key (expense_id) references rs_expenses(id) on delete set null;

create table rs_tax_reports (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references rs_properties(id) on delete cascade,
  year int not null,
  lines jsonb not null default '[]',
  rental_income numeric(12,2),
  total_expenses numeric(12,2),
  sealed_path text,
  sealed_sha256 text,
  generated_at timestamptz,
  paid_via text check (paid_via in ('plus_yearly','portfolio')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, year)
);

-- ---------------------------------------------------------------------------
-- Todistukset
-- ---------------------------------------------------------------------------

-- `rating` on KAKSIARVOINEN: 'recommend' tai NULL (= ei suositusta).
-- Kielteistä arvoa ei ole (Jukan päätös 2026-09-10, ks. DECISIONS.md).
--
-- Toteutuksen sitova sääntö: jos rating on NULL, todistuksessa EI ole
-- suositusosiota lainkaan – ei tyhjää kohtaa, ei mainintaa, ei paikanvaraajaa.
-- Muuten kaksiarvoisuudesta tulisi kiertoteitse kolmiportainen asteikko.
create table rs_certificates (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references rs_tenancies(id) on delete cascade,
  for_role text not null check (for_role in ('tenant','landlord')),
  rating text check (rating in ('recommend')),
  comment text,
  comment_by uuid references rs_users(id) on delete set null,
  comment_at timestamptz,
  reply text,
  reply_at timestamptz,
  reply_deadline timestamptz,
  sealed_path text,
  sealed_sha256 text,
  sealed_at timestamptz,
  stats jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenancy_id, for_role)
);

create table rs_certificate_shares (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references rs_certificates(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  viewed_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rs_certificate_shares_token_idx on rs_certificate_shares(token_hash);

-- Yhteydenottolupa (vaihe 6). Luvan antaa todistuksen ANTAJA, ei sen omistaja.
create table rs_certificate_contact (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null unique references rs_certificates(id) on delete cascade,
  allowed_by_user_id uuid not null references rs_users(id) on delete cascade,
  allowed_at timestamptz not null default now(),
  revoked_at timestamptz,
  max_messages int not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keskustelu käydään portaalissa. Yhteystietoja ei tallenneta tänne eikä
-- näytetä toiselle osapuolelle – vain tunnistautumisesta todennettu nimi.
create table rs_certificate_conversations (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references rs_certificates(id) on delete cascade,
  share_id uuid references rs_certificate_shares(id) on delete set null,
  initiator_user_id uuid not null references rs_users(id) on delete cascade,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (certificate_id, initiator_user_id)
);

create table rs_certificate_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references rs_certificate_conversations(id) on delete cascade,
  author_user_id uuid not null references rs_users(id) on delete restrict,
  body text not null,
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Suosittelu, ilmoitukset, loki
-- ---------------------------------------------------------------------------

create table rs_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references rs_users(id) on delete cascade,
  referred_email text not null,
  referred_user_id uuid references rs_users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rs_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references rs_users(id) on delete cascade,
  kind text not null default 'free_tenancy',
  source_referral_id uuid references rs_referrals(id) on delete set null,
  used_on_tenancy_id uuid references rs_tenancies(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rs_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references rs_users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  user_agent text,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rs_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references rs_users(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  channel text not null check (channel in ('push','email')),
  sent_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Kaikki toimet, joilla on merkitystä riidassa. Ei henkilötunnuksia.
create table rs_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid references rs_tenancies(id) on delete set null,
  actor_user_id uuid references rs_users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index rs_audit_log_tenancy_idx on rs_audit_log(tenancy_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at -triggerit
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'rs_users','rs_properties','rs_checkpoints','rs_tenancies','rs_tenancy_parties',
    'rs_contracts','rs_inspections','rs_photos','rs_maintenance_entries',
    'rs_maintenance_comments','rs_rent_periods','rs_rent_confirmations','rs_expenses',
    'rs_tax_reports','rs_certificates','rs_certificate_shares','rs_certificate_contact',
    'rs_certificate_conversations','rs_certificate_conversation_messages',
    'rs_referrals','rs_credits','rs_push_subscriptions','rs_notifications'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on %I for each row execute function rs_set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Pääsyfunktiot
--
-- Nämä on määriteltävä VASTA taulujen jälkeen: Postgres tarkistaa
-- `language sql` -funktion rungon jo luontihetkellä, joten funktio joka
-- viittaa `rs_tenancy_parties`-tauluun ei voi syntyä ennen sitä.
-- ---------------------------------------------------------------------------

/**
 * Onko nykyinen käyttäjä tämän vuokrasuhteen osapuoli?
 *
 * `security definer`, jotta policy voi lukea `rs_tenancy_parties`-taulua
 * ilman että käyttäjällä on siihen omaa oikeutta – muuten policy kutsuisi
 * itseään rekursiivisesti.
 */
create or replace function rs_is_party(p_tenancy_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from rs_tenancy_parties p
    where p.tenancy_id = p_tenancy_id
      and p.user_id = rs_current_user_id()
  );
$$;

/** Omistaako nykyinen käyttäjä asunnon? Salkkunäkymät eivät kulje tenancyn kautta. */
create or replace function rs_owns_property(p_property_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rs_properties pr
    where pr.id = p_property_id and pr.owner_user_id = rs_current_user_id()
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS ja GRANTit
--
-- Jokainen taulu: RLS päälle, policy `rs_is_party`/`rs_owns_property`-pohjalta,
-- ja eksplisiittiset GRANTit. `service_role` ohittaa RLS:n – palvelinkoodi
-- tekee osapuolirajauksen itse, ja tämä on puolustussyvyyttä sen rinnalla.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'rs_users','rs_properties','rs_checkpoints','rs_tenancies','rs_tenancy_parties',
    'rs_contracts','rs_inspections','rs_photos','rs_maintenance_entries',
    'rs_maintenance_comments','rs_rent_periods','rs_rent_confirmations','rs_expenses',
    'rs_tax_reports','rs_certificates','rs_certificate_shares','rs_certificate_contact',
    'rs_certificate_conversations','rs_certificate_conversation_messages',
    'rs_referrals','rs_credits','rs_push_subscriptions','rs_notifications','rs_audit_log'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update, delete on %I to authenticated, service_role', t);
  end loop;
end $$;

-- Oma käyttäjärivi
create policy rs_users_self on rs_users
  for all using (id = rs_current_user_id()) with check (id = rs_current_user_id());

-- Asunnot: vain omistaja
create policy rs_properties_owner on rs_properties
  for all using (owner_user_id = rs_current_user_id())
  with check (owner_user_id = rs_current_user_id());

-- Checkpointit: omistaja TAI vuokrasuhteen osapuoli. Vuokralaisen on
-- päästävä lisäämään omia kohtiaan (DECISIONS.md 2026-09-10).
create policy rs_checkpoints_access on rs_checkpoints
  for all using (
    rs_owns_property(property_id)
    or (added_for_tenancy_id is not null and rs_is_party(added_for_tenancy_id))
  )
  with check (
    rs_owns_property(property_id)
    or (added_for_tenancy_id is not null and rs_is_party(added_for_tenancy_id))
  );

-- Vuokrasuhde ja kaikki sen alla oleva: osapuolirajaus
create policy rs_tenancies_party on rs_tenancies
  for all using (rs_is_party(id)) with check (rs_is_party(id));

create policy rs_tenancy_parties_party on rs_tenancy_parties
  for all using (rs_is_party(tenancy_id)) with check (rs_is_party(tenancy_id));

create policy rs_contracts_party on rs_contracts
  for all using (rs_is_party(tenancy_id)) with check (rs_is_party(tenancy_id));

create policy rs_inspections_party on rs_inspections
  for all using (rs_is_party(tenancy_id)) with check (rs_is_party(tenancy_id));

create policy rs_photos_party on rs_photos
  for all using (rs_is_party(tenancy_id)) with check (rs_is_party(tenancy_id));

create policy rs_maintenance_entries_party on rs_maintenance_entries
  for all using (rs_is_party(tenancy_id)) with check (rs_is_party(tenancy_id));

create policy rs_maintenance_comments_party on rs_maintenance_comments
  for all using (
    exists (select 1 from rs_maintenance_entries e
            where e.id = entry_id and rs_is_party(e.tenancy_id))
  )
  with check (
    exists (select 1 from rs_maintenance_entries e
            where e.id = entry_id and rs_is_party(e.tenancy_id))
  );

create policy rs_rent_periods_party on rs_rent_periods
  for all using (rs_is_party(tenancy_id)) with check (rs_is_party(tenancy_id));

create policy rs_rent_confirmations_party on rs_rent_confirmations
  for all using (
    exists (select 1 from rs_rent_periods p
            where p.id = rent_period_id and rs_is_party(p.tenancy_id))
  )
  with check (
    exists (select 1 from rs_rent_periods p
            where p.id = rent_period_id and rs_is_party(p.tenancy_id))
  );

-- Kulut ja verolaskelma ovat VAIN vuokranantajan: vuokralaisella ei ole
-- mitään asiaa toisen kirjanpitoon.
create policy rs_expenses_owner on rs_expenses
  for all using (rs_owns_property(property_id)) with check (rs_owns_property(property_id));

create policy rs_tax_reports_owner on rs_tax_reports
  for all using (rs_owns_property(property_id)) with check (rs_owns_property(property_id));

create policy rs_certificates_party on rs_certificates
  for all using (rs_is_party(tenancy_id)) with check (rs_is_party(tenancy_id));

create policy rs_certificate_shares_party on rs_certificate_shares
  for all using (
    exists (select 1 from rs_certificates c
            where c.id = certificate_id and rs_is_party(c.tenancy_id))
  )
  with check (
    exists (select 1 from rs_certificates c
            where c.id = certificate_id and rs_is_party(c.tenancy_id))
  );

create policy rs_certificate_contact_party on rs_certificate_contact
  for all using (
    exists (select 1 from rs_certificates c
            where c.id = certificate_id and rs_is_party(c.tenancy_id))
  )
  with check (allowed_by_user_id = rs_current_user_id());

-- Keskusteluun pääsee aloittaja TAI vuokrasuhteen osapuoli. Vuokralainen näkee
-- keskustelun kokonaisuudessaan – siitä puhutaan hänestä (DECISIONS.md).
create policy rs_certificate_conversations_access on rs_certificate_conversations
  for all using (
    initiator_user_id = rs_current_user_id()
    or exists (select 1 from rs_certificates c
               where c.id = certificate_id and rs_is_party(c.tenancy_id))
  )
  with check (initiator_user_id = rs_current_user_id());

create policy rs_certificate_conversation_messages_access on rs_certificate_conversation_messages
  for all using (
    exists (
      select 1 from rs_certificate_conversations v
      join rs_certificates c on c.id = v.certificate_id
      where v.id = conversation_id
        and (v.initiator_user_id = rs_current_user_id() or rs_is_party(c.tenancy_id))
    )
  )
  with check (author_user_id = rs_current_user_id());

create policy rs_referrals_self on rs_referrals
  for all using (referrer_user_id = rs_current_user_id())
  with check (referrer_user_id = rs_current_user_id());

create policy rs_credits_self on rs_credits
  for all using (user_id = rs_current_user_id()) with check (user_id = rs_current_user_id());

create policy rs_push_subscriptions_self on rs_push_subscriptions
  for all using (user_id = rs_current_user_id()) with check (user_id = rs_current_user_id());

create policy rs_notifications_self on rs_notifications
  for all using (user_id = rs_current_user_id()) with check (user_id = rs_current_user_id());

-- Auditlokia luetaan vain osapuolena; kirjoitus tapahtuu palvelimelta.
create policy rs_audit_log_party on rs_audit_log
  for select using (tenancy_id is not null and rs_is_party(tenancy_id));
