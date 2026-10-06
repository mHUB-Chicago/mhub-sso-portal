import { describe, expect, it } from "vitest";
import { buildFragmentHandoffHtml } from "./saml";

const ACS = "https://member.mhubchicago.com/login/sso";
const HANDOFF = "https://member.mhubchicago.com/login";
const XML = '<samlp:Response ID="_1">a+b/c=</samlp:Response>';
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

const targetOf = (html: string) => {
  const m = html.match(/<script>location\.replace\((".*?")\);<\/script>/);
  expect(m).not.toBeNull();
  return JSON.parse(m![1]) as string;
};

describe("buildFragmentHandoffHtml — SAML Response delivered via the SP's own page", () => {
  it("sends the browser to the hand-off page with the response only in the fragment", () => {
    const target = targetOf(buildFragmentHandoffHtml(HANDOFF, ACS, XML));
    const url = new URL(target);
    expect(url.origin + url.pathname).toBe(HANDOFF);
    expect(url.search).toBe(""); // nothing in the part that reaches PV's server
    const params = new URLSearchParams(url.hash.slice(1));
    expect(params.get("mhub-saml")).toBe(b64(XML)); // round-trips +, / and = intact
    expect(params.has("mhub-rs")).toBe(false);
  });

  it("carries RelayState alongside, encoded", () => {
    const target = targetOf(buildFragmentHandoffHtml(HANDOFF, ACS, XML, "https://x/?a=1&b=2"));
    expect(new URLSearchParams(new URL(target).hash.slice(1)).get("mhub-rs")).toBe("https://x/?a=1&b=2");
  });

  it("can't be broken out of the inline script", () => {
    const html = buildFragmentHandoffHtml(HANDOFF, ACS, XML, "</script><script>alert(1)</script>");
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(new URLSearchParams(new URL(targetOf(html)).hash.slice(1)).get("mhub-rs")).toBe("</script><script>alert(1)</script>");
  });

  it("escapes a < in the hand-off URL itself", () => {
    const html = buildFragmentHandoffHtml("https://pv.example/</script>", ACS, XML);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(targetOf(html).startsWith("https://pv.example/</script>#mhub-saml=")).toBe(true);
  });

  it("falls back to the plain POST without JS, and never auto-submits it", () => {
    const html = buildFragmentHandoffHtml(HANDOFF, ACS, XML);
    expect(html).toMatch(/<noscript>[\s\S]*<form method="post" action="https:\/\/member\.mhubchicago\.com\/login\/sso">[\s\S]*<\/noscript>/);
    expect(html).not.toMatch(/\.submit\(/);
  });

  it("doesn't leak the page URL as a referrer", () => {
    expect(buildFragmentHandoffHtml(HANDOFF, ACS, XML)).toContain('<meta name="referrer" content="no-referrer">');
  });
});
