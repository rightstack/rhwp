/**
 * [lily] 임베드 호스트 본문 도형(shape.* RPC) — 호스트가 그리는 선택 틀 · [도형] 속성 패널 · 그리기 도구용.
 *
 * studio 에서는 도형 그리기(마우스 끌기) · 개체 속성 대화 상자 · 개체 틀로 하는 일이다. 같은 wasm 함수
 * (createShapeControl · setShapeProperties · changeShapeZOrder · groupShapes · deleteShapeControl)를 snapshot 하나로 부르고
 * (실행 취소 한 단계), 엔진에 없는 셋은 [lily] Rust(`lilyShapeStyle` · `lilyShapeStyleGet` · `lilyEnsureShapeText`)로 한다.
 *
 * - shape.create { page, xMm, yMm, widthMm, heightMm, kind, roundRate?, paths?, flipX?, flipY?, arrow?, fill?, line?, lineWidthPt?, description? }
 *     글 앞으로 떠 있는(글자처럼 취급 아님) 도형을 그 쪽 종이 기준 자리에 넣고 고른다. 닻 = 그 자리 아래 본문 글.
 *     kind = rectangle · ellipse · line · arc · polygon · textbox · connector-straight · connector-stroke · connector-arc.
 *     polygon 은 paths(상자 안 mm 꺾은선) — 길 하나 = 다각형 하나(closed 면 첫 점으로 닫는다), 여럿 = 다각형들을 묶음(GroupShape)으로.
 * - shape.list                          : 본문의 떠 있는 도형 · 선 · 묶음(쪽 · 가운데 · 돌리기 전 크기 · 각도 · 꾸밈 · 잠금 · z · 줄 바꿈)
 * - shape.selected                      : 지금 고른 본문 도형들(모두 도형일 때만, 고른 차례)
 * - shape.select { items }              : 도형 여럿 고르기(빈 목록 = 해제)
 * - shape.update { items, select? }     : 크기(가운데 유지) · 옮기기 · 각도 · 뒤집기 · 채우기 · 불투명도 · 선 · 굵기 · 그림자 · 모서리 · 줄 바꿈 ·
 *                                         잠금(크기 고정 sizeProtect) · 차례(맨 앞 · 앞으로 · 뒤로 · 맨 뒤)를 snapshot 하나로
 * - shape.delete { items }              : 지우기(한 단계)
 * - shape.editText { sec, para, ci }    : 도형 글 편집에 들어간다(글 영역이 없으면 만든다)
 * - shape.group { items } · shape.ungroup { sec, para, ci }
 * - shape.setTyping { on }              : 도형을 고른 채 치는 글자 = 도형 글(기본 꺼짐)
 */
import type { InputHandler } from '../engine/input-handler.ts';
import type { WasmBridge } from '../core/wasm-bridge.ts';
import { anchorOnPage } from './picture-ops.ts';

export const SHAPE_KINDS = ['rectangle', 'ellipse', 'line', 'arc', 'polygon', 'textbox', 'connector-straight', 'connector-stroke', 'connector-arc'] as const;
export type EmbedShapeKindV1 = (typeof SHAPE_KINDS)[number];
export const SHAPE_SHADOWS = ['none', 'soft', 'normal', 'retro'] as const;
export type EmbedShapeShadowV1 = (typeof SHAPE_SHADOWS)[number];
export const SHAPE_WRAPS = ['inline', 'square', 'topAndBottom', 'behind', 'front'] as const;
export type EmbedShapeWrapV1 = (typeof SHAPE_WRAPS)[number];

export interface EmbedShapePathV1 { pts: [number, number][]; closed: boolean }
export interface EmbedShapeCreateV1 {
  page: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  kind: EmbedShapeKindV1;
  /** 사각형 모서리 곡률(%) 0–50 */
  roundRate?: number;
  paths?: EmbedShapePathV1[];
  /** 선: 끝점이 왼쪽(flipX) · 위(flipY)에서 시작 */
  flipX?: boolean;
  flipY?: boolean;
  arrow?: 'end' | 'both';
  /** #rrggbb · null = 없음 */
  fill?: string | null;
  line?: string | null;
  lineWidthPt?: number;
  description?: string;
}
export interface EmbedShapeRefV1 { sec: number; para: number; ci: number }
export interface EmbedShapeInfoV1 extends EmbedShapeRefV1 {
  /** 레이아웃 종류(studio 개체 선택 종류) */
  type: 'shape' | 'line' | 'group';
  kind: string;
  page: number;
  cxMm: number;
  cyMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  flipX: boolean;
  flipY: boolean;
  /** 선 끝점(쪽 종이 기준 mm) — 선 · 연결선 */
  x1Mm?: number; y1Mm?: number; x2Mm?: number; y2Mm?: number;
  locked: boolean;
  zOrder: number;
  wrap: EmbedShapeWrapV1 | 'tight' | 'through';
  closed: boolean;
  fill: string | null;
  /** 채우기 불투명도 % */
  opacity: number;
  line: string | null;
  lineWidthPt: number;
  shadow: EmbedShapeShadowV1 | 'other';
  roundRate: number | null;
  hasText: boolean;
  canText: boolean;
  description: string;
}
export interface EmbedShapeUpdateItemV1 extends EmbedShapeRefV1 {
  widthMm?: number;
  heightMm?: number;
  dxMm?: number;
  dyMm?: number;
  rotationDeg?: number;
  flipX?: boolean;
  flipY?: boolean;
  fill?: string | null;
  opacity?: number;
  line?: string | null;
  lineWidthPt?: number;
  shadow?: EmbedShapeShadowV1;
  roundRate?: number;
  wrap?: EmbedShapeWrapV1;
  locked?: boolean;
  order?: 'front' | 'back' | 'forward' | 'backward';
  description?: string;
}
export interface EmbedShapeUpdateV1 { items: EmbedShapeUpdateItemV1[]; select?: boolean }
export interface EmbedShapeRefsV1 { items: EmbedShapeRefV1[] }

const hwpunit = (mm: number) => Math.round((mm * 7200) / 25.4);
const huToMm = (v: number) => Math.round(((v * 25.4) / 7200) * 100) / 100;
const PX_PER_MM = 96 / 25.4;
const pxToMm = (px: number) => Math.round((px / PX_PER_MM) * 100) / 100;
const signed = (v: number) => (v > 0x7fffffff ? v - 0x100000000 : v);
const COLOR = /^#[0-9a-fA-F]{6}$/;
const colorRef = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16);
};
const hexOf = (ref: number) => `#${[ref & 0xff, (ref >> 8) & 0xff, (ref >> 16) & 0xff].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/**
 * 그림자 미리 정한 값(LilyOffice 네 앱 공용 값 — 옅게 = 검정 투명 80 % · 2pt, 보통 = 검정 60 % · 3pt, 레트로 = 차콜 불투명 4pt).
 * HWP 그림자는 흐림이 없는 어긋남이다(HWPUNIT, 1pt = 100) · 투명도 0 = 불투명 … 255 = 투명
 */
const SHADOW_PRESETS: Record<Exclude<EmbedShapeShadowV1, 'none'>, { color: string; off: number; alpha: number }> = {
  soft: { color: '#000000', off: 200, alpha: 204 },
  normal: { color: '#000000', off: 300, alpha: 153 },
  retro: { color: '#17131a', off: 400, alpha: 0 },
};
const WRAP_TO_HWP: Record<Exclude<EmbedShapeWrapV1, 'inline'>, string> = { square: 'Square', topAndBottom: 'TopAndBottom', behind: 'BehindText', front: 'InFrontOfText' };

// ---------------------------------------------------------------- 인자 검사

function num(v: unknown, key: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${key} must be a number from ${min} to ${max}`);
  return v;
}
function index(v: unknown, key: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1_000_000) throw new Error(`${key} must be a non-negative integer`);
  return v;
}
function bool(v: unknown, key: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`${key} must be a boolean`);
  return v;
}
function colorOrNull(v: unknown, key: string): string | null {
  if (v === null) return null;
  if (typeof v !== 'string' || !COLOR.test(v)) throw new Error(`${key} must be #rrggbb or null`);
  return v.toLowerCase();
}
function oneOf<T extends string>(v: unknown, list: readonly T[], key: string): T {
  if (!list.includes(v as T)) throw new Error(`${key} must be one of ${list.join(', ')}`);
  return v as T;
}
function description(v: unknown, key: string): string {
  if (typeof v !== 'string' || v.length > 4096) throw new Error(`${key} must be a string (max 4096 chars)`);
  return v;
}

export function parseShapeCreate(value: Record<string, unknown>): EmbedShapeCreateV1 {
  const out: EmbedShapeCreateV1 = {
    page: index(value.page, 'page'),
    xMm: num(value.xMm, 'xMm', -1000, 2000), yMm: num(value.yMm, 'yMm', -1000, 2000),
    widthMm: num(value.widthMm, 'widthMm', 0, 1000), heightMm: num(value.heightMm, 'heightMm', 0, 1000),
    kind: oneOf(value.kind, SHAPE_KINDS, 'kind'),
  };
  if (out.widthMm === 0 && out.heightMm === 0) throw new Error('widthMm and heightMm cannot both be 0');
  if (value.roundRate !== undefined) out.roundRate = num(value.roundRate, 'roundRate', 0, 50);
  if (value.paths !== undefined) {
    if (!Array.isArray(value.paths) || value.paths.length < 1 || value.paths.length > 32) throw new Error('paths must be an array (1–32)');
    out.paths = value.paths.map((raw, i) => {
      const o = raw as Record<string, unknown>;
      if (!o || !Array.isArray(o.pts) || o.pts.length < 2 || o.pts.length > 2000) throw new Error(`paths[${i}].pts must have 2–2000 points`);
      const pts = o.pts.map((p, j) => {
        if (!Array.isArray(p) || p.length !== 2) throw new Error(`paths[${i}].pts[${j}] must be [x, y]`);
        return [num(p[0], `paths[${i}].pts[${j}][0]`, -2000, 2000), num(p[1], `paths[${i}].pts[${j}][1]`, -2000, 2000)] as [number, number];
      });
      return { pts, closed: bool(o.closed, `paths[${i}].closed`) };
    });
  }
  if (out.kind === 'polygon' && !out.paths) throw new Error('polygon needs paths');
  if (value.flipX !== undefined) out.flipX = bool(value.flipX, 'flipX');
  if (value.flipY !== undefined) out.flipY = bool(value.flipY, 'flipY');
  if (value.arrow !== undefined) out.arrow = oneOf(value.arrow, ['end', 'both'] as const, 'arrow');
  if (value.fill !== undefined) out.fill = colorOrNull(value.fill, 'fill');
  if (value.line !== undefined) out.line = colorOrNull(value.line, 'line');
  if (value.lineWidthPt !== undefined) out.lineWidthPt = num(value.lineWidthPt, 'lineWidthPt', 0, 100);
  if (value.description !== undefined) out.description = description(value.description, 'description');
  return out;
}

function parseRef(v: unknown, key: string): EmbedShapeRefV1 {
  if (!v || typeof v !== 'object') throw new Error(`${key} must be an object`);
  const o = v as Record<string, unknown>;
  return { sec: index(o.sec, `${key}.sec`), para: index(o.para, `${key}.para`), ci: index(o.ci, `${key}.ci`) };
}
function items(v: unknown): unknown[] {
  if (!Array.isArray(v) || v.length > 500) throw new Error('items must be an array (max 500)');
  return v;
}
export function parseShapeRefs(value: Record<string, unknown>): EmbedShapeRefsV1 {
  return { items: items(value.items).map((r, i) => parseRef(r, `items[${i}]`)) };
}
export function parseShapeRef(value: Record<string, unknown>): EmbedShapeRefV1 {
  return parseRef(value, 'params');
}
const UPDATE_KEYS = new Set(['sec', 'para', 'ci', 'widthMm', 'heightMm', 'dxMm', 'dyMm', 'rotationDeg', 'flipX', 'flipY', 'fill', 'opacity', 'line', 'lineWidthPt', 'shadow', 'roundRate', 'wrap', 'locked', 'order', 'description']);
export function parseShapeUpdate(value: Record<string, unknown>): EmbedShapeUpdateV1 {
  const list = items(value.items).map((raw, i) => {
    const key = `items[${i}]`;
    const it: EmbedShapeUpdateItemV1 = parseRef(raw, key);
    const o = raw as Record<string, unknown>;
    for (const k of Object.keys(o)) if (!UPDATE_KEYS.has(k)) throw new Error(`${key}.${k} is not allowed`);
    if (o.widthMm !== undefined) it.widthMm = num(o.widthMm, `${key}.widthMm`, 0.5, 1000);
    if (o.heightMm !== undefined) it.heightMm = num(o.heightMm, `${key}.heightMm`, 0, 1000);
    if (o.dxMm !== undefined) it.dxMm = num(o.dxMm, `${key}.dxMm`, -2000, 2000);
    if (o.dyMm !== undefined) it.dyMm = num(o.dyMm, `${key}.dyMm`, -2000, 2000);
    if (o.rotationDeg !== undefined) it.rotationDeg = num(o.rotationDeg, `${key}.rotationDeg`, -3600, 3600);
    if (o.flipX !== undefined) it.flipX = bool(o.flipX, `${key}.flipX`);
    if (o.flipY !== undefined) it.flipY = bool(o.flipY, `${key}.flipY`);
    if (o.fill !== undefined) it.fill = colorOrNull(o.fill, `${key}.fill`);
    if (o.opacity !== undefined) it.opacity = num(o.opacity, `${key}.opacity`, 0, 100);
    if (o.line !== undefined) it.line = colorOrNull(o.line, `${key}.line`);
    if (o.lineWidthPt !== undefined) it.lineWidthPt = num(o.lineWidthPt, `${key}.lineWidthPt`, 0, 100);
    if (o.shadow !== undefined) it.shadow = oneOf(o.shadow, SHAPE_SHADOWS, `${key}.shadow`);
    if (o.roundRate !== undefined) it.roundRate = num(o.roundRate, `${key}.roundRate`, 0, 50);
    if (o.wrap !== undefined) it.wrap = oneOf(o.wrap, SHAPE_WRAPS, `${key}.wrap`);
    if (o.locked !== undefined) it.locked = bool(o.locked, `${key}.locked`);
    if (o.order !== undefined) it.order = oneOf(o.order, ['front', 'back', 'forward', 'backward'] as const, `${key}.order`);
    if (o.description !== undefined) it.description = description(o.description, `${key}.description`);
    return it;
  });
  const out: EmbedShapeUpdateV1 = { items: list };
  if (value.select !== undefined) out.select = bool(value.select, 'select');
  return out;
}
export function parseShapeTyping(value: Record<string, unknown>): { on: boolean } {
  return { on: bool(value.on, 'on') };
}

// ---------------------------------------------------------------- 넣기

/** 꾸밈 키(lilyShapeStyle): 채우기 · 선 · 그림자 */
function styleProps(it: { fill?: string | null; opacity?: number; line?: string | null; lineWidthPt?: number; shadow?: EmbedShapeShadowV1 }, cur?: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (it.fill === null) p.fillNone = true;
  else if (it.fill) p.fillColor = colorRef(it.fill);
  if (it.opacity !== undefined) p.fillAlpha = Math.round(((100 - it.opacity) * 255) / 100);
  if (it.line === null) p.lineType = 0;
  else if (it.line) {
    p.borderColor = colorRef(it.line);
    if (!cur || Number(cur.lineType ?? 1) === 0) p.lineType = 1;
  }
  if (it.lineWidthPt !== undefined) {
    // 굵기 = HWPUNIT(1pt = 100)
    p.borderWidth = Math.max(1, Math.round(it.lineWidthPt * 100));
    if (it.lineWidthPt > 0 && cur && Number(cur.lineType ?? 1) === 0 && it.line === undefined) p.lineType = 1;
  }
  if (it.shadow === 'none') p.shadowType = 0;
  else if (it.shadow) {
    const s = SHADOW_PRESETS[it.shadow];
    Object.assign(p, { shadowType: 4, shadowColor: colorRef(s.color), shadowOffsetX: s.off, shadowOffsetY: s.off, shadowAlpha: s.alpha });
  }
  return p;
}

/** 도형 하나를 넣고 고른다(한 단계). 닻을 내릴 본문 글이 없으면 ok: false */
export function createShape(ih: InputHandler, wasm: WasmBridge, req: EmbedShapeCreateV1): { ok: boolean; ref?: EmbedShapeRefV1 } {
  if (req.page >= wasm.pageCount) return { ok: false };
  const at = anchorOnPage(wasm, req.page, req.xMm + req.widthMm / 2, req.yMm + req.heightMm / 2);
  if (!at) return { ok: false };
  const lineLike = req.kind === 'line' || req.kind.startsWith('connector-');
  const w = Math.max(lineLike ? 0 : 200, hwpunit(req.widthMm));
  const h = Math.max(lineLike ? 0 : 200, hwpunit(req.heightMm));
  const x = hwpunit(req.xMm), y = hwpunit(req.yMm);
  let ok = false;
  let ref: EmbedShapeRefV1 | null = null;
  let type: 'shape' | 'line' | 'group' = lineLike ? 'line' : 'shape';
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'createShape',
    operation: (wb) => {
      const place = { treatAsChar: false, textWrap: 'InFrontOfText', horzRelTo: 'Paper', vertRelTo: 'Paper', horzAlign: 'Left', vertAlign: 'Top' };
      const one = (kind: string, x0: number, y0: number, w0: number, h0: number, points?: { x: number; y: number }[]) => {
        const r = wb.createShapeControl({
          sectionIdx: at.sectionIndex, paraIdx: at.paragraphIndex, charOffset: at.charOffset, width: w0, height: h0, horzOffset: x0, vertOffset: y0,
          shapeType: kind, treatAsChar: false, textWrap: 'InFrontOfText', lineFlipX: !!req.flipX, lineFlipY: !!req.flipY,
          ...(points && { polygonPoints: points }),
        });
        if (!r.ok) return null;
        wb.setShapeProperties(at.sectionIndex, r.paraIdx, r.controlIdx, { ...place, horzOffset: x0, vertOffset: y0 });
        return { sec: at.sectionIndex, para: r.paraIdx, ci: r.controlIdx };
      };
      const style: Record<string, unknown> = styleProps({ fill: req.fill, line: req.line, lineWidthPt: req.lineWidthPt });
      if (req.kind === 'polygon' && req.paths) {
        // 길마다 다각형(자기 상자 = 그 길의 범위). 둘 이상이면 묶는다
        const made: { r: EmbedShapeRefV1; closed: boolean }[] = [];
        for (const path of req.paths) {
          const xs = path.pts.map((p) => p[0]), ys = path.pts.map((p) => p[1]);
          const minX = Math.min(...xs), minY = Math.min(...ys);
          const pw = Math.max(1, hwpunit(Math.max(...xs) - minX)), ph = Math.max(1, hwpunit(Math.max(...ys) - minY));
          const pts = path.pts.map(([px, py]) => ({ x: hwpunit(px - minX), y: hwpunit(py - minY) }));
          if (path.closed) pts.push({ ...pts[0] });
          // 다른 문단 컨트롤 번호가 밀리지 않게 같은 자리(닻 글자 앞)에 차례로 넣는다 — 새 컨트롤이 앞에 들어가 앞서 만든 것의 번호가 하나씩 밀린다
          const r = one('polygon', x + hwpunit(minX), y + hwpunit(minY), pw, ph, pts);
          if (!r) return at;
          for (const m of made) if (m.r.para === r.para && m.r.ci >= r.ci) m.r.ci += 1;
          made.push({ r, closed: path.closed });
        }
        for (const m of made) {
          const s = { ...style };
          if (!m.closed) { s.fillNone = true; delete s.fillColor; }
          if (Object.keys(s).length) wb.lilyShapeStyle(m.r.sec, m.r.para, m.r.ci, s);
        }
        if (made.length === 1) {
          ref = made[0].r;
        } else {
          const g = wb.groupShapes(at.sectionIndex, made.map((m) => ({ paraIdx: m.r.para, controlIdx: m.r.ci })));
          if (!g.ok) return at;
          ref = { sec: at.sectionIndex, para: g.paraIdx, ci: g.controlIdx };
          type = 'group';
          wb.setShapeProperties(ref.sec, ref.para, ref.ci, { ...place, horzOffset: x, vertOffset: y });
        }
      } else {
        ref = one(req.kind, x, y, w, h);
        if (!ref) return at;
        const extra: Record<string, unknown> = {};
        if (req.kind === 'rectangle' && req.roundRate) extra.roundRate = Math.round(req.roundRate);
        if (req.arrow) { extra.arrowEnd = 1; extra.arrowEndSize = 4; }
        if (req.arrow === 'both') { extra.arrowStart = 1; extra.arrowStartSize = 4; }
        if (Object.keys(extra).length) wb.setShapeProperties(ref.sec, ref.para, ref.ci, extra);
        if (Object.keys(style).length) wb.lilyShapeStyle(ref.sec, ref.para, ref.ci, style);
      }
      if (req.description !== undefined) wb.setShapeProperties(ref!.sec, ref!.para, ref!.ci, { description: req.description });
      ok = true;
      return at;
    },
  });
  if (!ok || !ref) return { ok: false };
  const r: EmbedShapeRefV1 = ref;
  ih.lilySelectObjects([{ sec: r.sec, ppi: r.para, ci: r.ci, type }]);
  return { ok: true, ref: r };
}

// ---------------------------------------------------------------- 읽기

type LayoutCtrl = { type: string; x: number; y: number; w: number; h: number; x1?: number; y1?: number; x2?: number; y2?: number; secIdx?: number; paraIdx?: number; controlIdx?: number; zOrder?: number; cellPath?: unknown; cellIdx?: number; headerFooter?: unknown; noteRef?: unknown };

function layoutOf(wasm: WasmBridge, page: number): LayoutCtrl[] {
  try { return wasm.getPageControlLayout(page).controls as unknown as LayoutCtrl[]; } catch { return []; }
}
function isBodyShape(c: LayoutCtrl): boolean {
  return (c.type === 'shape' || c.type === 'line' || c.type === 'group') && c.secIdx !== undefined && c.paraIdx !== undefined && c.controlIdx !== undefined
    && !(Array.isArray(c.cellPath) && c.cellPath.length) && c.cellIdx === undefined && !c.headerFooter && !c.noteRef;
}
const WRAP_FROM_HWP: Record<string, EmbedShapeInfoV1['wrap']> = { Square: 'square', TopAndBottom: 'topAndBottom', BehindText: 'behind', InFrontOfText: 'front', Tight: 'tight', Through: 'through' };

function shadowOf(st: Record<string, unknown>): EmbedShapeInfoV1['shadow'] {
  if (!Number(st.shadowType ?? 0)) return 'none';
  const color = hexOf(Number(st.shadowColor ?? 0));
  const off = Number(st.shadowOffsetX ?? 0);
  const alpha = Number(st.shadowAlpha ?? 0);
  for (const [k, v] of Object.entries(SHADOW_PRESETS)) if (v.color === color && v.off === off && Math.abs(v.alpha - alpha) < 3) return k as EmbedShapeShadowV1;
  return 'other';
}

function infoOf(wasm: WasmBridge, page: number, c: LayoutCtrl): EmbedShapeInfoV1 | null {
  try {
    const p = wasm.getShapeProperties(c.secIdx!, c.paraIdx!, c.controlIdx!) as unknown as Record<string, unknown>;
    const st = wasm.lilyShapeStyleGet(c.secIdx!, c.paraIdx!, c.controlIdx!);
    let rot = Number(p.rotationAngle ?? 0) % 360;
    if (rot > 180) rot -= 360;
    if (rot <= -180) rot += 360;
    const lineOff = Number(st.lineType ?? 1) === 0;
    const alpha = Number(st.fillAlpha ?? 0);
    const info: EmbedShapeInfoV1 = {
      sec: c.secIdx!, para: c.paraIdx!, ci: c.controlIdx!, type: c.type as EmbedShapeInfoV1['type'], kind: String(st.kind ?? c.type), page,
      cxMm: pxToMm(c.x + c.w / 2), cyMm: pxToMm(c.y + c.h / 2),
      widthMm: huToMm(Number(p.width)), heightMm: huToMm(Number(p.height)), rotationDeg: rot,
      flipX: !!p.horzFlip, flipY: !!p.vertFlip,
      locked: !!p.sizeProtect, zOrder: Number(p.zOrder ?? c.zOrder ?? 0),
      wrap: p.treatAsChar ? 'inline' : WRAP_FROM_HWP[String(p.textWrap)] ?? 'front',
      closed: !!st.closed,
      fill: st.fill ? hexOf(Number(st.fillColor)) : null,
      opacity: Math.round(100 - (alpha * 100) / 255),
      line: lineOff ? null : hexOf(Number(st.borderColor ?? 0)),
      lineWidthPt: Math.round(Number(st.borderWidth ?? 0)) / 100,
      shadow: shadowOf(st),
      roundRate: typeof st.roundRate === 'number' ? st.roundRate : null,
      hasText: !!st.hasText, canText: !!st.canText,
      description: typeof p.description === 'string' ? p.description : '',
    };
    if (c.type === 'line' && c.x1 !== undefined) Object.assign(info, { x1Mm: pxToMm(c.x1), y1Mm: pxToMm(c.y1!), x2Mm: pxToMm(c.x2!), y2Mm: pxToMm(c.y2!) });
    return info;
  } catch {
    return null;
  }
}

/** 본문의 떠 있는(또는 글자처럼 취급하는) 도형 · 선 · 묶음. 한 개체는 처음 그려진 쪽에 한 번 */
export function listShapes(wasm: WasmBridge): { pages: { widthMm: number; heightMm: number }[]; items: EmbedShapeInfoV1[] } {
  const pages: { widthMm: number; heightMm: number }[] = [];
  const out: EmbedShapeInfoV1[] = [];
  const seen = new Set<string>();
  for (let p = 0; p < wasm.pageCount; p++) {
    try {
      const info = wasm.getPageInfo(p);
      pages.push({ widthMm: pxToMm(info.width), heightMm: pxToMm(info.height) });
    } catch { pages.push({ widthMm: 0, heightMm: 0 }); }
    for (const c of layoutOf(wasm, p)) {
      if (!isBodyShape(c)) continue;
      const key = `${c.secIdx}:${c.paraIdx}:${c.controlIdx}`;
      if (seen.has(key)) continue;
      const it = infoOf(wasm, p, c);
      if (!it) continue;
      seen.add(key);
      out.push(it);
    }
  }
  return { pages, items: out };
}

/** 지금 고른 본문 도형들(고른 차례). 도형 아닌 개체가 섞였으면 빈 목록 */
export function selectedShapes(ih: InputHandler, wasm: WasmBridge): { items: EmbedShapeInfoV1[] } {
  if (!ih.isInPictureObjectSelection()) return { items: [] };
  type Ref = { sec: number; ppi: number; ci: number; type: string; cellPath?: unknown[]; cellIdx?: number; headerFooter?: unknown; noteRef?: unknown };
  const one = ih.getSelectedPictureRef() as Ref | null;
  const refs = (ih.isMultiPictureSelection() ? ih.getSelectedPictureRefs() : one ? [one] : []) as Ref[];
  const want = refs.filter((r) => (r.type === 'shape' || r.type === 'line' || r.type === 'group') && !r.cellPath?.length && r.cellIdx === undefined && !r.headerFooter && !r.noteRef);
  if (!want.length || want.length !== refs.length) return { items: [] };
  const keys = new Set(want.map((r) => `${r.sec}:${r.ppi}:${r.ci}`));
  const found = new Map<string, EmbedShapeInfoV1>();
  for (let p = 0; p < wasm.pageCount && found.size < keys.size; p++) {
    for (const c of layoutOf(wasm, p)) {
      if (!isBodyShape(c)) continue;
      const key = `${c.secIdx}:${c.paraIdx}:${c.controlIdx}`;
      if (!keys.has(key) || found.has(key)) continue;
      const it = infoOf(wasm, p, c);
      if (it) found.set(key, it);
    }
  }
  return { items: want.map((r) => found.get(`${r.sec}:${r.ppi}:${r.ci}`)).filter((x): x is EmbedShapeInfoV1 => !!x) };
}

/** 레이아웃에서 그 개체의 선택 종류(shape · line · group) */
function typesOf(wasm: WasmBridge, refs: EmbedShapeRefV1[]): Map<string, 'shape' | 'line' | 'group'> {
  const want = new Set(refs.map((r) => `${r.sec}:${r.para}:${r.ci}`));
  const out = new Map<string, 'shape' | 'line' | 'group'>();
  for (let p = 0; p < wasm.pageCount && out.size < want.size; p++) {
    for (const c of layoutOf(wasm, p)) {
      if (!isBodyShape(c)) continue;
      const k = `${c.secIdx}:${c.paraIdx}:${c.controlIdx}`;
      if (want.has(k) && !out.has(k)) out.set(k, c.type as 'shape' | 'line' | 'group');
    }
  }
  return out;
}
function selectRefs(ih: InputHandler, wasm: WasmBridge, refs: EmbedShapeRefV1[]): void {
  const types = typesOf(wasm, refs);
  ih.lilySelectObjects(refs.map((r) => ({ sec: r.sec, ppi: r.para, ci: r.ci, type: types.get(`${r.sec}:${r.para}:${r.ci}`) ?? 'shape' })));
}

export function selectShapes(ih: InputHandler, wasm: WasmBridge, req: EmbedShapeRefsV1): { ok: boolean } {
  selectRefs(ih, wasm, req.items);
  return { ok: true };
}

// ---------------------------------------------------------------- 고치기

/** 도형마다 바꿈을 snapshot 하나로(실행 취소 한 단계). 끝나면 그 도형들을 다시 고른다(select:false 가 아니면) */
export function updateShapes(ih: InputHandler, wasm: WasmBridge, req: EmbedShapeUpdateV1): { ok: boolean } {
  if (!req.items.length) return { ok: true };
  // 줄 바꿈을 글자처럼 취급 → 떠 있게 바꿀 때 자리 = 지금 그려진 자리(종이 기준)
  const centres = new Map<string, { x: number; y: number }>();
  if (req.items.some((it) => it.wrap && it.wrap !== 'inline')) {
    for (let p = 0; p < wasm.pageCount; p++) {
      for (const c of layoutOf(wasm, p)) if (isBodyShape(c)) {
        const k = `${c.secIdx}:${c.paraIdx}:${c.controlIdx}`;
        if (!centres.has(k)) centres.set(k, { x: c.x + c.w / 2, y: c.y + c.h / 2 });
      }
    }
  }
  let ok = true;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'shapeProps',
    operation: (w) => {
      const get = (it: EmbedShapeRefV1) => w.getShapeProperties(it.sec, it.para, it.ci) as unknown as Record<string, unknown>;
      const set = (it: EmbedShapeRefV1, props: Record<string, unknown>) => { if (!w.setShapeProperties(it.sec, it.para, it.ci, props).ok) ok = false; };
      for (const it of req.items) {
        try {
          if (it.widthMm !== undefined || it.heightMm !== undefined) {
            const p = get(it);
            const ow = Number(p.width), oh = Number(p.height);
            const nw = it.widthMm !== undefined ? hwpunit(it.widthMm) : ow;
            const nh = it.heightMm !== undefined ? hwpunit(it.heightMm) : oh;
            const props: Record<string, unknown> = { width: nw, height: nh };
            if (!p.treatAsChar) {
              props.horzOffset = Math.round(signed(Number(p.horzOffset)) + (ow - nw) / 2);
              props.vertOffset = Math.round(signed(Number(p.vertOffset)) + (oh - nh) / 2);
            }
            set(it, props);
          }
          if (it.rotationDeg !== undefined) set(it, { rotationAngle: ((Math.round(it.rotationDeg) % 360) + 360) % 360 });
          if (it.flipX !== undefined) set(it, { horzFlip: it.flipX });
          if (it.flipY !== undefined) set(it, { vertFlip: it.flipY });
          if (it.dxMm || it.dyMm) {
            const p = get(it);
            if (!p.treatAsChar) set(it, { horzOffset: signed(Number(p.horzOffset)) + hwpunit(it.dxMm ?? 0), vertOffset: signed(Number(p.vertOffset)) + hwpunit(it.dyMm ?? 0) });
          }
          if (it.wrap === 'inline') set(it, { treatAsChar: true });
          else if (it.wrap) {
            const p = get(it);
            const props: Record<string, unknown> = { treatAsChar: false, textWrap: WRAP_TO_HWP[it.wrap] };
            if (p.treatAsChar) {
              const c = centres.get(`${it.sec}:${it.para}:${it.ci}`);
              if (c) Object.assign(props, {
                horzRelTo: 'Paper', vertRelTo: 'Paper', horzAlign: 'Left', vertAlign: 'Top',
                horzOffset: Math.round(hwpunit(c.x / PX_PER_MM) - Number(p.width) / 2), vertOffset: Math.round(hwpunit(c.y / PX_PER_MM) - Number(p.height) / 2),
              });
            }
            set(it, props);
          }
          if (it.roundRate !== undefined) set(it, { roundRate: Math.round(it.roundRate) });
          const rest: Record<string, unknown> = {};
          if (it.locked !== undefined) rest.sizeProtect = it.locked;
          if (it.description !== undefined) rest.description = it.description;
          if (Object.keys(rest).length) set(it, rest);
          const style = styleProps(it, it.line !== undefined || it.lineWidthPt !== undefined ? w.lilyShapeStyleGet(it.sec, it.para, it.ci) : undefined);
          if (Object.keys(style).length && !w.lilyShapeStyle(it.sec, it.para, it.ci, style).ok) ok = false;
          if (it.order) {
            const r = w.changeShapeZOrder(it.sec, it.para, it.ci, it.order) as unknown as { ok: boolean };
            if (!r.ok) ok = false;
          }
        } catch {
          ok = false;
        }
      }
      return ih.getCursorPosition();
    },
  });
  if (req.select !== false) selectRefs(ih, wasm, req.items);
  return { ok };
}

/** 도형 여럿을 지운다(한 단계). 같은 문단의 뒤 컨트롤부터 */
export function deleteShapes(ih: InputHandler, req: EmbedShapeRefsV1): { ok: boolean } {
  if (!req.items.length) return { ok: true };
  const order = [...req.items].sort((a, b) => b.sec - a.sec || b.para - a.para || b.ci - a.ci);
  let ok = true;
  ih.lilySelectObjects([]);
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'deleteObject',
    operation: (w) => {
      for (const r of order) {
        try { if (!w.deleteShapeControl(r.sec, r.para, r.ci).ok) ok = false; } catch { ok = false; }
      }
      return ih.getCursorPosition();
    },
  });
  return { ok };
}

/** 묶기(같은 구역, 둘 이상) — 묶음을 고른다 */
export function groupShapes(ih: InputHandler, wasm: WasmBridge, req: EmbedShapeRefsV1): { ok: boolean; ref?: EmbedShapeRefV1 } {
  if (req.items.length < 2 || req.items.some((r) => r.sec !== req.items[0].sec)) return { ok: false };
  let ref: EmbedShapeRefV1 | null = null;
  ih.lilySelectObjects([]);
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'groupShapes',
    operation: (w) => {
      try {
        const g = w.groupShapes(req.items[0].sec, req.items.map((r) => ({ paraIdx: r.para, controlIdx: r.ci })));
        if (g.ok) ref = { sec: req.items[0].sec, para: g.paraIdx, ci: g.controlIdx };
      } catch { /* 실패 */ }
      return ih.getCursorPosition();
    },
  });
  if (!ref) return { ok: false };
  const r: EmbedShapeRefV1 = ref;
  ih.lilySelectObjects([{ sec: r.sec, ppi: r.para, ci: r.ci, type: 'group' }]);
  return { ok: true, ref: r };
}

export function ungroupShape(ih: InputHandler, req: EmbedShapeRefV1): { ok: boolean } {
  let ok = false;
  ih.lilySelectObjects([]);
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'ungroupShapes',
    operation: (w) => {
      try { ok = w.ungroupShape(req.sec, req.para, req.ci).ok; } catch { ok = false; }
      return ih.getCursorPosition();
    },
  });
  return { ok };
}

export function editShapeText(ih: InputHandler, req: EmbedShapeRefV1): { ok: boolean } {
  return { ok: ih.lilyEditShapeText(req.sec, req.para, req.ci) };
}
