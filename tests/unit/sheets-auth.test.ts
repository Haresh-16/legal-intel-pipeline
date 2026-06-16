import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getAccessToken, resetSheetsTokenCache } from "../../worker/src/sheets/auth";

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function generateTestServiceAccount() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const base64 = Buffer.from(pkcs8).toString("base64");
  const pemLines = base64.match(/.{1,64}/g)!.join("\n");
  const pem = `-----BEGIN PRIVATE KEY-----\n${pemLines}\n-----END PRIVATE KEY-----\n`;
  // Mimic how Wrangler secrets actually arrive: literal "\n" escapes, not real newlines.
  const escapedPem = pem.replace(/\n/g, "\\n");
  return { publicKey: keyPair.publicKey, privateKeyEnvValue: escapedPem };
}

describe("sheets/auth.ts — service-account JWT + token caching", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let publicKey: CryptoKey;
  let env: { GOOGLE_SERVICE_ACCOUNT_EMAIL: string; GOOGLE_PRIVATE_KEY: string };

  beforeEach(async () => {
    resetSheetsTokenCache();
    const sa = await generateTestServiceAccount();
    publicKey = sa.publicKey;
    env = {
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "test-sa@project.iam.gserviceaccount.com",
      GOOGLE_PRIVATE_KEY: sa.privateKeyEnvValue,
    };
    fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      return new Response(JSON.stringify({ access_token: "mock-access-token", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("signs a JWT verifiable with the matching public key, with correct issuer/scope/audience", async () => {
    await getAccessToken(env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");

    const jwt = body.get("assertion")!;
    const [headerB64, claimsB64, sigB64] = jwt.split(".");
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(claimsB64)));

    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(claims.iss).toBe(env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
    expect(claims.scope).toBe("https://www.googleapis.com/auth/spreadsheets");
    expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
    expect(claims.exp - claims.iat).toBe(3600);

    const signature = base64UrlDecode(sigB64);
    const signingInput = new TextEncoder().encode(`${headerB64}.${claimsB64}`);
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      signature,
      signingInput,
    );
    expect(valid).toBe(true);
  });

  it("returns the access token from the token endpoint response", async () => {
    const token = await getAccessToken(env);
    expect(token).toBe("mock-access-token");
  });

  it("caches the token across calls — does not re-mint within validity", async () => {
    await getAccessToken(env);
    await getAccessToken(env);
    await getAccessToken(env);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-mints after resetSheetsTokenCache()", async () => {
    await getAccessToken(env);
    resetSheetsTokenCache();
    await getAccessToken(env);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-mints once the cached token has expired", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ access_token: "short-lived", expires_in: 120 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await getAccessToken(env);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // expires_in=120, cached for (120-60)=60s; advance past that.
    vi.advanceTimersByTime(70_000);

    await getAccessToken(env);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when the token endpoint responds with an error status", async () => {
    fetchMock.mockImplementation(
      async () => new Response("invalid_grant", { status: 400 }),
    );
    await expect(getAccessToken(env)).rejects.toThrow(/Google token exchange failed/);
  });
});
