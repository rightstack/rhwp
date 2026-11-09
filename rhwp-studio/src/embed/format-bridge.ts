/**
 * [lily] 임베드 호스트용 글자·문단 모양 값(format.* RPC).
 *
 * 호스트가 자기 서식 패널(값 칸·단추 눌림)을 그리려면 캐럿 위치의 서식 값을 읽고 쓸 수 있어야 한다.
 * studio 내부 값은 단위가 섞여 있다 — 읽기(getParaPropertiesAt)는 px(96dpi), 쓰기(ParaShapeDialog mods)는
 * HWPUNIT(여백·들여쓰기는 2배 저장값). RPC 는 pt·% 로 통일하고 변환은 여기서만 한다
 * (같은 식: ui/para-shape-dialog.ts `pxToPt`·`ptToRaw2x`·`ptToRaw`).
 */
import type { CharProperties, ParaProperties } from '../core/types.ts';

export const EMBED_ALIGNMENTS = ['justify', 'left', 'right', 'center', 'distribute', 'split'] as const;
export const EMBED_LINE_SPACING_TYPES = ['Percent', 'Fixed', 'SpaceOnly', 'Minimum'] as const;

export type EmbedAlignmentV1 = typeof EMBED_ALIGNMENTS[number];
export type EmbedLineSpacingTypeV1 = typeof EMBED_LINE_SPACING_TYPES[number];

/** 글자 모양(쓰기). 크기는 pt */
export interface EmbedCharFormatV1 {
  fontSizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  /** '#rrggbb' */
  textColor?: string;
}

/** 문단 모양(쓰기). 여백·들여쓰기·문단 간격은 pt, 줄 간격은 Percent 면 %, 그 외는 pt */
export interface EmbedParaFormatV1 {
  alignment?: EmbedAlignmentV1;
  lineSpacingType?: EmbedLineSpacingTypeV1;
  lineSpacing?: number;
  marginLeftPt?: number;
  marginRightPt?: number;
  /** 첫 줄(음수 = 내어 쓰기) */
  indentPt?: number;
  spacingBeforePt?: number;
  spacingAfterPt?: number;
}

/** 캐럿 위치의 서식 값(읽기) */
export interface EmbedFormatStateV1 {
  char: Required<Pick<EmbedCharFormatV1, 'bold' | 'italic' | 'underline' | 'strikethrough' | 'superscript' | 'subscript'>>
    & { fontName: string | null; fontSizePt: number | null; textColor: string | null };
  para: {
    alignment: EmbedAlignmentV1 | null;
    lineSpacingType: EmbedLineSpacingTypeV1 | null;
    lineSpacing: number | null;
    marginLeftPt: number | null;
    marginRightPt: number | null;
    indentPt: number | null;
    spacingBeforePt: number | null;
    spacingAfterPt: number | null;
  };
}

const PT_PER_PX = 72 / 96;
const HWPUNIT_PER_PT = 100;
/** 화면 표시용 반올림(0.1 pt) */
const round1 = (v: number) => Math.round(v * 10) / 10;
const ptOfPx = (px: number | undefined): number | null =>
  typeof px === 'number' && Number.isFinite(px) ? round1(px * PT_PER_PX) : null;

export function embedFormatState(char: CharProperties | null, para: ParaProperties | null): EmbedFormatStateV1 {
  const c = char ?? {};
  const p = para ?? {};
  const lsType = (EMBED_LINE_SPACING_TYPES as readonly string[]).includes(p.lineSpacingType ?? '')
    ? p.lineSpacingType as EmbedLineSpacingTypeV1
    : (p.lineSpacing !== undefined ? 'Percent' : null);
  return {
    char: {
      fontName: c.fontFamily ?? null,
      fontSizePt: typeof c.fontSize === 'number' ? round1(c.fontSize / HWPUNIT_PER_PT) : null,
      textColor: c.textColor ?? null,
      bold: c.bold === true,
      italic: c.italic === true,
      underline: c.underline === true,
      strikethrough: c.strikethrough === true,
      superscript: c.superscript === true,
      subscript: c.subscript === true,
    },
    para: {
      alignment: (EMBED_ALIGNMENTS as readonly string[]).includes(p.alignment ?? '') ? p.alignment as EmbedAlignmentV1 : null,
      lineSpacingType: lsType,
      // Percent 는 % 그대로, 그 외는 px → pt
      lineSpacing: typeof p.lineSpacing === 'number'
        ? (lsType === 'Percent' ? p.lineSpacing : ptOfPx(p.lineSpacing))
        : null,
      marginLeftPt: ptOfPx(p.marginLeft),
      marginRightPt: ptOfPx(p.marginRight),
      indentPt: ptOfPx(p.indent),
      spacingBeforePt: ptOfPx(p.spacingBefore),
      spacingAfterPt: ptOfPx(p.spacingAfter),
    },
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const extra = Object.keys(value).filter(k => !allowed.includes(k)).sort();
  if (extra.length > 0) throw new Error(`${label} contains unknown field: ${extra[0]}`);
  if (Object.keys(value).length === 0) throw new Error(`${label} must not be empty`);
}
function num(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a number in ${min}..=${max}`);
  }
  return value;
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`);
  return value;
}

const CHAR_KEYS = ['fontSizePt', 'bold', 'italic', 'underline', 'strikethrough', 'superscript', 'subscript', 'textColor'] as const;
const PARA_KEYS = ['alignment', 'lineSpacingType', 'lineSpacing', 'marginLeftPt', 'marginRightPt', 'indentPt', 'spacingBeforePt', 'spacingAfterPt'] as const;

export function parseCharFormat(value: unknown): EmbedCharFormatV1 {
  const v = record(value, 'char');
  onlyKeys(v, CHAR_KEYS, 'char');
  const out: EmbedCharFormatV1 = {};
  if (v.fontSizePt !== undefined) out.fontSizePt = num(v.fontSizePt, 1, 4096, 'fontSizePt');
  for (const k of ['bold', 'italic', 'underline', 'strikethrough', 'superscript', 'subscript'] as const) {
    if (v[k] !== undefined) out[k] = bool(v[k], k);
  }
  if (v.textColor !== undefined) {
    if (typeof v.textColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v.textColor)) throw new Error('textColor must be #rrggbb');
    out.textColor = v.textColor.toLowerCase();
  }
  return out;
}

export function parseParaFormat(value: unknown): EmbedParaFormatV1 {
  const v = record(value, 'para');
  onlyKeys(v, PARA_KEYS, 'para');
  const out: EmbedParaFormatV1 = {};
  if (v.alignment !== undefined) {
    if (!(EMBED_ALIGNMENTS as readonly unknown[]).includes(v.alignment)) throw new Error('alignment is not supported');
    out.alignment = v.alignment as EmbedAlignmentV1;
  }
  if (v.lineSpacingType !== undefined) {
    if (!(EMBED_LINE_SPACING_TYPES as readonly unknown[]).includes(v.lineSpacingType)) throw new Error('lineSpacingType is not supported');
    out.lineSpacingType = v.lineSpacingType as EmbedLineSpacingTypeV1;
  }
  if (v.lineSpacing !== undefined) out.lineSpacing = num(v.lineSpacing, 0, 9999, 'lineSpacing');
  for (const k of ['marginLeftPt', 'marginRightPt', 'spacingBeforePt', 'spacingAfterPt'] as const) {
    if (v[k] !== undefined) out[k] = num(v[k], 0, 999, k);
  }
  if (v.indentPt !== undefined) out.indentPt = num(v.indentPt, -999, 999, 'indentPt');
  return out;
}

/** RPC 글자 값 → studio `format-char` 이벤트 값 */
export function charMods(v: EmbedCharFormatV1): Partial<CharProperties> {
  const m: Partial<CharProperties> = {};
  if (v.fontSizePt !== undefined) m.fontSize = Math.round(v.fontSizePt * HWPUNIT_PER_PT);
  for (const k of ['bold', 'italic', 'underline', 'strikethrough'] as const) if (v[k] !== undefined) m[k] = v[k];
  // 위·아래 첨자는 서로 배타(studio 토글과 같은 규칙)
  if (v.superscript !== undefined) { m.superscript = v.superscript; if (v.superscript) m.subscript = false; }
  if (v.subscript !== undefined) { m.subscript = v.subscript; if (v.subscript) m.superscript = false; }
  if (v.textColor !== undefined) m.textColor = v.textColor;
  return m;
}

/**
 * RPC 문단 값 → studio 문단 서식 mods(ParaShapeDialog 와 같은 단위).
 * `currentType` = 지금 줄 간격 종류 — 값만 바꿀 때 단위(% 또는 pt)를 정한다.
 */
export function paraMods(v: EmbedParaFormatV1, currentType: EmbedLineSpacingTypeV1 | null): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (v.alignment !== undefined) m.alignment = v.alignment;
  const type = v.lineSpacingType ?? currentType ?? 'Percent';
  if (v.lineSpacingType !== undefined) m.lineSpacingType = v.lineSpacingType;
  if (v.lineSpacing !== undefined) {
    m.lineSpacing = type === 'Percent' ? Math.round(v.lineSpacing) : Math.round(v.lineSpacing * HWPUNIT_PER_PT);
  }
  const raw2x = (pt: number) => Math.round(pt * HWPUNIT_PER_PT * 2);
  if (v.marginLeftPt !== undefined) m.marginLeft = raw2x(v.marginLeftPt);
  if (v.marginRightPt !== undefined) m.marginRight = raw2x(v.marginRightPt);
  if (v.indentPt !== undefined) m.indent = raw2x(v.indentPt);
  if (v.spacingBeforePt !== undefined) m.spacingBefore = Math.round(v.spacingBeforePt * HWPUNIT_PER_PT);
  if (v.spacingAfterPt !== undefined) m.spacingAfter = Math.round(v.spacingAfterPt * HWPUNIT_PER_PT);
  return m;
}
