/**
 * [lily] 임베드 호스트 떠 있는 그림(picture.insert RPC).
 *
 * 마스킹 테이프 · 스티커(@lilyoffice/decor)처럼 글 앞에 놓고 돌린 그림이 필요한데, embed 에는 글자처럼 취급하는 그림(chart.insert)과
 * 종이 기준 도형(shape.insert)뿐이었다. studio 에서는 그림 넣기 + 개체 속성(글 앞으로 · 회전)으로 하는 일이다 — 같은 wasm 함수
 * (insertPicture · setPictureProperties)를 snapshot 하나로 부른다(실행 취소 한 단계).
 *
 * - picture.insert { png(base64), widthMm, heightMm, xMm?, yMm?, rotationDeg?, description? } : 글 앞으로 떠 있는(treatAsChar 아님) 그림을
 *   종이 기준 자리에 넣고 고른다. 자리(xMm · yMm = 회전 전 그림 왼쪽 위, 종이 왼쪽 위에서)를 생략하면 캐럿 구역 글 영역의 한가운데.
 *   투명도는 PNG 알파에 담는다(transparency 속성은 쓰지 않는다). 설명은 HWP 와 HWPX 가 모두 저장한다
 */
import type { InputHandler } from '../engine/input-handler.ts';

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
}

const hwpunit = (mm: number) => Math.round((mm * 7200) / 25.4);

function mm(v: unknown, key: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${key} must be a number from ${min} to ${max} (mm)`);
  return v;
}

export function parsePictureInsert(value: Record<string, unknown>): EmbedPictureInsertV1 {
  const png = value.png;
  if (typeof png !== 'string' || png.length === 0 || png.length > MAX_PNG_BYTES * 1.4 || !/^[A-Za-z0-9+/=]+$/.test(png)) throw new Error('png must be a base64 string (max 8 MB)');
  const out: EmbedPictureInsertV1 = { png, widthMm: mm(value.widthMm, 'widthMm', 1, 1000), heightMm: mm(value.heightMm, 'heightMm', 1, 1000) };
  if ((value.xMm === undefined) !== (value.yMm === undefined)) throw new Error('xMm and yMm go together');
  if (value.xMm !== undefined) {
    out.xMm = mm(value.xMm, 'xMm', -1000, 2000);
    out.yMm = mm(value.yMm, 'yMm', -1000, 2000);
  }
  if (value.rotationDeg !== undefined) {
    if (typeof value.rotationDeg !== 'number' || !Number.isFinite(value.rotationDeg) || Math.abs(value.rotationDeg) > 3600) throw new Error('rotationDeg must be a number (degrees)');
    out.rotationDeg = value.rotationDeg;
  }
  if (value.description !== undefined) {
    if (typeof value.description !== 'string' || value.description.length > MAX_DESC) throw new Error(`description must be a string (max ${MAX_DESC} chars)`);
    out.description = value.description;
  }
  return out;
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

/** 글 앞으로 떠 있는 그림 하나를 종이 기준 자리에 넣고 고른다. 본문 문단이 아니면 ok: false */
export function insertFloatingPicture(ih: InputHandler, req: EmbedPictureInsertV1): { ok: boolean } {
  const pos = ih.getCursorPosition();
  if (pos.parentParaIndex !== undefined || !ih.isCaretInBodyText()) return { ok: false };
  const data = bytesOf(req.png);
  const px = pngSize(data);
  const width = hwpunit(req.widthMm);
  const height = hwpunit(req.heightMm);
  let x: number;
  let y: number;
  if (req.xMm !== undefined && req.yMm !== undefined) {
    x = hwpunit(req.xMm);
    y = hwpunit(req.yMm);
  } else {
    // 캐럿 구역 글 영역(쪽 크기 − 여백)의 한가운데
    const d = ih.lilyPageDefFull(pos.sectionIndex);
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
    operation: (wasm) => {
      // cellPath '' = 본문 sibling floating picture
      const r = wasm.insertPicture(pos.sectionIndex, pos.paragraphIndex, pos.charOffset, '', data, width, height, px.w, px.h, 'png', req.description ?? '');
      if (!r.ok) return pos;
      para = r.paraIdx;
      ci = r.controlIdx;
      ok = wasm.setPictureProperties(pos.sectionIndex, para, ci, {
        treatAsChar: false, textWrap: 'InFrontOfText', horzRelTo: 'Paper', vertRelTo: 'Paper',
        horzAlign: 'Left', vertAlign: 'Top', horzOffset: x, vertOffset: y, rotationAngle: rotation,
      }).ok;
      return pos;
    },
  });
  if (ok) ih.lilySelectObject(pos.sectionIndex, para, ci);
  return { ok };
}
