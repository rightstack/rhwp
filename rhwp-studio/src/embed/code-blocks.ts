/**
 * [lily] 코드 블록(임베드 호스트 — LilyOffice 에이치독스, 2026-11-10 M10).
 *
 * 모델: 연속한 '코드' 사용자 스타일 본문 문단 = 블록 하나. 스타일 = 나눔고딕코딩 + 문단 바탕(#f6f8fa, 위아래 문단과
 * 이어짐). 1x1 표는 쓰지 않는다. 언어 = 블록 문단 안의 책갈피 `_lily_code_<lang>_<n>`(책갈피는 hwp·hwpx 저장 왕복에서
 * 남는다 — serializer/control.rs·serializer/hwpx/field.rs, 이름이 겹치면 core 가 거부하므로 번호를 붙인다).
 */
import type { DocumentPosition } from '../core/types.ts';

export const CODE_STYLE_NAME = '코드';
export const CODE_STYLE_ENGLISH = 'Code';
export const CODE_FONT = '나눔고딕코딩';
export const CODE_BACKGROUND = '#f6f8fa';
export const CODE_BOOKMARK_PREFIX = '_lily_code_';
export const MAX_INSERT_BLOCKS = 5000;
export const MAX_BLOCK_TEXT = 20000;

/** 코드 블록 연산이 쓰는 코어 메서드(WasmBridge 의 일부 — 테스트는 가짜로 채운다) */
export interface CodeWasm {
  getSectionCount(): number;
  getParagraphCount(sec: number): number;
  getParagraphLength(sec: number, para: number): number;
  getTextRange(sec: number, para: number, offset: number, count: number): string;
  getStyleList(): Array<{ id: number; name: string; englishName: string; charShapeId: number; paraShapeId: number }>;
  getStyleAt(sec: number, para: number): { id: number; name: string };
  applyStyle(sec: number, para: number, styleId: number): { ok: boolean };
  createStyle(json: string): number;
  updateStyle(styleId: number, json: string): boolean;
  updateStyleShapes(styleId: number, charModsJson: string, paraModsJson: string): boolean;
  applyParaFormat(sec: number, para: number, propsJson: string): string;
  getParaPropertiesAt(sec: number, para: number): { paraShapeId?: number };
  findOrCreateFontId(name: string): number;
  applyCharFormat(sec: number, para: number, start: number, end: number, propsJson: string): string;
  getBookmarks(): Array<{ name: string; sec: number; para: number; ctrlIdx: number; charPos: number }>;
  addBookmark(sec: number, para: number, charOffset: number, name: string): { ok: boolean; error?: string };
  deleteBookmark(sec: number, para: number, ctrlIdx: number): { ok: boolean; error?: string };
  deleteText(sec: number, para: number, offset: number, count: number): string;
  insertText(sec: number, para: number, offset: number, text: string): string;
  splitParagraph(sec: number, para: number, offset: number): string;
  deleteRange(sec: number, startPara: number, startOffset: number, endPara: number, endOffset: number): { ok: boolean; paraIdx: number; charOffset: number };
}

const cc = (s: string) => Array.from(s).length;

/** ``` 뒤 info string → 책갈피에 쓸 언어 토큰(소문자 영숫자, 없으면 plain). 별칭 풀이는 호스트가 한다 */
export function sanitizeLanguage(info: unknown): string {
  if (typeof info !== 'string') return 'plain';
  const token = info.trim().split(/[\s,{]/)[0].toLowerCase()
    .replace(/^language-/, '').replace(/\+\+/g, 'pp').replace(/#/g, 'sharp').replace(/[^a-z0-9]/g, '');
  return token.slice(0, 24) || 'plain';
}

/** 책갈피 이름 → 언어(우리 책갈피가 아니면 null) */
export function languageOfBookmark(name: string): string | null {
  const m = /^_lily_code_([a-z0-9]+)(?:_\d+)?$/.exec(name);
  return m ? m[1] : null;
}

function findStyle(w: CodeWasm, names: string[]): number {
  for (const s of w.getStyleList()) {
    if (names.includes(s.name) || names.includes(s.englishName)) return s.id;
  }
  return -1;
}

/** 개요 1~3 스타일 id(이름 "개요 n" 또는 "Outline n"). 없으면 -1 */
export function findOutlineStyleId(w: CodeWasm, level: number): number {
  return findStyle(w, [`개요 ${level}`, `Outline ${level}`]);
}

/** '코드' 스타일 id. 없으면 -1 */
export function codeStyleId(w: CodeWasm): number {
  return findStyle(w, [CODE_STYLE_NAME, CODE_STYLE_ENGLISH]);
}

/**
 * '코드' 스타일을 찾거나 만든다. 만들 때는 (sec, para) 문단에 문단 바탕을 먼저 걸어 그 문단 모양을 스타일 바탕으로
 * 삼는다(`updateStyleShapes` 는 문단 채움을 다루지 않는다 — parse_para_shape_mods). 글꼴은 스타일 글자 모양에.
 */
export function ensureCodeStyle(w: CodeWasm, sec: number, para: number): number {
  const found = codeStyleId(w);
  if (found >= 0) return found;
  // 바탕글 문단 모양에서 시작한다(개요 문단에서 만들면 개요 번호가 따라온다)
  w.applyStyle(sec, para, 0);
  const none = { type: 0, width: 0, color: '#000000' };
  w.applyParaFormat(sec, para, JSON.stringify({
    headType: 'None', fillType: 'solid', fillColor: CODE_BACKGROUND, borderConnect: true,
    // 테두리 기본값은 실선(BorderLineType::default) — 바탕만 칠하게 네 변을 끈다
    borderLeft: none, borderRight: none, borderTop: none, borderBottom: none,
  }));
  const paraShapeId = w.getParaPropertiesAt(sec, para).paraShapeId;
  const base = w.getStyleList()[0];
  const id = w.createStyle(JSON.stringify({
    name: CODE_STYLE_NAME, englishName: CODE_STYLE_ENGLISH, type: 0, nextStyleId: 0,
    ...(typeof paraShapeId === 'number' ? { baseParaShapeId: paraShapeId } : {}),
    ...(base ? { baseCharShapeId: base.charShapeId } : {}),
  }));
  if (id < 0) throw new Error('createStyle failed');
  // Enter 로 나눈 다음 문단도 코드
  w.updateStyle(id, JSON.stringify({ nextStyleId: id }));
  const fontId = w.findOrCreateFontId(CODE_FONT);
  if (fontId >= 0) w.updateStyleShapes(id, JSON.stringify({ fontId }), '{}');
  return id;
}

/** 문단에 '코드' 스타일(없으면 만든다) */
export function applyCodeStyle(w: CodeWasm, sec: number, para: number): number {
  const id = ensureCodeStyle(w, sec, para);
  w.applyStyle(sec, para, id);
  return id;
}

/** para 를 품은 코드 블록의 [첫 문단, 끝 문단]. 코드 문단이 아니면 null */
export function blockAt(w: CodeWasm, sec: number, para: number, codeId = codeStyleId(w)): { start: number; end: number } | null {
  if (codeId < 0 || w.getStyleAt(sec, para).id !== codeId) return null;
  let start = para;
  while (start > 0 && w.getStyleAt(sec, start - 1).id === codeId) start--;
  let end = para;
  const count = w.getParagraphCount(sec);
  while (end + 1 < count && w.getStyleAt(sec, end + 1).id === codeId) end++;
  return { start, end };
}

function lilyBookmarks(w: CodeWasm, sec: number, start: number, end: number) {
  return w.getBookmarks().filter((b) => b.sec === sec && b.para >= start && b.para <= end && languageOfBookmark(b.name) !== null);
}

/** 블록 [start, end] 의 언어 책갈피를 모두 지운다 */
export function clearCodeLanguage(w: CodeWasm, sec: number, start: number, end: number): void {
  // 같은 문단의 ctrlIdx 가 지울 때마다 당겨지므로 하나씩 다시 읽는다
  for (let guard = 0; guard < 64; guard++) {
    const b = lilyBookmarks(w, sec, start, end)[0];
    if (!b) return;
    if (!w.deleteBookmark(b.sec, b.para, b.ctrlIdx).ok) return;
  }
}

/** para 를 품은 블록(코드 문단이 아니면 그 문단 하나)의 언어를 바꾼다 — 책갈피는 블록 첫 문단 맨 앞 */
export function setBlockLanguage(w: CodeWasm, sec: number, para: number, lang: string): boolean {
  const block = blockAt(w, sec, para) ?? { start: para, end: para };
  clearCodeLanguage(w, sec, block.start, block.end);
  const token = sanitizeLanguage(lang);
  const names = new Set(w.getBookmarks().map((b) => b.name));
  let n = 1;
  while (names.has(`${CODE_BOOKMARK_PREFIX}${token}_${n}`)) n++;
  return w.addBookmark(sec, block.start, 0, `${CODE_BOOKMARK_PREFIX}${token}_${n}`).ok;
}

export interface CodeBlockInfoV1 {
  section: number;
  /** 첫 문단 */
  paragraph: number;
  /** 문단 수 */
  count: number;
  /** 책갈피 언어 토큰(없으면 plain) */
  lang: string;
  /** 문단마다 글(줄) */
  lines: string[];
}

function paragraphText(w: CodeWasm, sec: number, para: number): string {
  const len = w.getParagraphLength(sec, para);
  return len > 0 ? w.getTextRange(sec, para, 0, len) : '';
}

/** 문서의 모든 코드 블록(본문). '코드' 스타일이 없으면 빈 목록 */
export function listCodeBlocks(w: CodeWasm): CodeBlockInfoV1[] {
  const codeId = codeStyleId(w);
  if (codeId < 0) return [];
  const marks = w.getBookmarks();
  const blocks: CodeBlockInfoV1[] = [];
  for (let sec = 0; sec < w.getSectionCount(); sec++) {
    const count = w.getParagraphCount(sec);
    let para = 0;
    while (para < count) {
      if (w.getStyleAt(sec, para).id !== codeId) { para++; continue; }
      const start = para;
      const lines: string[] = [];
      while (para < count && w.getStyleAt(sec, para).id === codeId) lines.push(paragraphText(w, sec, para++));
      const mark = marks.find((b) => b.sec === sec && b.para >= start && b.para < para && languageOfBookmark(b.name) !== null);
      blocks.push({ section: sec, paragraph: start, count: para - start, lang: mark ? languageOfBookmark(mark.name)! : 'plain', lines });
    }
  }
  return blocks;
}

/** 캐럿이 있는 코드 블록(본문 문단이 아니거나 코드가 아니면 null) */
export function codeContextAt(w: CodeWasm, pos: DocumentPosition | null): { section: number; paragraph: number; count: number; lang: string } | null {
  if (!pos || pos.parentParaIndex !== undefined) return null;
  const sec = pos.sectionIndex;
  const block = blockAt(w, sec, pos.paragraphIndex);
  if (!block) return null;
  const mark = lilyBookmarks(w, sec, block.start, block.end)[0];
  return { section: sec, paragraph: block.start, count: block.end - block.start + 1, lang: mark ? languageOfBookmark(mark.name)! : 'plain' };
}


function index(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value as number;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

// ── text.insertBlocks ───────────────────────────────────────

export type InsertBlockStyleV1 = 'body' | 'outline1' | 'outline2' | 'outline3' | 'code';

export interface InsertBlockV1 {
  text: string;
  style?: InsertBlockStyleV1;
  /** code 일 때 언어(같은 언어로 이어진 code 블록은 한 코드 블록) */
  lang?: string;
  /** 굵게 범위 [start, end)(그 문단 글 기준, 코어 단위) */
  bold?: Array<[number, number]>;
}

const STYLES: readonly InsertBlockStyleV1[] = ['body', 'outline1', 'outline2', 'outline3', 'code'];

export function parseInsertBlocks(value: Record<string, unknown>): { blocks: InsertBlockV1[] } {
  if (!Array.isArray(value.blocks) || value.blocks.length === 0 || value.blocks.length > MAX_INSERT_BLOCKS) {
    throw new Error(`blocks must be a non-empty array (max ${MAX_INSERT_BLOCKS})`);
  }
  const blocks = value.blocks.map((raw, i) => {
    const b = record(raw, `blocks[${i}]`);
    if (typeof b.text !== 'string' || b.text.length > MAX_BLOCK_TEXT) throw new Error(`blocks[${i}].text must be a string (max ${MAX_BLOCK_TEXT})`);
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/u.test(b.text)) throw new Error(`blocks[${i}].text must not contain control characters (one block = one paragraph)`);
    if (b.style !== undefined && !STYLES.includes(b.style as InsertBlockStyleV1)) throw new Error(`blocks[${i}].style must be one of ${STYLES.join(', ')}`);
    if (b.lang !== undefined && typeof b.lang !== 'string') throw new Error(`blocks[${i}].lang must be a string`);
    let bold: Array<[number, number]> | undefined;
    if (b.bold !== undefined) {
      if (!Array.isArray(b.bold)) throw new Error(`blocks[${i}].bold must be an array`);
      const len = cc(b.text);
      bold = b.bold.map((r) => {
        if (!Array.isArray(r) || r.length !== 2) throw new Error('bold range must be [start, end]');
        const s = index(r[0], 'bold.start');
        const e = index(r[1], 'bold.end');
        if (e <= s || e > len) throw new Error('bold range out of text');
        return [s, e] as [number, number];
      });
    }
    return { text: b.text, ...(b.style ? { style: b.style as InsertBlockStyleV1 } : {}), ...(b.lang !== undefined ? { lang: b.lang } : {}), ...(bold ? { bold } : {}) };
  });
  return { blocks };
}

function split(w: CodeWasm, sec: number, para: number, offset: number): number {
  const r = JSON.parse(w.splitParagraph(sec, para, offset)) as { ok?: boolean; paraIdx?: number };
  if (!r.ok || typeof r.paraIdx !== 'number') throw new Error('splitParagraph failed');
  return r.paraIdx;
}

const ownParagraph = (b: InsertBlockV1) => (b.style ?? 'body') !== 'body';

/**
 * 블록마다 문단 하나로 넣는다(첫 블록은 캐럿 문단에 이어 쓰고, 스타일 블록이면 먼저 나눈다). 돌려주는 값 = 넣은 글 끝.
 * 호출자가 snapshot 하나로 감싼다(= 실행 취소 한 단계).
 */
export function applyInsertBlocks(
  w: CodeWasm,
  at: { section: number; paragraph: number; offset: number },
  blocks: InsertBlockV1[],
): { section: number; paragraph: number; offset: number } | null {
  const sec = at.section;
  if (sec >= w.getSectionCount() || at.paragraph >= w.getParagraphCount(sec)) return null;
  if (at.offset > w.getParagraphLength(sec, at.paragraph)) return null;
  let para = at.paragraph;
  let offset = at.offset;
  const startCode = codeStyleId(w);
  // 캐럿 문단이 이미 코드면 첫 코드 블록은 그 블록에 이어 쓴다(언어를 바꾸지 않는다)
  const caretInCode = startCode >= 0 && w.getStyleAt(sec, para).id === startCode;
  if (offset > 0 && ownParagraph(blocks[0])) { para = split(w, sec, para, offset); offset = 0; }
  const placed: Array<{ para: number; base: number; block: InsertBlockV1 }> = [];
  blocks.forEach((b, i) => {
    if (i > 0) { para = split(w, sec, para, offset); offset = 0; }
    const base = offset;
    if (b.text) { w.insertText(sec, para, offset, b.text); offset += cc(b.text); }
    placed.push({ para, base, block: b });
  });
  // 스타일 블록 뒤에 원래 문단의 남은 글이 있으면 떼어 낸다(남은 글이 제목·코드가 되지 않게)
  const last = blocks[blocks.length - 1];
  if (ownParagraph(last) && offset < w.getParagraphLength(sec, para)) split(w, sec, para, offset);
  // 스타일 → 굵게(스타일 적용이 글자 모양을 덮지 않게 굵게를 뒤에)
  let codeId = codeStyleId(w);
  let prevCodeLang: string | null = null;
  placed.forEach(({ para: p, block }, i) => {
    const style = block.style ?? 'body';
    if (style === 'code') {
      codeId = applyCodeStyle(w, sec, p);
      const lang = sanitizeLanguage(block.lang ?? 'plain');
      if (i === 0 && caretInCode) prevCodeLang = lang;
      if (prevCodeLang !== lang) setBlockLanguage(w, sec, p, lang);
      prevCodeLang = lang;
      return;
    }
    prevCodeLang = null;
    // 첫 블록이 본문이면 캐럿 문단 스타일을 그대로 둔다(코드 줄에 글만 넣기)
    if (i === 0 && style === 'body') return;
    if (style === 'body') {
      if (codeId >= 0 && w.getStyleAt(sec, p).id === codeId) w.applyStyle(sec, p, 0);
    } else {
      const id = findOutlineStyleId(w, Number(style.slice(-1)));
      if (id >= 0) w.applyStyle(sec, p, id);
    }
  });
  for (const { para: p, base, block } of placed) {
    for (const [s, e] of block.bold ?? []) w.applyCharFormat(sec, p, base + s, base + e, JSON.stringify({ bold: true }));
  }
  return { section: sec, paragraph: para, offset };
}
