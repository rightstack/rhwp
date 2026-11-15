/**
 * [lily] 임베드 호스트 쪽 바탕색(page.setFill) · 꾸밈 도형(shape.insert) RPC.
 *
 * studio 에서는 쪽 › 쪽 테두리/배경 대화 상자와 도형 그리기(마우스 끌기)로 하는 일이다 — 호스트(LilyOffice 에이치독스의 AI 도구,
 * 커뮤니티 제작 도구)는 대화 상자도 마우스도 쓸 수 없어 색 바탕과 꾸밈이 있는 문서(인쇄해서 쓰는 한 장)를 만들지 못했다.
 * 대화 상자 · 그리기와 같은 wasm 함수(setPageBorderFill · createShapeControl · setShapeProperties)를 snapshot 하나로 부른다
 * (실행 취소 한 단계, dirty · 자동 저장이 따라온다).
 * 도형은 종이 기준 자리에, 글 뒤로, 테두리 없이 놓는다 — 꾸밈용이다(글을 밀어내지 않는다).
 */
import type { InputHandler } from '../engine/input-handler.ts';

export interface EmbedPageFillV1 {
  /** 바탕색 #rrggbb. null 이면 바탕색을 없앤다 */
  color: string | null;
}

export interface EmbedShapeInsertV1 {
  kind: 'ellipse' | 'rectangle' | 'star';
  /** 종이 왼쪽 위에서의 자리와 크기(mm) */
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  /** 채움색 #rrggbb */
  fill: string;
  /** 투명도 0–100(%). 기본 0 */
  transparency?: number;
}

export interface EmbedPageOpResultV1 {
  ok: boolean;
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
const KINDS = ['ellipse', 'rectangle', 'star'] as const;

export function parsePageFill(value: Record<string, unknown>): EmbedPageFillV1 {
  if (value.color !== null && (typeof value.color !== 'string' || !COLOR.test(value.color))) throw new Error('color must be #rrggbb or null');
  return { color: value.color === null ? null : (value.color as string).toLowerCase() };
}

export function parseShapeInsert(value: Record<string, unknown>): EmbedShapeInsertV1 {
  if (!KINDS.includes(value.kind as (typeof KINDS)[number])) throw new Error(`kind must be one of ${KINDS.join(', ')}`);
  const num = (key: 'xMm' | 'yMm' | 'widthMm' | 'heightMm', min: number): number => {
    const v = value[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > 1000) throw new Error(`${key} must be a number from ${min} to 1000 (mm)`);
    return v;
  };
  if (typeof value.fill !== 'string' || !COLOR.test(value.fill)) throw new Error('fill must be #rrggbb');
  const out: EmbedShapeInsertV1 = { kind: value.kind as EmbedShapeInsertV1['kind'], xMm: num('xMm', 0), yMm: num('yMm', 0), widthMm: num('widthMm', 1), heightMm: num('heightMm', 1), fill: value.fill.toLowerCase() };
  if (value.transparency !== undefined) {
    if (typeof value.transparency !== 'number' || !Number.isFinite(value.transparency) || value.transparency < 0 || value.transparency > 100) throw new Error('transparency must be a number from 0 to 100');
    out.transparency = value.transparency;
  }
  return out;
}

/** mm → HWPUNIT(1/7200 인치) */
const hwpunit = (mm: number) => Math.round((mm * 7200) / 25.4);
/** #rrggbb → COLORREF(0x00BBGGRR) */
const colorRef = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16);
};
/** 별(꼭짓점 다섯)의 꼭짓점: 상자 안 좌표 */
function starPoints(w: number, h: number): Array<{ x: number; y: number }> {
  return Array.from({ length: 10 }, (_, k) => {
    const r = k % 2 === 0 ? 0.5 : 0.2;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    return { x: Math.round(w * (0.5 + r * Math.cos(a))), y: Math.round(h * (0.5 + r * Math.sin(a) / Math.cos(Math.PI / 10) * 0.95)) };
  }).map((p) => ({ x: Math.max(0, Math.min(w, p.x)), y: Math.max(0, Math.min(h, p.y)) }));
}

/** 캐럿이 있는 구역의 쪽 바탕색을 바꾼다(종이 전체) */
export function setPageFill(ih: InputHandler, req: EmbedPageFillV1): EmbedPageOpResultV1 {
  const sec = ih.getCursorPosition().sectionIndex;
  let ok = false;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'pageBorder',
    operation: (wasm) => {
      const cur = wasm.getPageBorderFill(sec);
      ok = wasm.setPageBorderFill(sec, { ...cur, fillType: req.color ? 'solid' : 'none', fillColor: req.color ?? cur.fillColor, fillArea: 'paper', hideFill: false }).ok;
      return ih.getCursorPosition();
    },
  });
  return { ok };
}

/** 꾸밈 도형 하나를 종이 기준 자리에, 글 뒤로 놓는다. 캐럿은 그대로 */
export function insertDecorShape(ih: InputHandler, req: EmbedShapeInsertV1): EmbedPageOpResultV1 {
  const pos = ih.getCursorPosition();
  if (pos.parentParaIndex !== undefined || !ih.isCaretInBodyText()) return { ok: false };
  const width = hwpunit(req.widthMm), height = hwpunit(req.heightMm), horzOffset = hwpunit(req.xMm), vertOffset = hwpunit(req.yMm);
  let ok = false;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'createShape',
    operation: (wasm) => {
      const r = wasm.createShapeControl({
        sectionIdx: pos.sectionIndex, paraIdx: pos.paragraphIndex, charOffset: pos.charOffset, width, height, horzOffset, vertOffset,
        shapeType: req.kind === 'star' ? 'polygon' : req.kind,
        ...(req.kind === 'star' && { polygonPoints: starPoints(width, height) }),
        treatAsChar: false, textWrap: 'BehindText',
      });
      if (!r.ok) return pos;
      ok = wasm.setShapeProperties(pos.sectionIndex, r.paraIdx, r.controlIdx, {
        treatAsChar: false, textWrap: 'BehindText', horzRelTo: 'Paper', vertRelTo: 'Paper', horzOffset, vertOffset,
        fillType: 'solid', fillBgColor: colorRef(req.fill), fillAlpha: Math.round(((req.transparency ?? 0) * 255) / 100), lineType: 0,
      }).ok;
      return pos;
    },
  });
  ih.focus();
  return { ok };
}
