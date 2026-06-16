import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import { callStructured, LLMValidationError } from "../../worker/src/llm/groq";

const TestSchema = z.object({ foo: z.string() });

function groqResponse(content: string) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function requestedModel(init: RequestInit): string {
  return JSON.parse(init.body as string).model;
}

describe("llm/groq.ts — callStructured", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const env = { GROQ_API_KEY: "test-key" };

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns typed data when Groq returns valid JSON matching the schema", async () => {
    fetchMock.mockResolvedValueOnce(groqResponse(JSON.stringify({ foo: "bar" })));

    const result = await callStructured(env, "system", "user", TestSchema);
    expect(result).toEqual({ foo: "bar" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once with a stricter prompt when JSON is malformed, then throws if still invalid", async () => {
    fetchMock.mockResolvedValueOnce(groqResponse("not json at all"));
    fetchMock.mockResolvedValueOnce(groqResponse("still not json"));

    await expect(callStructured(env, "system", "user", TestSchema)).rejects.toBeInstanceOf(
      LLMValidationError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once when a required field is missing, then throws if still invalid", async () => {
    fetchMock.mockResolvedValueOnce(groqResponse(JSON.stringify({ wrongField: 1 })));
    fetchMock.mockResolvedValueOnce(groqResponse(JSON.stringify({ wrongField: 2 })));

    await expect(callStructured(env, "system", "user", TestSchema)).rejects.toBeInstanceOf(
      LLMValidationError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    const secondUserMessage = secondCallBody.messages.find((m: any) => m.role === "user").content;
    expect(secondUserMessage).toContain("invalid for the required JSON schema");
  });

  it("succeeds on the retry if the second response is valid", async () => {
    fetchMock.mockResolvedValueOnce(groqResponse("not json"));
    fetchMock.mockResolvedValueOnce(groqResponse(JSON.stringify({ foo: "fixed" })));

    const result = await callStructured(env, "system", "user", TestSchema);
    expect(result).toEqual({ foo: "fixed" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the primary model llama-3.3-70b-versatile by default", async () => {
    fetchMock.mockResolvedValueOnce(groqResponse(JSON.stringify({ foo: "bar" })));
    await callStructured(env, "system", "user", TestSchema);
    expect(requestedModel(fetchMock.mock.calls[0][1])).toBe("llama-3.3-70b-versatile");
  });

  it("falls back to llama3-8b-8192 when the primary model is rate-limited (429)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 }),
    );
    fetchMock.mockResolvedValueOnce(groqResponse(JSON.stringify({ foo: "bar" })));

    const result = await callStructured(env, "system", "user", TestSchema);
    expect(result).toEqual({ foo: "bar" });
    expect(requestedModel(fetchMock.mock.calls[1][1])).toBe("llama3-8b-8192");
  });
});
