import OpenAI from "openai";
import type { z } from "zod";

export interface GroqEnv {
  GROQ_API_KEY: string;
}

const PRIMARY_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODEL = "llama3-8b-8192";

export class LLMValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: unknown,
  ) {
    super(message);
    this.name = "LLMValidationError";
  }
}

export function buildGroqClient(env: GroqEnv): OpenAI {
  // maxRetries: 0 — this module implements its own retry-once + model-fallback
  // policy; the SDK's built-in retry would otherwise double up on 429s.
  // fetch is forwarded explicitly because the SDK's Node runtime shim defaults
  // to the bundled node-fetch package rather than reading globalThis.fetch,
  // which would otherwise bypass test mocks (and the Workers runtime's fetch).
  return new OpenAI({
    apiKey: env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
    maxRetries: 0,
    fetch: globalThis.fetch,
  });
}

async function callGroq(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Groq returned an empty completion");
  return content;
}

type AttemptResult<T> = { success: true; data: T } | { success: false; issues: unknown };

async function attemptOnce<T extends z.ZodTypeAny>(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  schema: T,
): Promise<AttemptResult<z.infer<T>>> {
  const raw = await callGroq(client, model, systemPrompt, userPrompt);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { success: false, issues: "Groq response was not valid JSON" };
  }
  const result = schema.safeParse(parsedJson);
  if (result.success) return { success: true, data: result.data };
  return { success: false, issues: result.error.issues };
}

async function attemptWithModelFallback<T extends z.ZodTypeAny>(
  client: OpenAI,
  systemPrompt: string,
  userPrompt: string,
  schema: T,
): Promise<AttemptResult<z.infer<T>>> {
  try {
    return await attemptOnce(client, PRIMARY_MODEL, systemPrompt, userPrompt, schema);
  } catch (err) {
    if (isRateLimitError(err)) {
      return await attemptOnce(client, FALLBACK_MODEL, systemPrompt, userPrompt, schema);
    }
    throw err;
  }
}

function isRateLimitError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: unknown }).status === 429;
}

/**
 * Calls Groq with a structured JSON response, validates against `schema`,
 * retries once with a stricter prompt on validation failure, then throws
 * LLMValidationError (mapped to HTTP 422 by route handlers).
 */
export async function callStructured<T extends z.ZodTypeAny>(
  env: GroqEnv,
  systemPrompt: string,
  userPrompt: string,
  schema: T,
): Promise<z.infer<T>> {
  const client = buildGroqClient(env);

  const first = await attemptWithModelFallback(client, systemPrompt, userPrompt, schema);
  if (first.success) return first.data;

  const retryPrompt = `${userPrompt}\n\nYour previous response was invalid for the required JSON schema. Validation errors: ${JSON.stringify(
    first.issues,
  )}. Return ONLY a single valid JSON object matching the required shape, with no extra commentary.`;

  const second = await attemptWithModelFallback(client, systemPrompt, retryPrompt, schema);
  if (second.success) return second.data;

  throw new LLMValidationError("LLM output failed Zod validation after one retry", second.issues);
}
