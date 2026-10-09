/**
 * Kehitysehdotusten GitHub-issuet (docs/kehitysehdotukset.md kohta "Tekninen").
 *
 * ===========================================================================
 * ILMAN TOKENIA EI VIRHETTÄ
 *
 * `GITHUB_ISSUES_TOKEN` puuttuu kehityksessä ja osassa tuotantoympäristöjä,
 * kunnes Jukka on luonut sen (BLOCKERS.md). Silloin hyväksyntä tallentuu
 * normaalisti, issue jää vain luomatta — sama periaate kuin Stripen ja
 * eSinetin mockeissa (`lib/billing`, `lib/esinetti`): puuttuva tunnus ei saa
 * kaataa toimintoa, jonka kannalta GitHub on sivuvaikutus, ei edellytys.
 *
 * Token on tarkoitettu hienojakoiseksi, oikeus vain yhden repon Issues:
 * read/write (spekin ohje). Sillä EI voi tehdä mitään muuta tässä repossa.
 * ===========================================================================
 */

export interface DevSuggestionIssueInput {
  title: string;
  body: string;
}

export interface GithubIssuesClient {
  /** Palauttaa issuen numeron, tai `null` jos luonti epäonnistui. */
  createIssue(input: DevSuggestionIssueInput): Promise<number | null>;
  /** Avaa suljetun issuen uudelleen ja lisää kommentin ("tarvitsee muutoksen"). */
  reopenWithComment(issueNumber: number, comment: string): Promise<boolean>;
}

const LABEL = "kehitysehdotus";

function repo(): string {
  return process.env.GITHUB_ISSUES_REPO?.trim() || "jukkataskinen/reilusoppari";
}

function headers(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "reilusoppari-kehitysehdotukset",
  };
}

export class HttpGithubIssuesClient implements GithubIssuesClient {
  constructor(private readonly token: string) {}

  async createIssue(input: DevSuggestionIssueInput): Promise<number | null> {
    try {
      const response = await fetch(`https://api.github.com/repos/${repo()}/issues`, {
        method: "POST",
        headers: headers(this.token),
        body: JSON.stringify({ title: input.title, body: input.body, labels: [LABEL] }),
      });
      if (!response.ok) {
        console.error("[kehitysehdotukset] issuen luonti epäonnistui, status", response.status);
        return null;
      }
      const json = (await response.json()) as { number: number };
      return json.number;
    } catch (err) {
      console.error("[kehitysehdotukset] issuen luonti epäonnistui:", err instanceof Error ? err.message : "tuntematon virhe");
      return null;
    }
  }

  async reopenWithComment(issueNumber: number, comment: string): Promise<boolean> {
    try {
      const commentResponse = await fetch(`https://api.github.com/repos/${repo()}/issues/${issueNumber}/comments`, {
        method: "POST",
        headers: headers(this.token),
        body: JSON.stringify({ body: comment }),
      });
      const reopenResponse = await fetch(`https://api.github.com/repos/${repo()}/issues/${issueNumber}`, {
        method: "PATCH",
        headers: headers(this.token),
        body: JSON.stringify({ state: "open" }),
      });
      if (!commentResponse.ok || !reopenResponse.ok) {
        console.error("[kehitysehdotukset] issuen uudelleenavaus epäonnistui", issueNumber);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[kehitysehdotukset] issuen uudelleenavaus epäonnistui:", err instanceof Error ? err.message : "tuntematon virhe");
      return false;
    }
  }
}

/** Kehitykseen ja testeihin: ei koskaan soita verkkoon. */
export class MockGithubIssuesClient implements GithubIssuesClient {
  private counter = 1000;
  readonly created: DevSuggestionIssueInput[] = [];
  readonly reopened: Array<{ issueNumber: number; comment: string }> = [];

  async createIssue(input: DevSuggestionIssueInput): Promise<number | null> {
    this.created.push(input);
    return this.counter++;
  }

  async reopenWithComment(issueNumber: number, comment: string): Promise<boolean> {
    this.reopened.push({ issueNumber, comment });
    return true;
  }
}

let cached: GithubIssuesClient | null = null;

function readToken(): string | null {
  return process.env.GITHUB_ISSUES_TOKEN?.trim() || null;
}

export function hasGithubIssuesCredentials(): boolean {
  return readToken() !== null;
}

export function getGithubIssuesClient(): GithubIssuesClient {
  if (cached) return cached;
  const token = readToken();
  if (token) {
    cached = new HttpGithubIssuesClient(token);
  } else {
    cached = new MockGithubIssuesClient();
    console.warn("[kehitysehdotukset] GITHUB_ISSUES_TOKEN puuttuu — issueta ei luoda GitHubiin.");
  }
  return cached;
}

/** Testien käyttöön: pakottaa clientin luotavaksi uudelleen ympäristön muututtua. */
export function resetGithubIssuesClientForTests(): void {
  cached = null;
}

/** Issuen teksti. Ei henkilötietoja: kuvaus on käsittelijän hyväksymä tai muokkaama. */
export function buildIssueBody(input: { description: string; feature: string; pagePath: string | null; requestId: string }): string {
  const lines = [
    input.description,
    "",
    `Toiminto: ${input.feature}`,
    input.pagePath ? `Sivu: ${input.pagePath}` : null,
    "",
    `Reilusoppari-ehdotus: ${input.requestId}`,
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
}
