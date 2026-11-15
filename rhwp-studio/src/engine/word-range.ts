// [lily] cursor.ts 의 낱말 범위 유틸을 옮겼다(동작 같음) — 더블클릭 낱말 선택과 함께 단위 테스트한다.

export function isWordChar(c: string): boolean {
  const code = c.charCodeAt(0);
  if (code >= 0x30 && code <= 0x39) return true; // digit
  if (code >= 0x41 && code <= 0x5A) return true; // A-Z
  if (code >= 0x61 && code <= 0x7A) return true; // a-z
  if (code >= 0xAC00 && code <= 0xD7AF) return true; // Hangul
  if (code >= 0x3131 && code <= 0x318E) return true; // Hangul Jamo
  return false;
}

export function findWordAt(text: string, offset: number): { start: number; end: number } {
  if (!text || offset >= text.length) return { start: offset, end: offset };
  const atWord = isWordChar(text[offset] ?? '');
  let start = offset;
  let end = offset;
  if (atWord) {
    while (start > 0 && isWordChar(text[start - 1])) start--;
    while (end < text.length && isWordChar(text[end])) end++;
  } else {
    while (start > 0 && !isWordChar(text[start - 1])) start--;
    while (end < text.length && !isWordChar(text[end])) end++;
  }
  return { start, end };
}

/**
 * [lily] 더블클릭한 자리의 낱말 범위. 낱말 끝 바로 뒤(글자 오른쪽 절반을 누른 경우)면 그 낱말로 본다.
 * 낱말 글자가 닿지 않는 자리(공백·문장부호만, 빈 문단)는 null — 선택을 만들지 않는다.
 */
export function findWordForDoubleClick(text: string, offset: number): { start: number; end: number } | null {
  if (!text) return null;
  let at = Math.max(0, Math.min(offset, text.length));
  const here = at < text.length && isWordChar(text[at]);
  if (!here) {
    if (at > 0 && isWordChar(text[at - 1])) at -= 1;
    else return null;
  }
  const range = findWordAt(text, at);
  return range.end > range.start ? range : null;
}
