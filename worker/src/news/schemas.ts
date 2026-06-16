import { z } from "zod";

// The News API's /v1/news/top response — only the fields this app actually
// uses are validated; everything else in the real payload is ignored.
export const NewsApiArticle = z.object({
  uuid: z.string(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  snippet: z.string().nullable().optional(),
  url: z.string().min(1),
  published_at: z.string(),
  source: z.string().nullable().optional(),
});
export type NewsApiArticle = z.infer<typeof NewsApiArticle>;

export const NewsApiResponse = z.object({
  data: z.array(NewsApiArticle),
});
export type NewsApiResponse = z.infer<typeof NewsApiResponse>;
