-- =============================================================================
-- Plus-tilaus sidotaan asuntoon (CLAUDE.md kohta 2 ja 5.7, vaihe 5)
--
-- "12 €/asunto/v" tarkoittaa, että Plus on asunnon tilaus, ei käyttäjän.
-- Migraatio 0012 teki `rs_subscriptions`-taulusta käyttäjäkohtaisen, koska se
-- riitti salkkutilaukselle (yksi tilaus kattaa kaikki käyttäjän asunnot).
-- Plus tarvitsee tietää KUMPI asunto on maksettu — ilman tätä toisen asunnon
-- ensimmäinen tulostus näyttäisi ilmaiselta, koska käyttäjällä olisi jo
-- "voimassa oleva" plus_yearly-tilaus toisesta asunnosta.
--
-- Salkkutilaukselle sarake pysyy tyhjänä: se ei ole yhden asunnon tilaus.
-- =============================================================================

alter table rs_subscriptions
  add column if not exists property_id uuid references rs_properties(id) on delete cascade;

alter table rs_subscriptions
  add constraint rs_subscriptions_property_rule check (
    (kind = 'plus_yearly' and property_id is not null)
    or (kind = 'portfolio_yearly' and property_id is null)
  );

create index if not exists rs_subscriptions_property_idx
  on rs_subscriptions(property_id)
  where property_id is not null;
