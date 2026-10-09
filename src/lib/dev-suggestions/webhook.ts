/**
 * GitHubin webhook kehitysehdotuksille (docs/kehitysehdotukset.md kohta 5).
 *
 * ===========================================================================
 * TIETOTURVA
 *
 * 1. Kuka saa kutsua: kuka tahansa internetistä — osoite on julkinen. Ainoa
 *    suoja on allekirjoitus (`verifyGithubSignature`), tarkistettava ennen
 *    kuin rungosta uskotaan mitään.
 * 2. Henkilötieto: GitHubin issue/PR-rungossa ei pitäisi olla sellaista,
 *    koska käsittelijä on poistanut sen hyväksynnän yhteydessä — mutta
 *    tätä ei lokiteta joka tapauksessa.
 * 3. Syöte: zod tarkistaa muodon. Tuntematon tapahtumatyyppi tai sellainen,
 *    joka ei viittaa mihinkään tunnettuun issueen, ohitetaan hiljaa.
 * 4. Toisto: käsittely on idempotenttia, koska se kulkee tilakoneen läpi
 *    (`nextStatus`) — sama tapahtuma kahdesti ei tuota virheellistä tilaa,
 *    toinen kerta vain ei löydä siirtymää.
 * 5. Salaisuus: `GITHUB_WEBHOOK_SECRET`. Tyhjä arvo EI tarkoita
 *    "tarkistus ohi".
 * 6. Epäonnistuminen: 401 väärästä allekirjoituksesta, 400 rikkinäisestä
 *    rungosta, 200 muuten (myös kun tapahtuma ohitetaan) — GitHub ei saa
 *    yrittää loputtomasti tapahtumaa, jota emme koskaan käsittele.
 * 7. Lokitus: tapahtuman tyyppi ja issuen numero, ei sisältöä.
 *
 * GitHubin allekirjoitus lasketaan RAA'ASTA rungosta
 * (`X-Hub-Signature-256: sha256=<hex hmac>`), ei jäsennetystä JSON:sta.
 * ===========================================================================
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export function verifyGithubSignature(secret: string, header: string | null, rawBody: string): boolean {
  if (!secret || !header) return false;
  const match = /^sha256=([0-9a-f]+)$/.exec(header.trim());
  if (!match) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const givenBuf = Buffer.from(match[1], "hex");
  if (expectedBuf.length !== givenBuf.length) return false;
  return timingSafeEqual(expectedBuf, givenBuf);
}

const issuesEventSchema = z.object({
  action: z.string(),
  issue: z.object({ number: z.number() }),
});

const pullRequestEventSchema = z.object({
  action: z.string(),
  pull_request: z.object({
    number: z.number(),
    body: z.string().nullable(),
    merged: z.boolean().optional(),
  }),
});

export interface GithubIssuesEvent {
  kind: "issues";
  action: string;
  issueNumber: number;
}

export interface GithubPullRequestEvent {
  kind: "pull_request";
  action: string;
  merged: boolean;
  /** Issue-numerot, joihin PR:n kuvaus viittaa ("#123"). */
  referencedIssues: number[];
}

/** Jäsentää rungon tunnetun otsaketyypin mukaan. `null`, jos muoto ei kelpaa tai tyyppi on tuntematon. */
export function parseGithubEvent(githubEventHeader: string | null, rawBody: string): GithubIssuesEvent | GithubPullRequestEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (githubEventHeader === "issues") {
    const parsed = issuesEventSchema.safeParse(json);
    if (!parsed.success) return null;
    return { kind: "issues", action: parsed.data.action, issueNumber: parsed.data.issue.number };
  }

  if (githubEventHeader === "pull_request") {
    const parsed = pullRequestEventSchema.safeParse(json);
    if (!parsed.success) return null;
    const body = parsed.data.pull_request.body ?? "";
    const referencedIssues = [...body.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
    return {
      kind: "pull_request",
      action: parsed.data.action,
      merged: parsed.data.pull_request.merged ?? false,
      referencedIssues,
    };
  }

  return null;
}
