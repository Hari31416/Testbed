/** Models (esp. reasoning ones like gpt-oss) often emit \(...\) and \[...\]
 *  delimiters, but remark-math only understands $...$ / $$...$$.
 *  Convert them outside fenced code blocks so code samples stay intact. */
export function preprocessMath(md: string): string {
  return md
    .split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$))/g)
    .map((chunk, i) =>
      i % 2 === 1
        ? chunk
        : chunk
            .replace(/\\\[([\s\S]+?)\\\]/g, (_m, m: string) => `$$${m}$$`)
            .replace(/\\\(([\s\S]+?)\\\)/g, (_m, m: string) => `$${m}$`),
    )
    .join("");
}
