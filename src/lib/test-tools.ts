import { tool } from "ai";
import { z } from "zod";

async function weather(input: { city: string }) {
  return { city: input.city, tempC: 21, condition: "sunny", note: "fake test-tool output" };
}

function evaluateArithmetic(raw: string): number {
  const expr = raw.trim()
  if (!expr) throw new Error('Empty expression')
  if (expr.length > 300) throw new Error('Expression too long (max 300 characters)')

  type Token =
    | { type: 'num'; val: number }
    | { type: 'op'; val: string }
    | { type: 'lparen' }
    | { type: 'rparen' }

  const tokens: Token[] = []
  let i = 0

  while (i < expr.length) {
    const ch = expr[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let numStr = ''
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        numStr += expr[i]
        i++
      }
      const num = Number(numStr)
      if (Number.isNaN(num)) throw new Error(`Invalid number: ${numStr}`)
      tokens.push({ type: 'num', val: num })
      continue
    }
    if (ch === '*' && expr[i + 1] === '*') {
      tokens.push({ type: 'op', val: '^' })
      i += 2
      continue
    }
    if (ch === '^') {
      tokens.push({ type: 'op', val: '^' })
      i++
      continue
    }
    if ('+-*/%'.includes(ch)) {
      tokens.push({ type: 'op', val: ch })
      i++
      continue
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen' })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' })
      i++
      continue
    }
    throw new Error(`Unexpected character: ${ch}`)
  }

  let pos = 0
  let depth = 0
  const maxDepth = 40

  function peek(): Token | undefined {
    return tokens[pos]
  }

  function consume(): Token {
    return tokens[pos++]
  }

  function parseExpression(): number {
    depth++
    if (depth > maxDepth) throw new Error('Expression nested too deeply')
    try {
      let val = parseTerm()
      while (pos < tokens.length) {
        const next = peek()
        if (next && next.type === 'op' && (next.val === '+' || next.val === '-')) {
          consume()
          const rhs = parseTerm()
          val = next.val === '+' ? val + rhs : val - rhs
        } else {
          break
        }
      }
      return val
    } finally {
      depth--
    }
  }

  function parseTerm(): number {
    let val = parseFactor()
    while (pos < tokens.length) {
      const next = peek()
      if (next && next.type === 'op' && (next.val === '*' || next.val === '/' || next.val === '%')) {
        consume()
        const rhs = parseFactor()
        if (next.val === '*') {
          val = val * rhs
        } else if (next.val === '/') {
          if (rhs === 0) throw new Error('Division by zero')
          val = val / rhs
        } else {
          if (rhs === 0) throw new Error('Modulo by zero')
          val = val % rhs
        }
      } else {
        break
      }
    }
    return val
  }

  function parseFactor(): number {
    let val = parseUnary()
    const next = peek()
    if (next && next.type === 'op' && next.val === '^') {
      consume()
      const rhs = parseFactor()
      val = Math.pow(val, rhs)
    }
    return val
  }

  function parseUnary(): number {
    const next = peek()
    if (next && next.type === 'op' && (next.val === '+' || next.val === '-')) {
      consume()
      const factor = parseUnary()
      return next.val === '+' ? factor : -factor
    }
    return parsePrimary()
  }

  function parsePrimary(): number {
    const tok = peek()
    if (!tok) throw new Error('Unexpected end of expression')
    if (tok.type === 'num') {
      consume()
      return tok.val
    }
    if (tok.type === 'lparen') {
      consume()
      const val = parseExpression()
      const closing = peek()
      if (!closing || closing.type !== 'rparen') {
        throw new Error('Missing closing parenthesis')
      }
      consume()
      return val
    }
    throw new Error(`Unexpected token: ${tok.type === 'op' ? tok.val : tok.type}`)
  }

  const result = parseExpression()
  if (pos < tokens.length) {
    const unparsed = tokens[pos]
    throw new Error(`Unexpected token at end: ${unparsed.type === 'op' ? unparsed.val : unparsed.type}`)
  }
  if (!Number.isFinite(result)) {
    throw new Error('Calculation resulted in non-finite number')
  }
  return result
}

async function calc(input: { expression: string }) {
  try {
    const value = evaluateArithmetic(input.expression)
    return { expression: input.expression, value }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
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
