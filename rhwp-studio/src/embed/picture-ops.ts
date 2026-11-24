/**
 * [lily] 임베드 호스트 떠 있는 그림(picture.* RPC).
 *
 * 마스킹 테이프 · 스티커(@lilyoffice/decor)처럼 글 앞에 놓고 돌린 그림이 필요한데, embed 에는 글자처럼 취급하는 그림(chart.insert)과
 * 종이 기준 도형(shape.insert)뿐이었다. studio 에서는 그림 넣기 + 개체 속성(글 앞으로 · 회전)으로 하는 일이다 — 같은 wasm 함수
 * (insertPicture · setPictureProperties)를 snapshot 하나로 부른다(실행 취소 한 단계).
 *
 * - picture.insert { png(base64), widthMm, heightMm, xMm?, yMm?, rotationDeg?, description?, page? } : 글 앞으로 떠 있는(treatAsChar 아님) 그림을
 *   종이 기준 자리에 넣고 고른다. 자리(xMm · yMm = 회전 전 그림 왼쪽 위, 종이 왼쪽 위에서)를 생략하면 캐럿 구역 글 영역의 한가운데.
 *   `page` 를 주면 자리는 그 쪽 기준이고, 그 자리 아래 본문 글에 닻을 내린다(그 쪽에 그려지게).
 *   투명도는 PNG 알파에 담는다(transparency 속성은 쓰지 않는다). 설명은 HWP 와 HWPX 가 모두 저장한다.
 *
 * 호스트가 그린 떠 있는 그림을 호스트 UI(선택 틀 · 속성 패널 · 끌어 옮기기)로 고치는 길:
 * - picture.list { descriptionPrefix? }  : 본문의 떠 있는 그림(설명이 접두어로 시작하는 것만) — 쪽 · 가운데 · 돌리기 전 크기 · 각도 · 설명 · 잠금 · z
 * - picture.selected                     : 지금 고른 본문 그림들(여럿이면 고른 차례) — 같은 꼴
 * - picture.select { items }             : 그림 여럿을 개체 선택(빈 목록 = 선택 해제)
 * - picture.update { items, select? }    : 그림마다 그림(png) · 크기(돌리기 전, 가운데 유지) · 옮기기(dx · dy) · 각도 · 설명 · 잠금 · 맨 앞/맨 뒤를
 *                                          snapshot 하나로(실행 취소 한 단계). 잠금 = 엔진의 크기 고정(sizeProtect — HWP · HWPX 에 저장, studio 손잡이도 막는다)
 * - picture.delete { items }             : 그림 여럿을 지운다(한 단계)
 * - picture.image { sec, para, ci }      : 그 그림의 원본 바이트(base64) — 호스트가 끄는 동안 그 개체 자기 그림을 보이게
 */
import type { InputHandler } from '../engine/input-handler.ts';
import type { WasmBridge } from '../core/wasm-bridge.ts';

const MAX_PNG_BYTES = 8 * 1024 * 1024;
const MAX_DESC = 4 * 1024;

export interface EmbedPictureInsertV1 {
  png: string;
  widthMm: number;
  heightMm: number;
  xMm?: number;
  yMm?: number;
  /** 시계 방향 각도(도). 정수로 반올림해 0–359 */
  rotationDeg?: number;
  description?: string;
  /** 쪽(0부터) — 주면 xMm · yMm 이 그 쪽 종이 기준이고 그 자리 아래 글에 닻을 내린다 */
  page?: number;
}

export interface EmbedPictureRefV1 { sec: number; para: number; ci: number }
export interface EmbedPictureInfoV1 extends EmbedPictureRefV1 {
  /** 그려진 쪽(0부터) */
  page: number;
  /** 가운데(쪽 종이 왼쪽 위 기준, mm) */
  cxMm: number;
  cyMm: number;
  /** 돌리기 전 크기(mm) */
  widthMm: number;
  heightMm: number;
  /** 시계 방향 각도(-180, 180] */
  rotationDeg: number;
  description: string;
  /** 크기 고정(sizeProtect) */
  locked: boolean;
  zOrder: number;
}
export interface EmbedPictureListV1 {
  /** 쪽마다 종이 크기(mm) */
  pages: { widthMm: number; heightMm: number }[];
  items: EmbedPictureInfoV1[];
}
export interface EmbedPictureUpdateItemV1 extends EmbedPictureRefV1 {
  png?: string;
  widthMm?: number;
  heightMm?: number;
  dxMm?: number;
  dyMm?: number;
  rotationDeg?: number;
  description?: string;
  locked?: boolean;
  order?: 'front' | 'back';
}
export interface EmbedPictureUpdateV1 { items: EmbedPictureUpdateItemV1[]; select?: boolean }
export interface EmbedPictureRefsV1 { items: EmbedPictureRefV1[] }
export interface EmbedPictureInsertResultV1 { ok: boolean; ref?: EmbedPictureRefV1 }

const hwpunit = (mm: number) => Math.round((mm * 7200) / 25.4);

function mm(v: unknown, key: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${key} must be a number from ${min} to ${max} (mm)`);
  return v;
}
function parsePng(v: unknown, key: string): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_PNG_BYTES * 1.4 || !/^[A-Za-z0-9+/=]+$/.test(v)) throw new Error(`${key} must be a base64 string (max 8 MB)`);
  return v;
}
function parseDeg(v: unknown, key: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 3600) throw new Error(`${key} must be a number (degrees)`);
  return v;
}
function parseDescription(v: unknown, key: string): string {
  if (typeof v !== 'string' || v.length > MAX_DESC) throw new Error(`${key} must be a string (max ${MAX_DESC} chars)`);
  return v;
}
function index(v: unknown, key: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1_000_000) throw new Error(`${key} must be a non-negative integer`);
  return v;
}

export function parsePictureInsert(value: Record<string, unknown>): EmbedPictureInsertV1 {
  const out: EmbedPictureInsertV1 = { png: parsePng(value.png, 'png'), widthMm: mm(value.widthMm, 'widthMm', 1, 1000), heightMm: mm(value.heightMm, 'heightMm', 1, 1000) };
  if ((value.xMm === undefined) !== (value.yMm === undefined)) throw new Error('xMm and yMm go together');
  if (value.xMm !== undefined) {
    out.xMm = mm(value.xMm, 'xMm', -1000, 2000);
    out.yMm = mm(value.yMm, 'yMm', -1000, 2000);
  }
  if (value.rotationDeg !== undefined) out.rotationDeg = parseDeg(value.rotationDeg, 'rotationDeg');
  if (value.description !== undefined) out.description = parseDescription(value.description, 'description');
  if (value.page !== undefined) {
    out.page = index(value.page, 'page');
    if (out.xMm === undefined) throw new Error('page needs xMm and yMm');
  }
  return out;
}

function parseRef(v: unknown, key: string): EmbedPictureRefV1 {
  if (!v || typeof v !== 'object') throw new Error(`${key} must be an object`);
  const o = v as Record<string, unknown>;
  return { sec: index(o.sec, `${key}.sec`), para: index(o.para, `${key}.para`), ci: index(o.ci, `${key}.ci`) };
}
function parseItems(v: unknown, key: string): unknown[] {
  if (!Array.isArray(v) || v.length > 500) throw new Error(`${key} must be an array (max 500)`);
  return v;
}
export function parsePictureRefs(value: Record<string, unknown>): EmbedPictureRefsV1 {
  return { items: parseItems(value.items, 'items').map((r, i) => parseRef(r, `items[${i}]`)) };
}
const UPDATE_KEYS = new Set(['sec', 'para', 'ci', 'png', 'widthMm', 'heightMm', 'dxMm', 'dyMm', 'rotationDeg', 'description', 'locked', 'order']);
export function parsePictureUpdate(value: Record<string, unknown>): EmbedPictureUpdateV1 {
  const items = parseItems(value.items, 'items').map((raw, i) => {
    const key = `items[${i}]`;
    const it: EmbedPictureUpdateItemV1 = parseRef(raw, key);
    const o = raw as Record<string, unknown>;
    for (const k of Object.keys(o)) if (!UPDATE_KEYS.has(k)) throw new Error(`${key}.${k} is not allowed`);
    if (o.png !== undefined) it.png = parsePng(o.png, `${key}.png`);
    if (o.widthMm !== undefined) it.widthMm = mm(o.widthMm, `${key}.widthMm`, 1, 1000);
    if (o.heightMm !== undefined) it.heightMm = mm(o.heightMm, `${key}.heightMm`, 1, 1000);
    if (o.dxMm !== undefined) it.dxMm = mm(o.dxMm, `${key}.dxMm`, -2000, 2000);
    if (o.dyMm !== undefined) it.dyMm = mm(o.dyMm, `${key}.dyMm`, -2000, 2000);
    if (o.rotationDeg !== undefined) it.rotationDeg = parseDeg(o.rotationDeg, `${key}.rotationDeg`);
    if (o.description !== undefined) it.description = parseDescription(o.description, `${key}.description`);
    if (o.locked !== undefined) {
      if (typeof o.locked !== 'boolean') throw new Error(`${key}.locked must be a boolean`);
      it.locked = o.locked;
    }
    if (o.order !== undefined) {
      if (o.order !== 'front' && o.order !== 'back') throw new Error(`${key}.order must be 'front' or 'back'`);
      it.order = o.order;
    }
    return it;
  });
  const out: EmbedPictureUpdateV1 = { items };
  if (value.select !== undefined) {
    if (typeof value.select !== 'boolean') throw new Error('select must be a boolean');
    out.select = value.select;
  }
  return out;
}
export function parsePictureImage(value: Record<string, unknown>): EmbedPictureRefV1 {
  return parseRef(value, 'params');
}

function bytesOf(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/** PNG 헤더(IHDR)의 가로·세로 px */
function pngSize(b: Uint8Array): { w: number; h: number } {
  if (b.length < 24 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) throw new Error('not a PNG');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

const PX_PER_MM = 96 / 25.4;
const pxToMm = (px: number) => Math.round((px / PX_PER_MM) * 100) / 100;
/** u32 로 저장된 오프셋(음수가 크게 보인다)을 부호 있는 값으로 */
const signed = (v: number) => (v > 0x7fffffff ? v - 0x100000000 : v);

type Pos = { sectionIndex: number; paragraphIndex: number; charOffset: number };

/** 쪽 위 점(mm) 아래의 본문 글 자리. 표 칸 · 글상자 위면 글 영역 왼쪽 위의 본문 자리 */
function anchorOnPage(wasm: WasmBridge, page: number, xMm: number, yMm: number): Pos | null {
  const body = (h: ReturnType<WasmBridge['hitTest']> | null): Pos | null =>
    h && h.parentParaIndex === undefined && !h.cellPath?.length && !h.isTextBox ? { sectionIndex: h.sectionIndex, paragraphIndex: h.paragraphIndex, charOffset: h.charOffset } : null;
  const hit = (x: number, y: number) => { try { return wasm.hitTest(page, x, y); } catch { return null; } };
  const a = body(hit(xMm * PX_PER_MM, yMm * PX_PER_MM));
  if (a) return a;
  try {
    const info = wasm.getPageInfo(page);
    return body(hit(info.marginLeft + 1, info.marginTop + 1));
  } catch { return null; }
}

/** 글 앞으로 떠 있는 그림 하나를 종이 기준 자리에 넣고 고른다. 닻을 내릴 본문 글이 없으면 ok: false */
export function insertFloatingPicture(ih: InputHandler, wasm: WasmBridge, req: EmbedPictureInsertV1): EmbedPictureInsertResultV1 {
  const data = bytesOf(req.png);
  const px = pngSize(data);
  const width = hwpunit(req.widthMm);
  const height = hwpunit(req.heightMm);
  let at: Pos | null;
  if (req.page !== undefined) {
    if (req.page >= wasm.pageCount || req.xMm === undefined || req.yMm === undefined) return { ok: false };
    at = anchorOnPage(wasm, req.page, req.xMm + req.widthMm / 2, req.yMm + req.heightMm / 2);
  } else {
    const pos = ih.getCursorPosition();
    at = pos.parentParaIndex !== undefined || !ih.isCaretInBodyText() ? null : { sectionIndex: pos.sectionIndex, paragraphIndex: pos.paragraphIndex, charOffset: pos.charOffset };
  }
  if (!at) return { ok: false };
  const anchor = at;
  let x: number;
  let y: number;
  if (req.xMm !== undefined && req.yMm !== undefined) {
    x = hwpunit(req.xMm);
    y = hwpunit(req.yMm);
  } else {
    // 캐럿 구역 글 영역(쪽 크기 − 여백)의 한가운데
    const d = ih.lilyPageDefFull(anchor.sectionIndex);
    x = Math.round(d.marginLeft + (d.width - d.marginLeft - d.marginRight - width) / 2);
    y = Math.round(d.marginTop + (d.height - d.marginTop - d.marginBottom - height) / 2);
  }
  const rotation = req.rotationDeg === undefined ? 0 : ((Math.round(req.rotationDeg) % 360) + 360) % 360;
  let ok = false;
  let para = 0;
  let ci = 0;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'insertPicture',
    operation: (w) => {
      // cellPath '' = 본문 sibling floating picture
      const r = w.insertPicture(anchor.sectionIndex, anchor.paragraphIndex, anchor.charOffset, '', data, width, height, px.w, px.h, 'png', req.description ?? '');
      if (!r.ok) return anchor;
      para = r.paraIdx;
      ci = r.controlIdx;
      ok = w.setPictureProperties(anchor.sectionIndex, para, ci, {
        treatAsChar: false, textWrap: 'InFrontOfText', horzRelTo: 'Paper', vertRelTo: 'Paper',
        horzAlign: 'Left', vertAlign: 'Top', horzOffset: x, vertOffset: y, rotationAngle: rotation,
      }).ok;
      return anchor;
    },
  });
  if (ok) ih.lilySelectObject(anchor.sectionIndex, para, ci);
  return ok ? { ok, ref: { sec: anchor.sectionIndex, para, ci } } : { ok };
}

type LayoutCtrl = { type: string; x: number; y: number; w: number; h: number; secIdx?: number; paraIdx?: number; controlIdx?: number; zOrder?: number; cellPath?: unknown; cellIdx?: number; headerFooter?: unknown; noteRef?: unknown };

function layoutOf(wasm: WasmBridge, page: number): LayoutCtrl[] {
  try { return wasm.getPageControlLayout(page).controls as unknown as LayoutCtrl[]; } catch { return []; }
}

/** 본문의 떠 있는 그림인가(표 칸 · 머리말 · 각주 · 글상자 안 그림은 아니다) */
function isBodyImage(c: LayoutCtrl): boolean {
  return c.type === 'image' && c.secIdx !== undefined && c.paraIdx !== undefined && c.controlIdx !== undefined
    && !(Array.isArray(c.cellPath) && c.cellPath.length) && c.cellIdx === undefined && !c.headerFooter && !c.noteRef;
}

function infoOf(wasm: WasmBridge, page: number, c: LayoutCtrl): EmbedPictureInfoV1 | null {
  try {
    const p = wasm.getPictureProperties(c.secIdx!, c.paraIdx!, c.controlIdx!) as unknown as Record<string, unknown>;
    if (p.treatAsChar) return null;
    let rot = Number(p.rotationAngle ?? 0) % 360;
    if (rot > 180) rot -= 360;
    if (rot <= -180) rot += 360;
    // 가운데 = 레이아웃 상자(돌린 그림은 돌린 바깥 상자)의 가운데. 돌리기 전 크기 = currentWidth · currentHeight([lily] 엔진 게터)
    const hu = (k: string, fallback: number) => (typeof p[k] === 'number' ? (p[k] as number) : fallback);
    const toMmHu = (v: number) => Math.round(((v * 25.4) / 7200) * 100) / 100;
    return {
      sec: c.secIdx!, para: c.paraIdx!, ci: c.controlIdx!, page,
      cxMm: pxToMm(c.x + c.w / 2), cyMm: pxToMm(c.y + c.h / 2),
      widthMm: toMmHu(hu('currentWidth', Number(p.width))), heightMm: toMmHu(hu('currentHeight', Number(p.height))),
      rotationDeg: rot, description: typeof p.description === 'string' ? p.description : '', locked: !!p.sizeProtect, zOrder: hu('zOrder', c.zOrder ?? 0),
    };
  } catch {
    return null;
  }
}

/** 본문의 떠 있는 그림(설명 접두어로 거른다). 한 그림은 처음 그려진 쪽에 한 번 */
export function listPictures(wasm: WasmBridge, prefix?: string): EmbedPictureListV1 {
  const pages: EmbedPictureListV1['pages'] = [];
  const items: EmbedPictureInfoV1[] = [];
  const seen = new Set<string>();
  for (let p = 0; p < wasm.pageCount; p++) {
    try {
      const info = wasm.getPageInfo(p);
      pages.push({ widthMm: pxToMm(info.width), heightMm: pxToMm(info.height) });
    } catch { pages.push({ widthMm: 0, heightMm: 0 }); }
    for (const c of layoutOf(wasm, p)) {
      if (!isBodyImage(c)) continue;
      const key = `${c.secIdx}:${c.paraIdx}:${c.controlIdx}`;
      if (seen.has(key)) continue;
      const it = infoOf(wasm, p, c);
      if (!it || (prefix && !it.description.startsWith(prefix))) continue;
      seen.add(key);
      items.push(it);
    }
  }
  return { pages, items };
}

export function parsePictureList(value: Record<string, unknown>): { descriptionPrefix?: string } {
  if (value.descriptionPrefix === undefined) return {};
  if (typeof value.descriptionPrefix !== 'string' || value.descriptionPrefix.length > 256) throw new Error('descriptionPrefix must be a string (max 256 chars)');
  return { descriptionPrefix: value.descriptionPrefix };
}

/** 지금 고른 본문 그림들(고른 차례). 그림 아닌 개체가 섞였으면 빈 목록 */
export function selectedPictures(ih: InputHandler, wasm: WasmBridge): { items: EmbedPictureInfoV1[] } {
  if (!ih.isInPictureObjectSelection()) return { items: [] };
  type Ref = { sec: number; ppi: number; ci: number; type: string; cellPath?: unknown[]; cellIdx?: number; headerFooter?: unknown; noteRef?: unknown };
  const one = ih.getSelectedPictureRef() as Ref | null;
  const refs = (ih.isMultiPictureSelection() ? ih.getSelectedPictureRefs() : one ? [one] : []) as Ref[];
  const want = refs.filter((r) => r.type === 'image' && !r.cellPath?.length && r.cellIdx === undefined && !r.headerFooter && !r.noteRef);
  if (!want.length || want.length !== refs.length) return { items: [] };
  const keys = new Set(want.map((r) => `${r.sec}:${r.ppi}:${r.ci}`));
  const found = new Map<string, EmbedPictureInfoV1>();
  for (let p = 0; p < wasm.pageCount && found.size < keys.size; p++) {
    for (const c of layoutOf(wasm, p)) {
      if (!isBodyImage(c)) continue;
      const key = `${c.secIdx}:${c.paraIdx}:${c.controlIdx}`;
      if (!keys.has(key) || found.has(key)) continue;
      const it = infoOf(wasm, p, c);
      if (it) found.set(key, it);
    }
  }
  return { items: want.map((r) => found.get(`${r.sec}:${r.ppi}:${r.ci}`)).filter((x): x is EmbedPictureInfoV1 => !!x) };
}

export function selectPictures(ih: InputHandler, req: EmbedPictureRefsV1): { ok: boolean } {
  ih.lilySelectObjects(req.items.map((r) => ({ sec: r.sec, ppi: r.para, ci: r.ci })));
  return { ok: true };
}

/** 구역 안 개체들의 z 범위(렌더 레이아웃 기준) */
function zRange(wasm: WasmBridge, sec: number): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let p = 0; p < wasm.pageCount; p++) {
    for (const c of layoutOf(wasm, p)) {
      if (c.secIdx !== sec || typeof c.zOrder !== 'number' || c.type === 'table') continue;
      min = Math.min(min, c.zOrder);
      max = Math.max(max, c.zOrder);
    }
  }
  return min === Infinity ? { min: 0, max: 0 } : { min, max };
}

/** 그림마다 바꿈을 snapshot 하나로(실행 취소 한 단계). 끝나면 그 그림들을 다시 고른다(select:false 가 아니면) */
export function updatePictures(ih: InputHandler, wasm: WasmBridge, req: EmbedPictureUpdateV1): { ok: boolean } {
  if (!req.items.length) return { ok: true };
  const z = new Map<number, { min: number; max: number }>();
  for (const it of req.items) if (it.order && !z.has(it.sec)) z.set(it.sec, zRange(wasm, it.sec));
  let ok = true;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'insertPicture',
    operation: (w) => {
      const get = (it: EmbedPictureRefV1) => w.getPictureProperties(it.sec, it.para, it.ci) as unknown as Record<string, unknown>;
      const set = (it: EmbedPictureRefV1, props: Record<string, unknown>) => { if (!w.setPictureProperties(it.sec, it.para, it.ci, props).ok) ok = false; };
      for (const it of req.items) {
        try {
          if (it.png) {
            const data = bytesOf(it.png);
            const px = pngSize(data);
            if (!w.assignPictureImage(it.sec, it.para, '', it.ci, data, px.w, px.h, 'png').ok) ok = false;
          }
          if (it.widthMm !== undefined || it.heightMm !== undefined) {
            // 돌린 그림의 크기 칸은 돌린 상자다 — 잠깐 0° 로 되돌려(가운데 유지) 실제 크기를 바꾸고 다시 돌린다
            const rot = Number(get(it).rotationAngle ?? 0);
            if (rot % 360) set(it, { rotationAngle: 0 });
            const p = get(it);
            const ow = Number(p.width), oh = Number(p.height);
            const nw = it.widthMm !== undefined ? hwpunit(it.widthMm) : ow;
            const nh = it.heightMm !== undefined ? hwpunit(it.heightMm) : oh;
            set(it, {
              width: nw, height: nh,
              horzOffset: Math.round(signed(Number(p.horzOffset)) + (ow - nw) / 2),
              vertOffset: Math.round(signed(Number(p.vertOffset)) + (oh - nh) / 2),
            });
            if (rot % 360) set(it, { rotationAngle: rot });
          }
          if (it.rotationDeg !== undefined) set(it, { rotationAngle: ((Math.round(it.rotationDeg) % 360) + 360) % 360 });
          if (it.dxMm || it.dyMm) {
            const p = get(it);
            set(it, { horzOffset: signed(Number(p.horzOffset)) + hwpunit(it.dxMm ?? 0), vertOffset: signed(Number(p.vertOffset)) + hwpunit(it.dyMm ?? 0) });
          }
          const rest: Record<string, unknown> = {};
          if (it.description !== undefined) rest.description = it.description;
          if (it.locked !== undefined) rest.sizeProtect = it.locked;
          if (it.order) {
            const r = z.get(it.sec)!;
            if (it.order === 'front') { r.max += 1; rest.zOrder = r.max; } else { r.min -= 1; rest.zOrder = r.min; }
          }
          if (Object.keys(rest).length) set(it, rest);
        } catch {
          ok = false;
        }
      }
      return ih.getCursorPosition();
    },
  });
  if (req.select !== false) ih.lilySelectObjects(req.items.map((r) => ({ sec: r.sec, ppi: r.para, ci: r.ci })));
  return { ok };
}

/** 그림 여럿을 지운다(한 단계). 같은 문단의 뒤 컨트롤부터 지워 번호가 밀리지 않게 */
export function deletePictures(ih: InputHandler, req: EmbedPictureRefsV1): { ok: boolean } {
  if (!req.items.length) return { ok: true };
  const order = [...req.items].sort((a, b) => b.sec - a.sec || b.para - a.para || b.ci - a.ci);
  let ok = true;
  ih.lilySelectObjects([]);
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'deleteObject',
    operation: (w) => {
      for (const r of order) {
        try { if (!w.deletePictureControl(r.sec, r.para, r.ci).ok) ok = false; } catch { ok = false; }
      }
      return ih.getCursorPosition();
    },
  });
  return { ok };
}

/** 그 그림의 원본 바이트(base64). 그림이 아니면 null */
export function pictureImage(wasm: WasmBridge, ref: EmbedPictureRefV1): { data: string } | null {
  try {
    const b = wasm.getControlImageData(ref.sec, ref.para, ref.ci);
    if (!b?.length) return null;
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return { data: btoa(s) };
  } catch {
    return null;
  }
}
