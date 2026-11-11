import type { HmlSaveState } from '../core/hml-save-capability.ts';
import type { EmbedFontDecisionTraceV1 } from '../core/font-decision-trace.ts';
import {
  assertEmptyParams,
  assertOnlyParam,
  parseApplyTextCommand,
  parseBodyParagraphTarget,
  parseRevertTextCommand,
} from '../document-agent/contract.ts';
import type {
  RhwpApplyTextCommandV1,
  RhwpBodyParagraphTargetV1,
  RhwpDocumentStateV1,
  RhwpRevertTextCommandV1,
  RhwpSelectionContextV1,
  RhwpTextCommandReceiptV1,
} from '../document-agent/types.ts';
import {
  parseCharFormat,
  parseParaFormat,
  type EmbedCharFormatV1,
  type EmbedFormatStateV1,
  type EmbedParaFormatV1,
} from './format-bridge.ts';
import { parseMemoEdit, parseMemoInsert, type EmbedMemoEditV1, type EmbedMemoInsertV1 } from './memo-ops.ts';
import { parseTextInsert, type EmbedTextInsertResultV1, type EmbedTextInsertV1 } from './text-ops.ts';
import { parseMarkdownRules } from './markdown-rules.ts';
import {
  parseCodePaint, parseInsertBlocks, sanitizeLanguage, type CodeBlockInfoV1, type CodePaintV1, type InsertBlockV1,
} from './code-blocks.ts';
import type {
  CanvasKitRenderModeRequest,
  CanvasKitSurfaceRequest,
  LayerRenderProfile,
  RenderBackend,
  RenderBackendRequest,
} from '../view/render-backend.ts';

export interface EmbedNotifySavedResult {
  ok: true;
  wasDirty: boolean;
}

export interface EmbedRpcHandlers {
  ready(): Promise<boolean>;
  loadFile(
    data: Uint8Array,
    fileName: string,
    skipUnsavedGuard: boolean,
    suppressDialogs: boolean,
  ): Promise<{ pageCount: number }>;
  pageCount(): Promise<number>;
  getRendererDiagnostics(page: number): Promise<EmbedRendererDiagnosticsV1>;
  getFontDecisionTrace(page: number, maxCharacters: number): Promise<EmbedFontDecisionTraceV1>;
  getPageSvg(page: number, profile?: 'screen' | 'print'): Promise<string>;
  exportHwp(): Promise<Uint8Array>;
  exportHwpx(): Promise<Uint8Array>;
  exportHml(): Promise<Uint8Array>;
  getHmlSaveState(): Promise<HmlSaveState>;
  exportHwpVerify(): Promise<unknown>;
  notifySaved(fileName?: string): Promise<EmbedNotifySavedResult>;
  getDocumentState(): Promise<RhwpDocumentStateV1>;
  getSelectionContext(): Promise<RhwpSelectionContextV1>;
  applyTextCommand(command: RhwpApplyTextCommandV1): Promise<RhwpTextCommandReceiptV1>;
  revertTextCommand(command: RhwpRevertTextCommandV1): Promise<RhwpTextCommandReceiptV1>;
  focusTarget(target: RhwpBodyParagraphTargetV1): Promise<{ focused: boolean; page: number }>;

  // ── 브리지 확장 (P4) ────────────────────────────────────
  // 자동화·플러그인·창 제어. 부모는 **구조화 복제 가능한 값만** 보낼 수 있으므로 함수를 받는
  // 표면(예: 확장 커맨드 등록)은 여기 없다 — 그건 iframe 안의 플러그인만 할 수 있다.
  automationList(): Promise<unknown>;
  automationMenuModel(): Promise<unknown>;
  automationIsEnabled(id: string): Promise<boolean>;
  automationExecute(
    id: string,
    params?: Record<string, unknown>,
    options?: { allowDialog?: boolean },
  ): Promise<unknown>;
  automationContext(): Promise<unknown>;
  pluginList(): Promise<unknown>;
  pluginLoad(id: string): Promise<unknown>;
  pluginUnload(id: string): Promise<unknown>;
  pluginInvoke(id: string, method: string, args: unknown[]): Promise<unknown>;
  chromeGet(): Promise<unknown>;
  chromeSet(next: Record<string, unknown>): Promise<unknown>;

  // ── 글꼴 (호스트 글꼴 선택기) ────────────────────────────
  // 문서 글꼴은 DocInfo 글꼴 표(getDocumentInfo().fontsUsed)에서 읽는다 — 본문 run 을 훑지 않는다.
  fontsDocument(): Promise<EmbedDocumentFontsV1>;
  fontsStatus(names: string[]): Promise<EmbedFontStatusV1[]>;
  fontsActivate(name: string): Promise<EmbedFontActivationV1>;
  fontsCurrent(): Promise<{ fontName: string | null }>;
  fontsApply(name: string): Promise<{ ok: boolean; activation: EmbedFontActivationV1 }>;

  // ── [lily] 서식 값 (호스트 서식 패널·단추 눌림) ─────────────
  /** 캐럿 위치의 글자·문단 모양 값(pt·%) */
  formatGet(): Promise<EmbedFormatStateV1>;
  /** 선택 영역(없으면 캐럿 대기 서식)에 글자 모양 — studio 서식 줄과 같은 길 */
  formatSetChar(props: EmbedCharFormatV1): Promise<{ ok: boolean }>;
  /** 캐럿·선택 문단에 문단 모양 — studio 정렬 단추와 같은 길(실행 취소 기록) */
  formatSetPara(props: EmbedParaFormatV1): Promise<{ ok: boolean }>;

  // ── [lily] 상태 표시줄 단·줄·칸 ─────────────────────────────
  /** 캐럿의 단·줄(쪽 안)·칸. 본문 문단이 아니면(표·머리말·각주 안) null */
  statusCaret(): Promise<EmbedCaretPositionV1 | null>;

  // ── [lily] 본문 문단 안 글자 범위 고르기(호스트 찾기 결과) ─────
  selectRange(range: EmbedBodyRangeV1): Promise<{ selected: boolean }>;

  // ── [lily] 메모 넣기·고치기(호스트 메모 패널) ─────────────────
  /** 캐럿(선택이 있으면 그 시작)에 메모. 본문 문단이 아니면 ok: false */
  memoInsert(req: EmbedMemoInsertV1): Promise<{ ok: boolean; memoIndex?: number }>;
  /** 메모 번호로 글 바꾸기 */
  memoEdit(req: EmbedMemoEditV1): Promise<{ ok: boolean }>;

  // ── [lily] 본문 위치에 글 넣기(줄바꿈 = 문단 나누기, 실행 취소 한 단계) ──
  textInsert(req: EmbedTextInsertV1): Promise<EmbedTextInsertResultV1>;

  // ── [lily] 마크다운 입력 규칙·코드 블록(호스트가 켤 때만 — 기본 꺼짐) ──
  /** 입력 규칙 켬/끔(`# `~`### `·`**굵게**`·```언어 + Enter) */
  markdownSetRules(req: { enabled: boolean }): Promise<{ ok: boolean }>;
  /** 캐럿(선택이 있으면 바꿈)에 블록 = 문단 하나씩, 스타일·굵게·코드 언어까지 실행 취소 한 단계 */
  textInsertBlocks(req: { blocks: InsertBlockV1[] }): Promise<{ ok: boolean; section?: number; paragraph?: number; offset?: number; reason?: string }>;
  /** 문서의 코드 블록(본문) */
  codeBlocks(): Promise<CodeBlockInfoV1[]>;
  /** 캐럿이 있는 코드 블록(없으면 null) */
  codeContext(): Promise<{ section: number; paragraph: number; count: number; lang: string } | null>;
  /** 블록 언어 바꾸기(실행 취소 한 단계) */
  codeSetLanguage(req: { section: number; paragraph: number; lang: string }): Promise<{ ok: boolean }>;
  /** 문법 강조 칠하기 — 실행 취소 기록·dirty 없음 */
  codePaint(req: CodePaintV1): Promise<{ painted: number }>;
}

/** 본문 문단 안 [start, end) 글자(문단 오프셋) */
export interface EmbedBodyRangeV1 {
  section: number;
  paragraph: number;
  start: number;
  end: number;
}

function parseBodyRange(value: unknown): EmbedBodyRangeV1 {
  const r = asParams(value);
  assertOnlyKeys(r, ['section', 'paragraph', 'start', 'end'], 'range');
  for (const key of ['section', 'paragraph', 'start', 'end'] as const) {
    if (!Number.isSafeInteger(r[key]) || (r[key] as number) < 0) throw new Error(`range.${key} must be a non-negative safe integer`);
  }
  if ((r.end as number) < (r.start as number)) throw new Error('range.end must not be before range.start');
  return r as unknown as EmbedBodyRangeV1;
}

/** 단·줄·칸(모두 1부터). page = 전체 쪽 번호(0부터, 쪽 배치에서 못 찾으면 -1) */
export interface EmbedCaretPositionV1 {
  page: number;
  column: number;
  line: number;
  char: number;
}

export type EmbedWebFontSupplyV1 = 'loaded' | 'registered' | 'catalogued' | 'absent';

export interface EmbedDocumentFontV1 {
  fontName: string;
  /** studio 판단: available | needs-local-check | web-substitute | missing */
  status: string;
  source: string;
  /** 지금 화면에 대신 쓰는 글꼴(없으면 null) */
  substituteFont: string | null;
  webSupply: EmbedWebFontSupplyV1;
  /** 이 이름에 등록된 웹 글꼴 파일(예: 'fonts/NotoSerifKR-Regular.woff2'). 상용 글꼴 이름에 오픈 글꼴 파일을
   *  대역으로 붙인 항목이 있으므로 호스트는 파일의 실제 글꼴과 이름을 비교해 "대체 중"을 가린다 */
  webSupplyFile: string | null;
}

export interface EmbedDocumentFontsV1 {
  fonts: EmbedDocumentFontV1[];
  /** 엔진 기본 대체 글꼴 */
  fallbackFont: string | null;
  localSupported: boolean;
  localSnapshotStored: boolean;
}

export interface EmbedFontStatusV1 {
  name: string;
  webSupply: EmbedWebFontSupplyV1;
  /** true = OS 설치 확인, false = 확인 안 됨(없다는 뜻이 아님) */
  local: boolean;
  webSupplyFile: string | null;
}

export interface EmbedFontActivationV1 {
  ok: boolean;
  /** loaded: 웹 글꼴 적재 확인 · local: OS 글꼴로 이미 사용 가능 · not-supplied: 공급 경로 없음 · failed: 적재 실패 */
  result: 'loaded' | 'local' | 'not-supplied' | 'failed';
  webSupply: EmbedWebFontSupplyV1;
}

function asFontName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 256) {
    throw new Error('name must be a non-empty string (max 256)');
  }
  return value.trim();
}

function asFontNames(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 512) {
    throw new Error('names must be an array of at most 512 font names');
  }
  return value.map(asFontName);
}

export interface EmbedRendererDiagnosticsV1 {
  schemaVersion: 1;
  request: EmbedRendererRuntimeRequestV1 | null;
  initialized: boolean;
  initializationError: string | null;
  effectiveBackend: 'canvas2d' | 'canvaskit' | null;
  backendFallbackReason: string | null;
  selection: unknown;
  page: { index: number; canvaskit: unknown };
}

export interface EmbedRendererRuntimeRequestV1 {
  backend: Omit<RenderBackendRequest, 'backend'> & { backend: RenderBackend };
  canvaskitMode: CanvasKitRenderModeRequest;
  canvaskitSurface: CanvasKitSurfaceRequest;
  renderProfile: LayerRenderProfile;
}

function asParams(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${label} contains unknown field: ${unknown.sort()[0]}`);
}

/** 비어 있지 않은 문자열 식별자. 라우터에서 거르지 않으면 핸들러마다 같은 검사를 반복한다. */
function asId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('id must be a non-empty string');
  }
  return value;
}

function asBytes(value: unknown, allowLegacyArray: boolean): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (allowLegacyArray && Array.isArray(value)) return new Uint8Array(value);
  throw new Error('loadFile requires binary data');
}

export async function routeEmbedRequest(
  method: string,
  rawParams: unknown,
  handlers: EmbedRpcHandlers,
  allowLegacyArray = false,
): Promise<unknown> {
  const params = asParams(rawParams);
  switch (method) {
    case 'ready': return handlers.ready();
    case 'loadFile':
      return handlers.loadFile(
        asBytes(params.data, allowLegacyArray),
        typeof params.fileName === 'string' ? params.fileName : 'document.hwp',
        params.skipUnsavedGuard === true,
        params.suppressDialogs === true,
      );
    case 'pageCount': return handlers.pageCount();
    case 'getRendererDiagnostics': {
      const page = params.page ?? 0;
      if (!Number.isSafeInteger(page) || (page as number) < 0) {
        throw new Error('page must be a non-negative safe integer');
      }
      return handlers.getRendererDiagnostics(page as number);
    }
    case 'getFontDecisionTrace': {
      assertOnlyKeys(params, ['page', 'limits'], 'getFontDecisionTrace params');
      const page = params.page ?? 0;
      if (!Number.isSafeInteger(page) || (page as number) < 0) {
        throw new Error('page must be a non-negative safe integer');
      }
      const limits = params.limits === undefined ? {} : asParams(params.limits);
      if (params.limits !== undefined
        && (typeof params.limits !== 'object' || params.limits === null || Array.isArray(params.limits))) {
        throw new Error('limits must be an object');
      }
      assertOnlyKeys(limits, ['maxCharacters'], 'getFontDecisionTrace limits');
      const maxCharacters = limits.maxCharacters ?? 1024;
      if (!Number.isSafeInteger(maxCharacters)
        || (maxCharacters as number) < 1 || (maxCharacters as number) > 4096) {
        throw new Error('maxCharacters must be a safe integer in 1..=4096');
      }
      return handlers.getFontDecisionTrace(page as number, maxCharacters as number);
    }
    case 'getPageSvg': {
      // [lily] profile 'print' = 조판 부호 등 화면 전용 표시 없이(인자 없으면 예전과 같음)
      if (params.profile !== undefined && params.profile !== 'screen' && params.profile !== 'print') {
        throw new Error("profile must be 'screen' or 'print'");
      }
      return handlers.getPageSvg(typeof params.page === 'number' ? params.page : 0, params.profile);
    }
    case 'exportHwp': return handlers.exportHwp();
    case 'exportHwpx': return handlers.exportHwpx();
    case 'exportHml': return handlers.exportHml();
    case 'getHmlSaveState': return handlers.getHmlSaveState();
    case 'exportHwpVerify': return handlers.exportHwpVerify();
    case 'notifySaved': return handlers.notifySaved(
      typeof params.fileName === 'string' && params.fileName.length > 0
        ? params.fileName
        : undefined,
    );
    case 'getDocumentState':
      assertEmptyParams(params, 'getDocumentState params');
      return handlers.getDocumentState();
    case 'getSelectionContext':
      assertEmptyParams(params, 'getSelectionContext params');
      return handlers.getSelectionContext();
    case 'applyTextCommand': return handlers.applyTextCommand(parseApplyTextCommand(
      assertOnlyParam(params, 'command', 'applyTextCommand params'),
    ));
    case 'revertTextCommand': return handlers.revertTextCommand(parseRevertTextCommand(
      assertOnlyParam(params, 'command', 'revertTextCommand params'),
    ));
    case 'focusTarget': return handlers.focusTarget(parseBodyParagraphTarget(
      assertOnlyParam(params, 'target', 'focusTarget params'),
    ));
    // ── 브리지 확장 (P4) ──────────────────────────────────
    case 'automation.list': return handlers.automationList();
    case 'automation.menuModel': return handlers.automationMenuModel();
    case 'automation.isEnabled': return handlers.automationIsEnabled(asId(params.id));
    case 'automation.execute': return handlers.automationExecute(
      asId(params.id),
      typeof params.params === 'object' && params.params !== null
        ? params.params as Record<string, unknown>
        : undefined,
      { allowDialog: params.allowDialog === true },
    );
    case 'automation.context': return handlers.automationContext();
    case 'plugin.list': return handlers.pluginList();
    case 'plugin.load': return handlers.pluginLoad(asId(params.id));
    case 'plugin.unload': return handlers.pluginUnload(asId(params.id));
    case 'plugin.invoke': return handlers.pluginInvoke(
      asId(params.id), asId(params.method), Array.isArray(params.args) ? params.args : [],
    );
    case 'chrome.get': return handlers.chromeGet();
    case 'chrome.set': return handlers.chromeSet(asParams(params.visibility));
    case 'fonts.document': return handlers.fontsDocument();
    case 'fonts.status': return handlers.fontsStatus(asFontNames(params.names));
    case 'fonts.activate': return handlers.fontsActivate(asFontName(params.name));
    case 'fonts.current': return handlers.fontsCurrent();
    case 'fonts.apply': return handlers.fontsApply(asFontName(params.name));
    case 'format.get': return handlers.formatGet();
    case 'format.setChar': return handlers.formatSetChar(parseCharFormat(params.props));
    case 'format.setPara': return handlers.formatSetPara(parseParaFormat(params.props));
    case 'status.caret': return handlers.statusCaret();
    case 'select.range': return handlers.selectRange(parseBodyRange(params.range));
    case 'memo.insert':
      assertOnlyKeys(params, ['text', 'author'], 'memo.insert params');
      return handlers.memoInsert(parseMemoInsert(params));
    case 'memo.edit':
      assertOnlyKeys(params, ['memoIndex', 'text'], 'memo.edit params');
      return handlers.memoEdit(parseMemoEdit(params));
    case 'text.insert':
      assertOnlyKeys(params, ['section', 'paragraph', 'offset', 'text'], 'text.insert params');
      return handlers.textInsert(parseTextInsert(params));
    case 'markdown.setRules':
      assertOnlyKeys(params, ['enabled'], 'markdown.setRules params');
      return handlers.markdownSetRules(parseMarkdownRules(params));
    case 'text.insertBlocks':
      assertOnlyKeys(params, ['blocks'], 'text.insertBlocks params');
      return handlers.textInsertBlocks(parseInsertBlocks(params));
    case 'code.blocks': return handlers.codeBlocks();
    case 'code.context': return handlers.codeContext();
    case 'code.setLanguage': {
      assertOnlyKeys(params, ['section', 'paragraph', 'lang'], 'code.setLanguage params');
      const range = parseBodyRange({ section: params.section, paragraph: params.paragraph, start: 0, end: 0 });
      if (typeof params.lang !== 'string') throw new Error('lang must be a string');
      return handlers.codeSetLanguage({ section: range.section, paragraph: range.paragraph, lang: sanitizeLanguage(params.lang) });
    }
    case 'code.paint':
      assertOnlyKeys(params, ['section', 'paragraphs'], 'code.paint params');
      return handlers.codePaint(parseCodePaint(params));
    default: throw new Error(`Unknown method: ${method}`);
  }
}
