/** 눈금자 높이/너비 기본값 (CSS px) */
const RULER_SIZE = 20;

/** 눈금 숫자 글꼴 기본값 */
const RULER_FONT = '9px sans-serif';

/** [lily] 호스트 스킨이 바꿀 수 있는 눈금자 모양. 변수를 주지 않으면 예전 모양 그대로다. */
export interface RulerLook {
  /** 굵기(CSS px) — `--ruler-size` */
  size: number;
  /** 숫자 글꼴(canvas font) — `--ruler-font` */
  font: string;
  /** 0 보다 크면 용지 폭(높이)만큼의 띠를 이 반경으로 둥글게 그린다 — `--ruler-radius` */
  radius: number;
}

export function parseRulerLook(read: (name: string) => string): RulerLook {
  const px = (name: string, fallback: number, min: number, max: number) => {
    const value = Number.parseFloat(read(name));
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  return {
    size: Math.round(px('--ruler-size', RULER_SIZE, 12, 40)),
    font: read('--ruler-font').trim() || RULER_FONT,
    radius: px('--ruler-radius', 0, 0, 20),
  };
}
