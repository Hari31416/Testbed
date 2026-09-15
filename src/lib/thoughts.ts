/**
 * Matches <thought>...</thought> or <think>...</think> only when present at the start of text.
 * Also handles unclosed tags during active streaming.
 */
export const LEADING_THOUGHT_RE = /^\s*<(thought|think)>([\s\S]*?)(?:<\/\1>|$)/i

export interface ExtractedThought {
  thought: string | null
  cleanText: string
}

/**
 * Extracts leading <thought> or <think> tokens if and only if they appear at the start of the string.
 * Any thought content is parsed out, and the remaining text after the closing tag is returned as cleanText.
 */
export function extractLeadingThought(text: string): ExtractedThought {
  let remaining = text
  const thoughts: string[] = []

  while (true) {
    const match = remaining.match(LEADING_THOUGHT_RE)
    if (!match) break
    const thoughtContent = match[2].trim()
    if (thoughtContent) {
      thoughts.push(thoughtContent)
    }
    const matchedLen = match[0].length
    remaining = remaining.slice(matchedLen)
    // If the tag was unclosed (stream in progress), stop consuming
    if (!match[0].toLowerCase().endsWith(`</${match[1].toLowerCase()}>`)) {
      break
    }
  }

  if (thoughts.length === 0) {
    return { thought: null, cleanText: text }
  }

  return {
    thought: thoughts.join('\n\n'),
    cleanText: remaining.trimStart(),
  }
}

/**
 * Strips leading <thought> or <think> blocks from text, returning only the clean text.
 */
export function stripLeadingThought(text: string): string {
  return extractLeadingThought(text).cleanText
}
