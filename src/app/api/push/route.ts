import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getServiceClient } from "@/lib/db/supabase";

/**
 * Push-tilauksen tallennus ja poisto (CLAUDE.md 5.5).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: kirjautunut käyttäjä, omalle tililleen. Tilaus
 *    sidotaan istunnon käyttäjään, ei rungossa annettuun tunnisteeseen.
 * 2. Henkilötieto: endpoint on laitekohtainen tunniste. Ei lokiteta.
 * 3. Syöte: selaimen `PushSubscription`. Muoto tarkistetaan.
 * 4. IDOR: ei kohde-id:tä. Endpoint on uniikki, ja jos sama endpoint on
 *    aiemmin kuulunut toiselle tilille — sama laite, eri käyttäjä — rivi
 *    siirtyy nykyiselle. Muuten edellinen käyttäjä saisi ilmoitukset.
 * 5. Salaisuuksia ei käsitellä: VAPIDin julkinen avain on julkinen.
 * 6. Epäonnistuminen: neutraali viesti.
 * 7. Lokitus: ei endpointia eikä avaimia.
 * ===========================================================================
 */

interface SubscriptionBody {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Kirjautuminen vaaditaan.", { status: 401 });

  const body = (await request.json().catch(() => null)) as SubscriptionBody | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : null;
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : null;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Tilaus ei kelpaa." }, { status: 400 });
  }

  const { error } = await getServiceClient()
    .from("rs_push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint,
        keys: { p256dh, auth },
        user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );

  if (error) {
    console.error("[push] tilauksen tallennus epäonnistui:", error.message);
    return NextResponse.json({ error: "Tilaus ei tallentunut." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Tilauksen poisto. Laite lähettää tämän, kun käyttäjä sulkee ilmoitukset. */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Kirjautuminen vaaditaan.", { status: 401 });

  const body = (await request.json().catch(() => null)) as SubscriptionBody | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
  if (!endpoint) return NextResponse.json({ error: "Tilaus ei kelpaa." }, { status: 400 });

  // Rajaus käyttäjään: kukaan ei saa poistaa toisen laitteen tilausta
  // arvaamalla endpointin.
  const { error } = await getServiceClient()
    .from("rs_push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  if (error) {
    console.error("[push] tilauksen poisto epäonnistui:", error.message);
    return NextResponse.json({ error: "Poisto ei onnistunut." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
