// [lily] getPageSvg profile 인자: 없으면 예전과 같고, 'print' 는 화면 전용 표시 없이
import test from 'node:test';
import assert from 'node:assert/strict';

import { routeEmbedRequest, type EmbedRpcHandlers } from '../src/embed/rpc-router.ts';

test('[lily] getPageSvg 는 profile 을 넘기고 모르는 값은 거절한다', async () => {
  const calls: unknown[][] = [];
  const handlers = {
    getPageSvg: async (...a: unknown[]) => { calls.push(a); return '<svg/>'; },
  } as unknown as EmbedRpcHandlers;
  await routeEmbedRequest('getPageSvg', { page: 2 }, handlers);
  await routeEmbedRequest('getPageSvg', { page: 0, profile: 'print' }, handlers);
  assert.deepEqual(calls, [[2, undefined], [0, 'print']]);
  await assert.rejects(() => routeEmbedRequest('getPageSvg', { page: 0, profile: 'highQuality' }, handlers));
});
