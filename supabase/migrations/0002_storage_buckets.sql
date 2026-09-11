-- 0002: Storage-bucketit (CLAUDE.md kohta 2)
--
-- Molemmat PRIVATE. Kuvat kodista ovat henkilötietoa (kohta 6): niihin
-- päästään vain lyhytikäisillä signed URL:eilla, ei koskaan julkisella
-- osoitteella.
--
-- Rajat asetetaan tässä, ei pelkästään sovelluskoodissa. Jos koodissa on
-- joskus bugi, tietokanta pitää silti rajan — sama periaate kuin RLS:ssä.
--
--   photos     10 MB, vain JPEG ja PNG. Asiakaspää pakkaa kuvat noin 1 MB:hen
--              (max 2000 px), joten 10 MB on varaa sille että pakkaus
--              epäonnistuu tai laite tuottaa poikkeuksellisen ison tiedoston.
--              HEIC ei ole listalla: selain muuntaa sen JPEG:ksi pakkauksen
--              yhteydessä, eikä palvelimelle ole syytä päästää muotoa jota
--              se ei osaa käsitellä.
--   documents  25 MB, vain PDF. Sama raja kuin eSinetissä, koska tiedostot
--              kulkevat sen läpi allekirjoitettavaksi.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('photos', 'photos', false, 10485760, array['image/jpeg', 'image/png']),
  ('documents', 'documents', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Ei policyja `storage.objects`-tauluun: sovellus käyttää service_role-avainta
-- palvelinpuolella ja antaa käyttäjille vain signed URL:eja (max 1 h kuville,
-- CLAUDE.md kohta 6). Anon-avaimella bucketteihin ei siis pääse lainkaan,
-- mikä on tarkoitus.
