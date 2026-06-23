const BLOCK_MATH_REGEX = /(^|[^\\])\$\$[\s\S]+?\$\$/m;
const INLINE_MATH_REGEX = /(^|[^\\])\$[^$\n]+?\$/m;
const PAREN_MATH_REGEX = /\\\([\s\S]+?\\\)/;
const BRACKET_MATH_REGEX = /\\\[[\s\S]+?\\\]/;

export function containsMathSyntax(content: string): boolean {
  if (!content) {
    return false;
  }

  return (
    BLOCK_MATH_REGEX.test(content) ||
    INLINE_MATH_REGEX.test(content) ||
    PAREN_MATH_REGEX.test(content) ||
    BRACKET_MATH_REGEX.test(content)
  );
}
