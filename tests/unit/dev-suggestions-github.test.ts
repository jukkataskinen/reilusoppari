import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildIssueBody, MockGithubIssuesClient } from "@/lib/dev-suggestions/github-issues";
import { parseGithubEvent, verifyGithubSignature } from "@/lib/dev-suggestions/webhook";

describe("GitHubin webhookin allekirjoitus", () => {
  const secret = "testisalaisuus";
  const body = '{"action":"closed"}';
  const header = "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");

  it("oikea allekirjoitus hyväksytään", () => {
    expect(verifyGithubSignature(secret, header, body)).toBe(true);
  });

  it("väärä salaisuus hylätään", () => {
    expect(verifyGithubSignature("väärä", header, body)).toBe(false);
  });

  it("muuttunut runko hylätään", () => {
    expect(verifyGithubSignature(secret, header, body + "x")).toBe(false);
  });

  it("tyhjä salaisuus tai otsake ei ole 'tarkistus ohi'", () => {
    expect(verifyGithubSignature("", header, body)).toBe(false);
    expect(verifyGithubSignature(secret, null, body)).toBe(false);
  });

  it("väärä muoto hylätään", () => {
    expect(verifyGithubSignature(secret, "sha1=abc", body)).toBe(false);
  });
});

describe("GitHubin tapahtuman jäsennys", () => {
  it("issues-tapahtuma", () => {
    const event = parseGithubEvent("issues", JSON.stringify({ action: "closed", issue: { number: 42 } }));
    expect(event).toEqual({ kind: "issues", action: "closed", issueNumber: 42 });
  });

  it("pull_request-tapahtuma löytää viitatut issuet", () => {
    const event = parseGithubEvent(
      "pull_request",
      JSON.stringify({ action: "opened", pull_request: { number: 7, body: "Closes #42 ja liittyy #43.", merged: false } }),
    );
    expect(event).toEqual({ kind: "pull_request", action: "opened", merged: false, referencedIssues: [42, 43] });
  });

  it("pull_request ilman rungon viitteitä", () => {
    const event = parseGithubEvent("pull_request", JSON.stringify({ action: "opened", pull_request: { number: 7, body: null } }));
    expect(event).toEqual({ kind: "pull_request", action: "opened", merged: false, referencedIssues: [] });
  });

  it("tuntematon tapahtumatyyppi ei kaada jäsennystä", () => {
    expect(parseGithubEvent("ping", "{}")).toBeNull();
  });

  it("rikkinäinen runko palauttaa null", () => {
    expect(parseGithubEvent("issues", "ei json")).toBeNull();
  });

  it("väärän muotoinen runko palauttaa null", () => {
    expect(parseGithubEvent("issues", JSON.stringify({ action: "closed" }))).toBeNull();
  });
});

describe("issuen teksti", () => {
  it("ei sisällä rivejä, joita ei annettu", () => {
    const body = buildIssueBody({ description: "Kuvaus", feature: "vuokranmaksu", pagePath: null, requestId: "abc-123" });
    expect(body).not.toContain("Sivu:");
    expect(body).toContain("Kuvaus");
    expect(body).toContain("Toiminto: vuokranmaksu");
    expect(body).toContain("Reilusoppari-ehdotus: abc-123");
  });

  it("sisältää sivun, kun se on annettu", () => {
    const body = buildIssueBody({ description: "Kuvaus", feature: "vuokranmaksu", pagePath: "/vuokrasuhteet", requestId: "abc-123" });
    expect(body).toContain("Sivu: /vuokrasuhteet");
  });
});

describe("GitHub-mock", () => {
  it("palauttaa kasvavat issue-numerot ja muistaa kutsut", async () => {
    const client = new MockGithubIssuesClient();
    const first = await client.createIssue({ title: "Ensimmäinen", body: "..." });
    const second = await client.createIssue({ title: "Toinen", body: "..." });
    expect(second).toBe((first ?? 0) + 1);
    expect(client.created).toHaveLength(2);

    const reopened = await client.reopenWithComment(first!, "Tarvitsee muutoksen");
    expect(reopened).toBe(true);
    expect(client.reopened).toEqual([{ issueNumber: first, comment: "Tarvitsee muutoksen" }]);
  });
});
