/**
 * [lily] 캐럿 대기 서식(선택 없이 준 글자 모양)의 글자 크기를 캐럿 높이에 반영한다.
 *
 * 대기 서식은 다음 삽입 런에만 쓰이는 편집기 상태라 문서 조판(캐럿 사각형)에는 없다. 빈 문단·빈 셀에서
 * 크기를 바꾸면 한 글자를 칠 때까지 캐럿이 옛 크기로 남는다. 윗선은 그대로 두고 높이만 바꾼다
 * (글자를 치면 줄이 아래로 자란다). 셀 경계 보정은 CaretRenderer 가 한다.
 */
const PX_PER_HWPUNIT_PT = 96 / 72 / 100;

export function caretRectForPendingSize<T extends { height: number }>(rect: T, fontSizeHwpunit: number | undefined): T {
  if (fontSizeHwpunit === undefined || !Number.isFinite(fontSizeHwpunit) || fontSizeHwpunit <= 0) return rect;
  const height = fontSizeHwpunit * PX_PER_HWPUNIT_PT;
  if (Math.abs(height - rect.height) < 0.5) return rect;
  return { ...rect, height };
}
