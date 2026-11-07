import type { Greeting, GreetingInput, WishStyle } from "../../shared/greeting.ts";
import { CURATED_WISHES } from "../../shared/wishes.ts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 12000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      ...init,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new ApiError(body.error ?? "Something went wrong.", res.status);
    return body as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("We couldn't reach the server. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timer);
  }
}

export function createGreeting(input: GreetingInput): Promise<Greeting> {
  return request<Greeting>("/api/greetings", { method: "POST", body: JSON.stringify(input) });
}

export function fetchGreeting(id: string): Promise<Greeting> {
  return request<Greeting>(`/api/greetings/${encodeURIComponent(id)}`);
}

export function reportGreeting(id: string): Promise<{ ok: boolean }> {
  return request(`/api/greetings/${encodeURIComponent(id)}/report`, { method: "POST", body: "{}" });
}

export async function suggestWishes(style: WishStyle): Promise<{ source: "ai" | "curated"; wishes: string[] }> {
  try {
    return await request("/api/wishes/generate", { method: "POST", body: JSON.stringify({ style }) }, 25000);
  } catch {
    return { source: "curated", wishes: CURATED_WISHES[style] };
  }
}
