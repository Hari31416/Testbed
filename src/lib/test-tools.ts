import { tool } from "ai";
import { z } from "zod";

async function weather(input: { city: string }) {
  return { city: input.city, tempC: 21, condition: "sunny", note: "fake test-tool output" };
}

async function calc(input: { expression: string }) {
  if (!/^[0-9+\-*/().\s%^]+$/.test(input.expression)) return { error: "unsafe expression rejected" };
  try {
    const value = Function(`"use strict"; return (${input.expression})`)() as number;
    return { expression: input.expression, value };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function datetime(input: { timezone: string }) {
  try {
    return {
      timezone: input.timezone,
      iso: new Date().toISOString(),
      local: new Date().toLocaleString("en-US", { timeZone: input.timezone }),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Tools with `execute` so ToolLoopAgent auto-runs them client-side (no server needed).
export const testTools = {
  get_weather: tool({
    description: "Get fake weather for a city (test tool).",
    inputSchema: z.object({ city: z.string() }),
    execute: async (input) => weather(input as { city: string }),
  }),
  calculator: tool({
    description: "Evaluate a basic arithmetic expression.",
    inputSchema: z.object({ expression: z.string() }),
    execute: async (input) => calc(input as { expression: string }),
  }),
  get_datetime: tool({
    description: "Get current date/time in an IANA timezone.",
    inputSchema: z.object({ timezone: z.string().default("UTC") }),
    execute: async (input) => datetime(input as { timezone: string }),
  }),
};
