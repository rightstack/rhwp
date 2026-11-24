/**
 * [lily] 임베드 호스트 차트(chart.insert · chart.selected · chart.replace RPC).
 *
 * rhwp 는 한컴이 만든 OOXML 차트를 읽고 그리고 값만 고칠 수 있지만(`setChartData`), 차트를 새로 만드는 길이 없다
 * (docs/research/hdocs-charts.md). 호스트(LilyOffice 에이치독스)가 차트를 그린 그림(PNG)을 넣고, 그림 설명(alt)에
 * `lily-chart:` 로 시작하는 차트 정의(JSON)를 실어 두면 다시 골랐을 때 호스트 UI(도구 줄 · 속성 패널)로 고칠 수 있다.
 * 그림 설명은 HWP 와 HWPX 가 모두 저장한다 — 한컴오피스에서는 보통 그림으로 열리고, 우리 앱에서만 차트로 고쳐진다.
 *
 * - chart.insert { png(base64), widthMm, heightMm, description } : 캐럿 자리에 글자처럼 취급하는 그림을 넣고 고른다(실행 취소 한 단계)
 * - chart.selected : 고른 개체가 `lily-chart:` 그림이면 { description, widthMm, heightMm } (아니면 null)
 * - chart.replace { png, description, widthMm?, heightMm? } : 고른 차트 그림의 이미지와 설명을 바꾼다(자리 유지, 실행 취소 한 단계)
 */
import type { InputHandler } from '../engine/input-handler.ts';

export const CHART_DESC_PREFIX = 'lily-chart:';
const MAX_PNG_BYTES = 8 * 1024 * 1024;
const MAX_DESC = 64 * 1024;

export interface EmbedChartInsertV1 {
  png: string;
  widthMm: number;
  heightMm: number;
  description: string;
}
export interface EmbedChartReplaceV1 {
  png: string;
  description: string;
  widthMm?: number;
  heightMm?: number;
}
export interface EmbedChartSelectedV1 {
  description: string;
  widthMm: number;
  heightMm: number;
  /** 놓인 구역의 쪽 폭과 좌우 여백(mm) — 호스트의 크기 손잡이 맞춤선용(없을 수 있다) */
  page?: { widthMm: number; marginLeftMm: number; marginRightMm: number };
}

const hwpunit = (mm: number) => Math.round((mm * 7200) / 25.4);
const toMm = (hu: number) => Math.round(((hu * 25.4) / 7200) * 10) / 10;

function parseDesc(v: unknown): string {
  if (typeof v !== 'string' || !v.startsWith(CHART_DESC_PREFIX) || v.length > MAX_DESC) throw new Error(`description must start with ${CHART_DESC_PREFIX} (max ${MAX_DESC} chars)`);
  return v;
}
function parsePng(v: unknown): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_PNG_BYTES * 1.4 || !/^[A-Za-z0-9+/=]+$/.test(v)) throw new Error('png must be a base64 string (max 8 MB)');
  return v;
}
function parseMm(v: unknown, key: string, optional = false): number | undefined {
  if (v === undefined && optional) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 10 || v > 1000) throw new Error(`${key} must be a number from 10 to 1000 (mm)`);
  return v;
}

export function parseChartInsert(value: Record<string, unknown>): EmbedChartInsertV1 {
  return { png: parsePng(value.png), widthMm: parseMm(value.widthMm, 'widthMm')!, heightMm: parseMm(value.heightMm, 'heightMm')!, description: parseDesc(value.description) };
}
export function parseChartReplace(value: Record<string, unknown>): EmbedChartReplaceV1 {
  return { png: parsePng(value.png), description: parseDesc(value.description), widthMm: parseMm(value.widthMm, 'widthMm', true), heightMm: parseMm(value.heightMm, 'heightMm', true) };
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

/** 고른 개체가 본문의 그림이면 참조를 준다 */
function pictureRef(ih: InputHandler) {
  if (!ih.isInPictureObjectSelection()) return null;
  const ref = ih.getSelectedPictureRef();
  if (!ref || ref.type !== 'image' || ref.cellPath?.length || ref.cellIdx !== undefined || ref.noteRef || ref.headerFooter) return null;
  return ref;
}

export function selectedChart(ih: InputHandler): EmbedChartSelectedV1 | null {
  const ref = pictureRef(ih);
  if (!ref) return null;
  try {
    const p = ih.lilyPictureProps(ref);
    const description = typeof p.description === 'string' ? p.description : '';
    if (!description.startsWith(CHART_DESC_PREFIX)) return null;
    let page: EmbedChartSelectedV1['page'];
    try {
      const d = ih.lilyPageDef(ref.sec);
      page = { widthMm: toMm(d.width), marginLeftMm: toMm(d.marginLeft), marginRightMm: toMm(d.marginRight) };
    } catch { /* 맞춤선만 없다 */ }
    return { description, widthMm: toMm(p.width), heightMm: toMm(p.height), page };
  } catch {
    return null;
  }
}

export function insertChart(ih: InputHandler, req: EmbedChartInsertV1): { ok: boolean } {
  const pos = ih.getCursorPosition();
  if (pos.parentParaIndex !== undefined || !ih.isCaretInBodyText()) return { ok: false };
  const data = bytesOf(req.png);
  const px = pngSize(data);
  let ok = false;
  let para = 0;
  let ci = 0;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'insertPicture',
    operation: (wasm) => {
      const r = wasm.insertPicture(pos.sectionIndex, pos.paragraphIndex, pos.charOffset, '', data, hwpunit(req.widthMm), hwpunit(req.heightMm), px.w, px.h, 'png', req.description);
      if (!r.ok) return pos;
      ok = wasm.setPictureProperties(pos.sectionIndex, r.paraIdx, r.controlIdx, { treatAsChar: true }).ok;
      para = r.paraIdx;
      ci = r.controlIdx;
      return { sectionIndex: pos.sectionIndex, paragraphIndex: r.paraIdx, charOffset: typeof r.logicalOffset === 'number' ? r.logicalOffset : pos.charOffset + 1 };
    },
  });
  if (ok) ih.lilySelectObject(pos.sectionIndex, para, ci);
  return { ok };
}

export function replaceChart(ih: InputHandler, req: EmbedChartReplaceV1): { ok: boolean } {
  const ref = pictureRef(ih);
  if (!ref || !selectedChart(ih)) return { ok: false };
  const data = bytesOf(req.png);
  const px = pngSize(data);
  let ok = false;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'insertPicture',
    operation: (wasm) => {
      const a = wasm.assignPictureImage(ref.sec, ref.ppi, '', ref.ci, data, px.w, px.h, 'png');
      if (!a.ok) return ih.getCursorPosition();
      const props: Record<string, unknown> = { description: req.description };
      if (req.widthMm !== undefined) props.width = hwpunit(req.widthMm);
      if (req.heightMm !== undefined) props.height = hwpunit(req.heightMm);
      ok = wasm.setPictureProperties(ref.sec, ref.ppi, ref.ci, props).ok;
      return ih.getCursorPosition();
    },
  });
  return { ok };
}
