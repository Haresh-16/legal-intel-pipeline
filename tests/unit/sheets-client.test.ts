import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appendRow, SheetsSyncError } from "../../worker/src/sheets/client";
import { resetSheetsTokenCache } from "../../worker/src/sheets/auth";

async function generateTestPrivateKeyEnvValue(): Promise<string> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const base64 = Buffer.from(pkcs8).toString("base64");
  const pem = `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  return pem.replace(/\n/g, "\\n");
}

describe("sheets/client.ts — appendRow", () => {
  let env: {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
    GOOGLE_PRIVATE_KEY: string;
    GOOGLE_SHEETS_SPREADSHEET_ID: string;
  };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    resetSheetsTokenCache();
    env = {
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "test-sa@project.iam.gserviceaccount.com",
      GOOGLE_PRIVATE_KEY: await generateTestPrivateKeyEnvValue(),
      GOOGLE_SHEETS_SPREADSHEET_ID: "SPREADSHEET-123",
    };
    fetchMock = vi.fn(async (url: string) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "tok-abc", expires_in: 3600 }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ updates: { updatedRows: 1 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the correct values:append URL with valueInputOption=USER_ENTERED", async () => {
    await appendRow(env, "Source Registry", ["SRC-1", "Title"]);

    const sheetsCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("sheets.googleapis.com"),
    );
    expect(sheetsCall).toBeDefined();
    const [url, init] = sheetsCall!;
    expect(url).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/SPREADSHEET-123/values/Source%20Registry!A1:append?valueInputOption=USER_ENTERED",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok-abc");
    expect(JSON.parse(init.body as string)).toEqual({ values: [["SRC-1", "Title"]] });
  });

  it("throws SheetsSyncError with the tab name when the append call fails", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "tok-abc", expires_in: 3600 }), {
          status: 200,
        });
      }
      return new Response("permission denied", { status: 403 });
    });

    await expect(appendRow(env, "Claims Ledger", ["CLM-1"])).rejects.toMatchObject({
      name: "SheetsSyncError",
      tab: "Claims Ledger",
    });
    await expect(appendRow(env, "Claims Ledger", ["CLM-1"])).rejects.toBeInstanceOf(SheetsSyncError);
  });
});
