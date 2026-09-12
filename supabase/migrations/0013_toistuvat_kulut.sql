-- =============================================================================
-- Toistuvat kuukausikulut (Jukan linjaus 2026-09-12)
--
-- ONGELMA
--
-- Hoitovastike on sama summa joka kuukausi. Sen kirjaaminen kuukausittain on
-- kaksitoista käsin tehtyä kirjausta vuodessa asuntoa kohden, ja jokainen
-- niistä voi jäädä tekemättä. Unohtunut kirjaus ei näy laskelmassa
-- virheenä — se vain tekee vuosikuluista liian pienet.
--
-- RATKAISU: KAUSI, EI TAPAHTUMA
--
-- Toistuva kulu on kuukausisumma ja väli, jolla se on voimassa. Vuosikulu
-- lasketaan siitä (`lib/expenses/recurring.ts`).
--
-- MUUTOS ON UUSI KAUSI
--
-- Kun vastike nousee maaliskuussa, tammi–helmikuu on maksettu vanhalla
-- summalla. Jos summaa muutettaisiin paikalleen, koko vuosi laskettaisiin
-- uudella — ja vuosikulu olisi väärä juuri siltä vuodelta, jolta se
-- ilmoitetaan. Siksi muutos päättää vanhan kauden ja aloittaa uuden.
--
-- `series_id` sitoo saman kulun kaudet yhteen. Ensimmäisen kauden
-- `series_id` on sen oma `id`.
--
-- KUUKAUSI ON PIENIN YKSIKKÖ
--
-- `starts_month` ja `ends_month` ovat päivämääriä, mutta aina kuukauden
-- ensimmäinen päivä — check-rajoite pitää siitä huolen. Vastike on
-- kuukausimaksu: se joko maksetaan siltä kuukaudelta tai ei. Päivätarkkuus
-- pakottaisi keksimään säännön sille, lasketaanko 15. päivä alkanut
-- kuukausi, ja mikä tahansa sääntö olisi väärä jossain tapauksessa.
--
-- KULU ON ASUNNON, EI VUOKRASUHTEEN
--
-- Ei `tenancy_id`-saraketta lainkaan. Vastike juoksee myös tyhjän kuukauden
-- yli, ja vuokralainen voi vaihtua kesken vuoden. Vuokrasuhteeseen sidottu
-- toistuva kulu katkeaisi vuokralaisen vaihtuessa ilman että kukaan huomaa.
-- =============================================================================

create table if not exists rs_recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references rs_properties(id) on delete cascade,

  -- Saman kulun kaudet. Ensimmäisellä kaudella tämä on rivin oma id.
  series_id uuid not null,

  category text not null,
  description text,

  -- Euroa kuukaudessa. Positiivinen: nollan suuruinen toistuva kulu on
  -- kirjausvirhe, ja negatiivinen vähentäisi vuosikuluja huomaamatta.
  monthly_amount numeric(10,2) not null check (monthly_amount > 0),

  starts_month date not null check (extract(day from starts_month) = 1),
  ends_month date check (extract(day from ends_month) = 1),

  -- Kausi ei voi päättyä ennen kuin alkaa.
  check (ends_month is null or ends_month >= starts_month),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rs_recurring_expenses_property_idx
  on rs_recurring_expenses(property_id);

create index if not exists rs_recurring_expenses_series_idx
  on rs_recurring_expenses(series_id);

-- Yksi avoin kausi per sarja.
--
-- Kaksi avointa kautta laskisi saman kuukauden kahdesti, eikä se näkyisi
-- laskelmassa virheenä — vain liian suurina vuosikuluina. Osittainen uniikki
-- indeksi estää sen tietokannassa asti, ei pelkässä koodissa.
create unique index if not exists rs_recurring_expenses_yksi_avoin
  on rs_recurring_expenses(series_id)
  where ends_month is null;

-- --- RLS ---------------------------------------------------------------------

alter table rs_recurring_expenses enable row level security;

-- Kulut ovat vain asunnon omistajan (CLAUDE.md 5.7). Vuokralainen on
-- vuokrasuhteen osapuoli muttei näe kuluja — siksi tässä on
-- omistajatarkistus eikä `rs_is_party`.
create policy rs_recurring_expenses_owner on rs_recurring_expenses
  for select using (
    exists (
      select 1 from rs_properties p
      where p.id = property_id and p.owner_user_id = rs_current_user_id()
    )
  );

grant select on rs_recurring_expenses to authenticated;

create trigger rs_recurring_expenses_set_updated_at
  before update on rs_recurring_expenses
  for each row execute function rs_set_updated_at();

-- --- Käyttämättömät sarakkeet pois ------------------------------------------
--
-- `rs_expenses.recurring_monthly` ja `recurring_until` ovat olleet
-- migraatiosta 0001 asti, mutta mikään koodi ei ole koskaan kirjoittanut
-- niihin: jokaisella rivillä on oletusarvo. Toistuvuus on nyt omassa
-- taulussaan, ja nämä sarakkeet tarkoittaisivat kahta tapaa ilmaista sama
-- asia — se on juuri sellainen epäselvyys, joka tuottaa myöhemmin väärän
-- summan.
alter table rs_expenses
  drop column if exists recurring_monthly,
  drop column if exists recurring_until;
