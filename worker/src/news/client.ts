import { NewsApiResponse, type NewsApiArticle } from "./schemas";

export interface NewsApiEnv {
  THE_NEWS_API_TOKEN: string;
}

export class NewsApiError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "NewsApiError";
  }
}

const BASE_URL = "https://api.thenewsapi.com/v1/news/top";
// Small, focused query — free-tier limits (100 req/day, 3 articles/req) are
// enough for a demo inbox, not a real discovery feed (CLAUDE.md News API rules).
const DEFAULT_SEARCH = "legal,litigation,regulation";
const DEFAULT_LIMIT = 3;

export async function fetchTopNews(
  env: NewsApiEnv,
  options?: { search?: string; limit?: number },
): Promise<NewsApiArticle[]> {
  const params = new URLSearchParams({
    api_token: env.THE_NEWS_API_TOKEN,
    search: options?.search ?? DEFAULT_SEARCH,
    language: "en",
    limit: String(options?.limit ?? DEFAULT_LIMIT),
  });

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}?${params.toString()}`);
  } catch (err) {
    throw new NewsApiError("The News API request failed to send", err);
  }

  if (!res.ok) {
    throw new NewsApiError(`The News API request failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const parsed = NewsApiResponse.safeParse(json);
  if (!parsed.success) {
    throw new NewsApiError("The News API response did not match the expected shape", parsed.error.issues);
  }

  return parsed.data.data;
}
