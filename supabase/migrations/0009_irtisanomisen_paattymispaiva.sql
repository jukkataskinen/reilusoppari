-- =============================================================================
-- Irtisanomisesta laskettu päättymispäivä (CLAUDE.md 5.8)
--
-- MIKSI OMA SARAKE EIKÄ `end_date`
--
-- `rs_tenancies.end_date` tarkoittaa **määräaikaisen sopimuksen** sovittua
-- päättymispäivää. Vuokrasopimusasiakirja päättelee siitä, onko sopimus
-- määräaikainen vai toistaiseksi voimassa (`documents/RentalAgreement.tsx`).
--
-- Jos irtisanomisesta laskettu päivä kirjoitettaisiin siihen, toistaiseksi
-- voimassa ollut sopimus muuttuisi taannehtivasti määräaikaiseksi — ja
-- allekirjoitetun asiakirjan sisältö muuttuisi sen jälkeen, kun se on
-- allekirjoitettu. Se on pahin mahdollinen virhe tässä tuotteessa.
--
-- `notice_ends_at` on siis eri asia: milloin vuokrasuhde tosiasiassa päättyy
-- irtisanomisen seurauksena. Se lasketaan `lib/tenancy/ending.ts`:ssä
-- irtisanomiskuukauden viimeisestä päivästä, kuten AHVL 481/1995 edellyttää.
-- =============================================================================

alter table rs_tenancies
  add column if not exists notice_ends_at date;

comment on column rs_tenancies.notice_ends_at is
  'Irtisanomisesta laskettu päättymispäivä. EI sama kuin end_date, joka on määräaikaisen sopimuksen sovittu päättymispäivä.';
