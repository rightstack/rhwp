// [lily] QA take4 T4-05: 누름틀 안내문을 눌렀다가 다른 곳을 누르면 안내문이 화면에 다시 보여야 한다.
// updateFieldMarkers 의 갈래 중 활성 누름틀을 푸는 곳은 마커가 보이던 때(wasVisible) 쪽을 다시 그리게 한다.
// 선택 갈래가 마커를 먼저 숨기고 활성 필드를 풀면, 뒤이은 "필드 밖" 갈래는 wasVisible=false 라 다시 그리기를 건너뛴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { balancedFrom, codeOnly, functionBodyFrom } from './support/source-guard.ts';

const source = codeOnly(readFileSync(new URL('../src/engine/input-handler.ts', import.meta.url), 'utf8'));
const body = functionBodyFrom(source, 'private updateFieldMarkers(');

test('the selection branch redraws the page when it releases a visible field', () => {
  const branch = balancedFrom(body, 'if (this.cursor.hasSelection())', '{');
  assert.match(branch, /this\.wasm\.clearActiveField\(\)/);
  assert.match(branch, /if \(wasVisible\) this\.eventBus\.emit\('document-changed'\)/);
});

test('the exited-boundary branch redraws the page when it releases a visible field', () => {
  const branch = balancedFrom(body, 'if (this.isAtExitedFieldStart(pos, fi) || this.isAtExitedFieldEnd(pos, fi))', '{');
  assert.match(branch, /this\.wasm\.clearActiveField\(\)/);
  assert.match(branch, /if \(wasVisible\) this\.eventBus\.emit\('document-changed'\)/);
});
