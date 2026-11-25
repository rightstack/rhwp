/**
 * [lily] 문서 테마(임베드 호스트 LilyOffice 에이치독스의 색 메뉴 테마 고르기, 2026-11-25).
 * - theme.get : 문서 테마 이름(본문 책갈피 `_lily_theme_<name>`) — 없으면 null(호스트 기본 = Lily)
 * - theme.set : 테마 책갈피를 새 이름으로 + 박힌 색 옮기기(호스트가 만든 {옛 테마 칸 → 새 테마 칸} 표 — 글자 모양 색 · 본문 그리기 개체 채우기/선)
 *               snapshot 하나 = 실행 취소 한 단계. 코어 = Rust `lily_theme.rs`(upstream 함수 무수정)
 */
import type { InputHandler } from '../engine/input-handler.ts';
import type { WasmBridge } from '../core/wasm-bridge.ts';

export interface EmbedThemeSetV1 {
  name: string;
  /** "RRGGBB" → "RRGGBB" */
  map: Record<string, string>;
}

const HEX = /^#?[0-9a-fA-F]{6}$/;

export function parseThemeSet(value: Record<string, unknown>): EmbedThemeSetV1 {
  const name = value.name;
  if (typeof name !== 'string' || !name.trim() || name.length > 64) throw new Error('theme.set name must be a non-empty string (≤ 64)');
  const raw = value.map ?? {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('theme.set map must be an object');
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 2000)) {
    if (!HEX.test(k) || typeof v !== 'string' || !HEX.test(v)) throw new Error('theme.set map entries must be "RRGGBB": "RRGGBB"');
    map[k.replace(/^#/, '').toUpperCase()] = v.replace(/^#/, '').toUpperCase();
  }
  return { name: name.trim(), map };
}

export function getTheme(wasm: WasmBridge): { name: string | null } {
  return wasm.lilyThemeGet();
}

export function setTheme(ih: InputHandler, req: EmbedThemeSetV1): { ok: boolean; remapped?: number } {
  let out: { ok: boolean; remapped?: number } = { ok: false };
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'lilyTheme',
    operation: (w) => {
      out = w.lilyThemeSet(req.name, req.map);
      return out.ok ? ih.getCursorPosition() : null;
    },
  });
  return out;
}
