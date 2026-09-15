/** Extract the most useful text out of AI SDK / fetch / provider errors.
 *  `useChat` redacts stream errors to "An error occurred." by default
 *  (a server-side leak guard). There is no server here — everything runs
 *  in the browser — so we serialize aggressively instead. */

function safeStringify(v: unknown, max = 2000): string | undefined {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (!s) return undefined;
    return s.length > max ? s.slice(0, max) + `… [truncated ${s.length - max} chars]` : s;
  } catch {
    return undefined;
  }
}

export function describeError(error: unknown): string {
  if (error == null) return "Unknown error";
  if (typeof error === "string") return error;
  const e = error as Record<string, unknown>;
  const lines: string[] = [];

  const name = typeof e.name === "string" && e.name !== "Error" ? e.name : undefined;
  const message = typeof e.message === "string" ? e.message : undefined;
  lines.push([name, message].filter(Boolean).join(": ") || "Unknown error");

  for (const k of ["statusCode", "status", "code", "url"]) {
    if (e[k] !== undefined && e[k] !== null && e[k] !== "") lines.push(`${k}: ${String(e[k])}`);
  }

  // AI SDK APICallError shape
  const body = e.responseBody ?? e.response?.valueOf?.() ?? (e.data as unknown);
  if (body) {
    let parsedMessage: string | undefined;
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        parsedMessage = parsed?.error?.message;
      } catch {
        /* not json */
      }
    } else if (typeof body === "object" && body !== null) {
      const b = body as { error?: { message?: string }; message?: string };
      parsedMessage = b.error?.message ?? b.message;
    }
    if (parsedMessage && !lines[0].includes(parsedMessage)) {
      lines.push(`details: ${parsedMessage}`);
    } else {
      const bodyText = safeStringify(body);
      if (bodyText && !lines[0].includes(bodyText.slice(0, 120))) lines.push(`body: ${bodyText}`);
    }
  }

  const cause = e.cause;
  if (cause && cause !== error) {
    const c = describeError(cause);
    if (c !== "Unknown error") lines.push(`cause: ${c}`);
  }

  const lastError = (e as { lastError?: unknown }).lastError;
  if (lastError && lastError !== error && lastError !== cause) {
    const c = describeError(lastError);
    if (c !== "Unknown error") lines.push(`underlying error: ${c}`);
  }

  const errors = (e as { errors?: unknown[] }).errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const last = errors[errors.length - 1];
    if (last && last !== error && last !== cause && last !== lastError) {
      const c = describeError(last);
      if (c !== "Unknown error") lines.push(`attempt error: ${c}`);
    }
  }

  // Last resort: the object itself may hold the message (e.g. { error: { message } })
  if (lines.length === 1 && lines[0] === "Unknown error") {
    const s = safeStringify(error, 3000);
    if (s) return s;
  }
  // Groq-style nested { error: { message } }
  const nested = (e.error ?? e.value) as Record<string, unknown> | undefined;
  if (nested && typeof nested === "object" && typeof nested.message === "string" && !lines[0].includes(nested.message)) {
    lines.push(`provider: ${nested.message}`);
  }
  return lines.join("\n");
}
