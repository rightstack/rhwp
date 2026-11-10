// [lily] 마크다운 입력 규칙·코드 블록·text.insertBlocks: 판정·인자 검증·가짜 코어 위 동작
import test from 'node:test';
import assert from 'node:assert/strict';

import { routeEmbedRequest, type EmbedRpcHandlers } from '../src/embed/rpc-router.ts';
import { detectFence, detectSpaceRule } from '../src/embed/markdown-rules.ts';
import {
  applyBodyStyle, applyInsertBlocks, applyRuleHeading, codeContextAt, isRuleHeading, languageOfBookmark, listCodeBlocks, paintCode, parseCodePaint, parseInsertBlocks,
  sanitizeLanguage, setBlockLanguage, type CodeWasm,
} from '../src/embed/code-blocks.ts';

test('[lily] 공백 규칙: 문단 맨 앞 #~### 과 **굵게**', () => {
  assert.deepEqual(detectSpaceRule('# '), { kind: 'heading', level: 1 });
  assert.deepEqual(detectSpaceRule('### '), { kind: 'heading', level: 3 });
  assert.equal(detectSpaceRule('#### '), null);
  assert.equal(detectSpaceRule('#가 '), null, '# 뒤에 바로 한글이 오면 제목이 아니다');
  assert.equal(detectSpaceRule('a # '), null);
  assert.equal(detectSpaceRule('#'), null, '공백 직후에만');
  assert.deepEqual(detectSpaceRule('앞 **굵게** '), { kind: 'bold', start: 2, inner: 2 });
  assert.deepEqual(detectSpaceRule('**😀x** '), { kind: 'bold', start: 0, inner: 2 }, 'scalar 단위');
  assert.equal(detectSpaceRule('** x** '), null);
  assert.equal(detectSpaceRule('**** '), null);
  assert.equal(detectSpaceRule('***x** '), null);
  assert.equal(detectSpaceRule('**x**'), null);
});

test('[lily] 코드 펜스와 언어 토큰', () => {
  assert.equal(detectFence('```python'), 'python');
  assert.equal(detectFence('```'), 'plain');
  assert.equal(detectFence('```C++ '), 'cpp');
  assert.equal(detectFence('x```js'), null);
  assert.equal(detectFence('```a`b'), null);
  assert.equal(sanitizeLanguage('language-TypeScript'), 'typescript');
  assert.equal(sanitizeLanguage('c#'), 'csharp');
  assert.equal(sanitizeLanguage('{.python}'), 'plain');
  assert.equal(languageOfBookmark('_lily_code_python_2'), 'python');
  assert.equal(languageOfBookmark('_lily_code_js'), 'js');
  assert.equal(languageOfBookmark('chapter1'), null);
});

interface Para { text: string; style: number; bold: boolean[]; color: string[]; numbering?: number }

/** 문단 글·스타일·글자별 굵게/색만 가진 가짜 코어(구역 하나). 스타일 0 바탕글, 1~3 개요, 코드는 만들면 생긴다 */
function fakeWasm(texts: string[]) {
  const styles = [
    { id: 0, name: '바탕글', englishName: 'Normal', charShapeId: 0, paraShapeId: 0 },
    { id: 1, name: '개요 1', englishName: 'Outline 1', charShapeId: 0, paraShapeId: 1 },
    { id: 2, name: '개요 2', englishName: 'Outline 2', charShapeId: 0, paraShapeId: 2 },
    { id: 3, name: '개요 3', englishName: 'Outline 3', charShapeId: 0, paraShapeId: 3 },
  ];
  const cp = (s: string) => Array.from(s);
  const mk = (text: string, style = 0): Para => ({ text, style, bold: cp(text).map(() => false), color: cp(text).map(() => '') });
  const paras: Para[] = texts.map((t) => mk(t));
  const marks: Array<{ name: string; para: number }> = [];
  const numberings: string[][] = [['^1.', '^2.', '^3.', '', '', '', '']];
  const sizes: number[] = [];
  const calls: string[] = [];
  const w: CodeWasm = {
    getSectionCount: () => 1,
    getParagraphCount: () => paras.length,
    getParagraphLength: (_s, p) => cp(paras[p].text).length,
    getTextRange: (_s, p, o, n) => cp(paras[p].text).slice(o, o + n).join(''),
    getStyleList: () => styles,
    getStyleAt: (_s, p) => ({ id: paras[p].style, name: styles[paras[p].style].name }),
    applyStyle(_s, p, id) { paras[p].style = id; calls.push(`style ${p}=${id}`); return { ok: true }; },
    createStyle(json) {
      const j = JSON.parse(json);
      styles.push({ id: styles.length, name: j.name, englishName: j.englishName, charShapeId: 0, paraShapeId: j.baseParaShapeId ?? 0 });
      return styles.length - 1;
    },
    updateStyle: () => true,
    updateStyleShapes: () => true,
    applyParaFormat(_s, p, json) {
      calls.push(`para ${p} ${json}`);
      const j = JSON.parse(json);
      if (j.numberingId !== undefined) paras[p].numbering = j.numberingId;
      return '{"ok":true}';
    },
    getParaPropertiesAt: (_s, p) => ({ paraShapeId: 9, headType: paras[p].style >= 1 && paras[p].style <= 3 ? 'Outline' : 'None', numberingId: paras[p].numbering }),
    setParaShapeId(_s, p) { paras[p].numbering = 0; return '{"ok":true}'; },
    setCharShapeId(_s, p, a, b) { for (let i = a; i < b; i++) paras[p].bold[i] = false; sizes[p] = 0; return '{"ok":true}'; },
    getStyleDetail: () => ({ charProps: { fontSize: 1000 } }),
    getNumberingList: () => numberings.map((f, i) => ({ id: i + 1, levelFormats: f })),
    createNumbering(json) { numberings.push(JSON.parse(json).levelFormats.length ? ['^1.'] : ['', '', '', '', '', '', '']); return numberings.length; },
    findOrCreateFontId: () => 5,
    applyCharFormat(_s, p, a, b, json) {
      const j = JSON.parse(json);
      if (j.fontSize !== undefined) sizes[p] = j.fontSize;
      for (let i = a; i < b; i++) {
        if (j.bold !== undefined) paras[p].bold[i] = j.bold;
        if (j.textColor) paras[p].color[i] = j.textColor;
      }
      return '{"ok":true}';
    },
    getBookmarks: () => marks.map((m, i) => ({ name: m.name, sec: 0, para: m.para, ctrlIdx: i, charPos: 0 })),
    addBookmark(_s, p, _o, name) {
      if (marks.some((m) => m.name === name)) return { ok: false, error: 'dup' };
      marks.push({ name, para: p });
      return { ok: true };
    },
    deleteBookmark(_s, _p, ctrlIdx) { marks.splice(ctrlIdx, 1); return { ok: true }; },
    deleteText(_s, p, o, n) {
      const q = paras[p];
      const c = cp(q.text); c.splice(o, n); q.text = c.join(''); q.bold.splice(o, n); q.color.splice(o, n);
      return '{"ok":true}';
    },
    insertText(_s, p, o, t) {
      const q = paras[p];
      const c = cp(q.text); const add = cp(t);
      c.splice(o, 0, ...add); q.text = c.join('');
      q.bold.splice(o, 0, ...add.map(() => false)); q.color.splice(o, 0, ...add.map(() => ''));
      return '{"ok":true}';
    },
    splitParagraph(_s, p, o) {
      const q = paras[p];
      const c = cp(q.text);
      const tail: Para = { text: c.slice(o).join(''), style: q.style, bold: q.bold.slice(o), color: q.color.slice(o), numbering: q.numbering };
      q.text = c.slice(0, o).join(''); q.bold = q.bold.slice(0, o); q.color = q.color.slice(0, o);
      paras.splice(p + 1, 0, tail);
      for (const m of marks) if (m.para > p) m.para++;
      return JSON.stringify({ ok: true, paraIdx: p + 1, charOffset: 0 });
    },
    deleteRange: () => ({ ok: false, paraIdx: 0, charOffset: 0 }),
  };
  return { w, paras, marks, styles, calls, sizes };
}

test('[lily] insertBlocks: 제목·본문 굵게·코드 블록을 문단마다, 코드 언어는 블록 첫 문단 책갈피', () => {
  const f = fakeWasm(['앞뒤']);
  const end = applyInsertBlocks(f.w, { section: 0, paragraph: 0, offset: 1 }, [
    { text: '제목', style: 'outline2' },
    { text: '굵게 글', bold: [[0, 2]] },
    { text: 'x = 1', style: 'code', lang: 'py' },
    { text: 'y = 2', style: 'code', lang: 'py' },
  ]);
  assert.deepEqual(f.paras.map((p) => p.text), ['앞', '제목', '굵게 글', 'x = 1', 'y = 2', '뒤']);
  const code = f.styles.find((s) => s.name === '코드')!.id;
  assert.deepEqual(f.paras.map((p) => p.style), [0, 2, 0, code, code, 0], '코드 뒤 남은 글은 본문으로 떨어진다');
  assert.deepEqual(f.paras[2].bold, [true, true, false, false]);
  assert.deepEqual(f.marks, [{ name: '_lily_code_py_1', para: 3 }]);
  assert.deepEqual(end, { section: 0, paragraph: 4, offset: 5 });
  assert.ok(f.calls.some((c) => c.includes('"fillColor":"#f6f8fa"')), '코드 스타일은 문단 바탕을 바탕으로 만든다');

  const blocks = listCodeBlocks(f.w);
  assert.deepEqual(blocks, [{ section: 0, paragraph: 3, count: 2, lang: 'py', lines: ['x = 1', 'y = 2'] }]);
  assert.deepEqual(codeContextAt(f.w, { sectionIndex: 0, paragraphIndex: 4, charOffset: 0 }), { section: 0, paragraph: 3, count: 2, lang: 'py' });
  assert.equal(codeContextAt(f.w, { sectionIndex: 0, paragraphIndex: 1, charOffset: 0 }), null);

  // 언어 바꾸기 = 책갈피 하나만(이름이 겹치지 않게 번호)
  assert.ok(setBlockLanguage(f.w, 0, 4, 'rust'));
  assert.deepEqual(f.marks, [{ name: '_lily_code_rust_1', para: 3 }]);
});

test('[lily] 규칙 제목 = 개요 스타일 + 번호 형식이 빈 정의(하나를 다시 쓴다), 직접 준 개요와 구분', () => {
  const f = fakeWasm(['a', 'b', 'c']);
  applyRuleHeading(f.w, 0, 0, 2, 2);
  applyRuleHeading(f.w, 0, 1, 1, 1);
  assert.deepEqual([f.sizes[0], f.sizes[1], f.paras[0].bold], [1400, 1600, [true]], '굵게 + 바탕글 × 1.4 / 1.6');
  assert.ok(f.calls.some((c) => c.startsWith('para 0 ') && c.includes('"marginLeft":0') && c.includes('"spacingBefore":800')));
  assert.equal(f.paras[0].numbering, 2);
  assert.equal(f.paras[1].numbering, 2, '빈 번호 정의는 하나만 만든다');
  assert.ok(isRuleHeading(f.w, 0, 0));
  f.w.applyStyle(0, 2, 1);
  assert.ok(!isRuleHeading(f.w, 0, 2), '사용자가 직접 준 개요');
  applyBodyStyle(f.w, 0, 1);
  assert.deepEqual([f.paras[1].style, f.paras[1].numbering, f.sizes[1], f.paras[1].bold], [0, 0, 0, [false]], '바탕글 = 글자 모양도');
});

test('[lily] insertBlocks: 본문 한 블록은 캐럿 문단 스타일을 바꾸지 않는다(코드 줄에 글 넣기)', () => {
  const f = fakeWasm(['ab']);
  applyInsertBlocks(f.w, { section: 0, paragraph: 0, offset: 0 }, [{ text: 'x', style: 'code', lang: 'js' }]);
  const code = f.paras[0].style;
  applyInsertBlocks(f.w, { section: 0, paragraph: 0, offset: 1 }, [{ text: 'Z' }]);
  assert.equal(f.paras[0].text, 'xZ');
  assert.equal(f.paras[0].style, code);
  assert.equal(applyInsertBlocks(f.w, { section: 0, paragraph: 9, offset: 0 }, [{ text: 'q' }]), null);
});

test('[lily] code.paint: 코드 문단만, 글이 기대와 같을 때만 칠한다', () => {
  const f = fakeWasm(['']);
  applyInsertBlocks(f.w, { section: 0, paragraph: 0, offset: 0 }, [{ text: 'let a', style: 'code', lang: 'js' }, { text: '본문' }]);
  const n = paintCode(f.w, parseCodePaint({
    section: 0,
    paragraphs: [
      { paragraph: 0, text: 'let a', runs: [{ start: 0, end: 3, color: '#CF222E', bold: true }, { start: 3, end: 5, color: '#1f2328' }] },
      { paragraph: 1, text: '본문', runs: [{ start: 0, end: 2, color: '#cf222e' }] },
      { paragraph: 0, text: 'stale', runs: [{ start: 0, end: 1, color: '#000000' }] },
    ],
  }));
  assert.equal(n, 1);
  assert.deepEqual(f.paras[0].color, ['#cf222e', '#cf222e', '#cf222e', '#1f2328', '#1f2328']);
  assert.deepEqual(f.paras[0].bold, [true, true, true, false, false]);
  assert.deepEqual(f.paras[1].color, ['', '']);
});

test('[lily] 라우터: markdown.*·text.insertBlocks·code.* 인자 검증', async () => {
  const seen: unknown[] = [];
  const handlers = new Proxy({}, {
    get: (_t, name) => async (req: unknown) => { seen.push([name, req]); return { ok: true }; },
  }) as unknown as EmbedRpcHandlers;
  await routeEmbedRequest('markdown.setRules', { enabled: true }, handlers);
  await assert.rejects(routeEmbedRequest('markdown.setRules', { enabled: 'yes' }, handlers), /boolean/);
  await routeEmbedRequest('text.insertBlocks', { blocks: [{ text: 'a', style: 'outline1' }] }, handlers);
  await assert.rejects(routeEmbedRequest('text.insertBlocks', { blocks: [] }, handlers), /non-empty/);
  await assert.rejects(routeEmbedRequest('text.insertBlocks', { blocks: [{ text: 'a\nb' }] }, handlers), /control/);
  await assert.rejects(routeEmbedRequest('text.insertBlocks', { blocks: [{ text: 'a', style: 'h1' }] }, handlers), /style/);
  await assert.rejects(routeEmbedRequest('text.insertBlocks', { blocks: [{ text: 'ab', bold: [[1, 3]] }] }, handlers), /out of text/);
  await routeEmbedRequest('code.setLanguage', { section: 0, paragraph: 2, lang: 'Python' }, handlers);
  await assert.rejects(routeEmbedRequest('code.setLanguage', { section: 0, paragraph: -1, lang: 'x' }, handlers), /paragraph/);
  await assert.rejects(routeEmbedRequest('code.paint', { section: 0, paragraphs: [{ paragraph: 0, text: '', runs: [{ start: 1, end: 1, color: '#000000' }] }] }, handlers), /greater/);
  await assert.rejects(routeEmbedRequest('code.paint', { section: 0, paragraphs: [{ paragraph: 0, text: '', runs: [{ start: 0, end: 1, color: 'red' }] }] }, handlers), /rrggbb/);
  await assert.rejects(routeEmbedRequest('code.paint', { section: 0, paragraphs: [], extra: 1 }, handlers), /unknown field/);
  assert.deepEqual(seen, [
    ['markdownSetRules', { enabled: true }],
    ['textInsertBlocks', { blocks: [{ text: 'a', style: 'outline1' }] }],
    ['codeSetLanguage', { section: 0, paragraph: 2, lang: 'python' }],
  ]);
  assert.deepEqual(parseInsertBlocks({ blocks: [{ text: 'ab', bold: [[0, 1]] }] }), { blocks: [{ text: 'ab', bold: [[0, 1]] }] });
});
