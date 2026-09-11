import { getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";

/**
 * Onko migraatio ajettu testikantaan?
 *
 * ===========================================================================
 * MIKSI TÄMÄ ON OLEMASSA
 *
 * Migraatiot ajetaan Supabasen SQL-editorissa käsin, eikä testiajo voi tehdä
 * sitä puolestaan. Ilman tätä uuden sarakkeen varassa oleva testi kaatuu
 * viestiin "kuvien haku epäonnistui" — joka ei kerro lukijalle mitään siitä,
 * mikä oikeasti puuttuu.
 *
 * Ohitus on tarkoituksella näkyvä: testi kertoo nimeltä, mikä migraatio
 * puuttuu. Se on eri asia kuin hiljainen ohitus, joka jäisi huomaamatta.
 *
 * Tämä ei ole lupa jättää migraatioita ajamatta. Se on tapa kertoa siitä
 * selvästi silloin, kun niin on käynyt.
 * ===========================================================================
 */
export async function hasColumn(table: string, column: string): Promise<boolean> {
  if (!hasSupabaseCredentials()) return false;

  const { error } = await getServiceClient().from(table).select(column).limit(1);
  return !error;
}

/** `true`, jos migraatio 0005 (katselmus huoneittain) on ajettu. */
export async function hasInspectionRooms(): Promise<boolean> {
  return hasColumn("rs_photos", "room");
}
