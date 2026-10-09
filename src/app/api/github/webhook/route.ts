import { NextResponse } from "next/server";
import { parseGithubEvent, verifyGithubSignature } from "@/lib/dev-suggestions/webhook";
import {
  getFeatureRequestByIssueNumber,
  getFeatureRequestsByIssueNumbers,
  markSuggestionInProgress,
  markSuggestionTestable,
} from "@/lib/db/feature-requests";

/**
 * GitHubin webhook kehitysehdotuksille (docs/kehitysehdotukset.md kohta 5,
 * Jukan päätös 8.10.2026).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1) — ks. myös
 * `lib/dev-suggestions/webhook.ts`, jossa tarkempi erittely.
 *
 * 1. Kuka saa kutsua: kuka tahansa internetistä. Ainoa suoja on allekirjoitus.
 * 2. Henkilötieto: ei lokiteta.
 * 3. Syöte: zod tarkistaa muodon (`parseGithubEvent`). Tuntematon tapahtuma
 *    ohitetaan hiljaa.
 * 4. IDOR: issue-numero yhdistetään ehdotukseen `github_issue_number`-
 *    sarakkeesta, jonka me itse kirjoitimme hyväksynnässä. Tuntematon numero
 *    ohitetaan.
 * 5. Salaisuus: `GITHUB_WEBHOOK_SECRET`. Tyhjä arvo EI ole "tarkistus ohi".
 * 6. Epäonnistuminen: 401 väärästä allekirjoituksesta, 400 rikkinäisestä
 *    rungosta, 200 muuten.
 * 7. Lokitus: tapahtuman tyyppi ja issuen numero, ei sisältöä.
 * ===========================================================================
 */
export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim() ?? "";

  // Raaka runko ennen jäsentämistä: allekirjoitus lasketaan tavuista.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyGithubSignature(secret, signature, rawBody)) {
    return new NextResponse("Allekirjoitus ei kelpaa.", { status: 401 });
  }

  const githubEvent = request.headers.get("x-github-event");
  const event = parseGithubEvent(githubEvent, rawBody);
  if (!event) {
    // Joko runko ei kelpaa, tai tapahtumatyyppi ei ole yksi käsitellyistä —
    // molemmat ovat GitHubille samaa "ei tehty mitään", ei virhe.
    return NextResponse.json({ ok: true, ignored: githubEvent ?? "tuntematon" });
  }

  try {
    if (event.kind === "issues") {
      if (event.action !== "closed" && event.action !== "reopened") {
        return NextResponse.json({ ok: true, ignored: `issues.${event.action}` });
      }
      const suggestion = await getFeatureRequestByIssueNumber(event.issueNumber);
      if (!suggestion) {
        console.warn("[kehitysehdotukset] tuntematon issue webhookissa", event.issueNumber);
        return NextResponse.json({ ok: true, ignored: "tuntematon issue" });
      }
      const outcome =
        event.action === "closed" ? await markSuggestionTestable(suggestion.id) : await markSuggestionInProgress(suggestion.id);
      return NextResponse.json(outcome);
    }

    // pull_request.opened: PR viittaa issueen, joka on jonkin ehdotuksen seurannassa.
    if (event.action !== "opened" || event.referencedIssues.length === 0) {
      return NextResponse.json({ ok: true, ignored: `pull_request.${event.action}` });
    }
    const suggestions = await getFeatureRequestsByIssueNumbers(event.referencedIssues);
    if (suggestions.length === 0) {
      return NextResponse.json({ ok: true, ignored: "ei tunnettuja issueita" });
    }
    const outcomes = await Promise.all(suggestions.map((s) => markSuggestionInProgress(s.id)));
    return NextResponse.json({ ok: true, outcomes });
  } catch (err) {
    console.error(
      "[kehitysehdotukset] webhookin käsittely epäonnistui:",
      event.kind,
      err instanceof Error ? err.message : err,
    );
    // 500: GitHub yrittää uudelleen, ja käsittely on idempotenttia tilakoneen ansiosta.
    return new NextResponse("Käsittely epäonnistui.", { status: 500 });
  }
}
