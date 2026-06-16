import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchTopNews, NewsApiError } from "../../worker/src/news/client";

const ENV = { THE_NEWS_API_TOKEN: "test-token" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("news/client.ts — fetchTopNews", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses a valid response into typed articles", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            uuid: "abc-123",
            title: "Court issues ruling",
            snippet: "A short snippet.",
            url: "https://example.com/article",
            published_at: "2026-06-10T00:00:00.000000Z",
            source: "example.com",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const articles = await fetchTopNews(ENV);
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe("Court issues ruling");

    const requestedUrl = fetchMock.mock.calls[0][0] as string;
    expect(requestedUrl).toContain("https://api.thenewsapi.com/v1/news/top");
    expect(requestedUrl).toContain("api_token=test-token");
  });

  it("throws NewsApiError on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 429 })),
    );
    await expect(fetchTopNews(ENV)).rejects.toBeInstanceOf(NewsApiError);
  });

  it("throws NewsApiError when the response shape doesn't match the schema", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ unexpected: "shape" })));
    await expect(fetchTopNews(ENV)).rejects.toBeInstanceOf(NewsApiError);
  });

  it("throws NewsApiError when the network request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(fetchTopNews(ENV)).rejects.toBeInstanceOf(NewsApiError);
  });
});
