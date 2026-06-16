import { getAccessToken, type SheetsAuthEnv } from "./auth";

export interface SheetsEnv extends SheetsAuthEnv {
  GOOGLE_SHEETS_SPREADSHEET_ID: string;
}

export class SheetsSyncError extends Error {
  constructor(
    public readonly tab: string,
    message: string,
  ) {
    super(message);
    this.name = "SheetsSyncError";
  }
}

export async function appendRow(
  env: SheetsEnv,
  tab: string,
  row: (string | number)[],
): Promise<void> {
  const accessToken = await getAccessToken(env);
  const range = encodeURIComponent(`${tab}!A1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
  });

  if (!res.ok) {
    throw new SheetsSyncError(tab, `Sheets append failed for tab "${tab}": ${res.status} ${await res.text()}`);
  }
}
