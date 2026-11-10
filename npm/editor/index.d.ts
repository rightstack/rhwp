/**
 * @rhwp/editor — HWP 에디터 웹 컴포넌트
 */

export interface EditorOptions {
  /** rhwp-studio HTTP(S) URL. file:, data:, browser extension 등 opaque origin은 지원하지 않음 */
  studioUrl?: string;
  /** 문서 단위 renderer 요청. 기본값은 canvas2d이며 auto/CanvasKit 명시 선택도 지원함 */
  renderer?: 'auto' | 'canvas2d' | 'canvaskit';
  /** iframe 너비 (기본: '100%') */
  width?: string;
  /** iframe 높이 (기본: '100%') */
  height?: string;
  /** 모든 method 요청 제한 시간 override(ms, 기본: 일반 10000, load/trace/export 60000) */
  requestTimeoutMs?: number;
  /** v1 협상 제한 시간(ms, 기본: 1000) */
  handshakeTimeoutMs?: number;
}

export interface LoadResult {
  pageCount: number;
}

export interface HwpVerifyResult {
  /** 직렬화된 HWP 바이트 수 */
  bytesLen: number;
  /** 직렬화 직전 페이지 수 */
  pageCountBefore: number;
  /** 자기 재로드 후 페이지 수 (recovered === true 일 때 의미 있음) */
  pageCountAfter: number;
  /** 자기 재로드 성공 여부 */
  recovered: boolean;
}

export interface HmlSaveBlocker {
  code: string;
  xmlPath: string;
  message: string;
  preserved: false;
}

export interface HmlSaveState {
  sourceFormat: string;
  hmlSavable: boolean;
  blockers: HmlSaveBlocker[];
}

export interface CanvasKitRendererDiagnostics {
  mode: 'default' | 'compat';
  surfacePreference: 'auto' | 'webgpu' | 'webgl' | 'software';
  surfaceBackend: 'default' | 'software' | null;
  surfaceFallbackReason: string | null;
  lastRenderCompleted: boolean;
  lastUnsupportedOps: string[];
  lastExpectedUnsupportedOps: string[];
  lastUnexpectedUnsupportedOps: string[];
  lastRenderError: string | null;
  passesRuntimeReadinessGate: boolean;
  readinessBlockers: Array<'renderNotCompleted' | 'renderError' | 'unexpectedUnsupportedOps' | 'localFontsPending'>;
  hiddenCanvas2dOverlayUsed: false;
  lastRenderDurationMs: number | null;
  renderCount: number;
  imageCacheEntries: number;
  imageCacheLimit: number;
  imageCachePixels: number;
  imageCachePixelLimit: number;
  imageCacheHits: number;
  imageCacheMisses: number;
  imageCacheEvictions: number;
  localTypefaceCount: number;
  localTypefaceLoadFailureCount: number;
  localTypefacePendingCount: number;
  bundledTypefaceCount: number;
  bundledTypefaceLoadFailureCount: number;
}

export interface CanvasKitDocumentPreflightV1 {
  schemaVersion: 1;
  mode: 'default' | 'compat';
  profile: 'fastPreview' | 'screen' | 'print' | 'highQuality';
  status: 'eligible' | 'ineligible' | 'incomplete';
  eligible: boolean;
  complete: boolean;
  pageCount: number;
  scannedPages: number;
  scannedWorkUnits: number;
  limits: {
    maxPages: number;
    maxWorkUnits: number;
    maxBlockers: number;
    maxRequiredFontFamilies: number;
  };
  summary: {
    totalItems: number;
    directItems: number;
    directRequiredItems: number;
    compatOverlayItems: number;
    textFallbackItems: number;
    unsupportedItems: number;
    hiddenOverlayViolations: number;
  };
  blockers: Array<{ pageIndex: number; code: string; opType?: string; detail?: string }>;
  requiredFontFamilies: string[];
  capabilityDigest: string;
}

export interface RendererSelectionV1 {
  schemaVersion: 1;
  request: { backend: 'auto' | 'canvas2d' | 'canvaskit'; source: 'default' | 'url'; requested?: string; unsupportedReason?: string };
  requestedBackend: 'auto' | 'canvas2d' | 'canvaskit';
  effectiveBackend: 'canvas2d' | 'canvaskit';
  selectionReason: string;
  fallbackReason: string | null;
  documentRevision: number;
  resourceGeneration: number;
  renderProfile: 'fastPreview' | 'screen' | 'print' | 'highQuality';
  documentDigest: string | null;
  decisionKey: string;
  preflight: CanvasKitDocumentPreflightV1 | null;
  initializationError: string | null;
  selectionError: string | null;
}

export interface RendererDiagnosticsV1 {
  schemaVersion: 1;
  request: {
    /** Legacy v1 request snapshot. Automatic intent is exposed additively through selection. */
    backend: { backend: 'canvas2d' | 'canvaskit'; source: 'default' | 'url'; requested?: string; unsupportedReason?: string };
    canvaskitMode: { mode: 'default' | 'compat'; source: 'default' | 'storage' | 'url'; requested?: string; unsupportedReason?: string };
    canvaskitSurface: { preference: 'auto' | 'webgpu' | 'webgl' | 'software'; requested: string; unsupportedReason?: string };
    renderProfile: 'fastPreview' | 'screen' | 'print' | 'highQuality';
  } | null;
  initialized: boolean;
  initializationError: string | null;
  effectiveBackend: 'canvas2d' | 'canvaskit' | null;
  backendFallbackReason: string | null;
  /** Added additively to renderer-diagnostics-v1; older Studio builds may omit it. */
  selection?: RendererSelectionV1 | null;
  page: { index: number; canvaskit: CanvasKitRendererDiagnostics | null };
}

export interface FontDecisionTraceBackendV1 {
  status: string;
  certainty: 'observed' | 'resolved' | 'planned' | 'notObserved' | 'unsupported';
  requested: string | null;
  candidates: string[];
  resolved: string | null;
  source: string | null;
  capabilities: string[];
  failures: string[];
}

export interface FontDecisionTraceV1 {
  schemaVersion: 1;
  status: 'complete' | 'truncated' | 'unsupported' | 'failed';
  scope: {
    pageIndex: number;
    requestedLimits: { maxCharacters: number };
    appliedLimits: { maxCharacters: number };
  };
  counts: {
    runsSeen: number;
    charactersSeen: number;
    recordsEmitted: number;
    recordsOmitted: number | null;
  };
  records: Array<{
    recordId: string;
    source: { character: string; codePoint: number; [key: string]: unknown };
    document: { face: string | null; altType: number | null; languageSlot: number | null; [key: string]: unknown };
    layoutName: { normalizedFace: string | null; cssFamilyChain: string[]; [key: string]: unknown };
    layoutMetric: Record<string, unknown>;
    paint: {
      native: FontDecisionTraceBackendV1;
      canvas2d: FontDecisionTraceBackendV1;
      canvaskit: FontDecisionTraceBackendV1;
    };
    provenance: Array<Record<string, unknown>>;
    oracle: Record<string, unknown>;
  }>;
  backendSummary: Record<string, { status: string; reasons: string[] }>;
  reasons: Array<{ code: string; detail: string | null }>;
  layoutHash: { algorithm: 'sha256'; value: string | null };
  normalizedHash: { algorithm: 'sha256'; value: string | null };
}

export interface FontDecisionTraceOptions {
  maxCharacters?: number;
}

export interface LoadFileOptions {
  /** 미저장 변경 확인 없이 문서 교체 */
  skipUnsavedGuard?: boolean;
  /**
   * 로드 후 안내창(HWPX 검증, 로컬 글꼴 감지) 없이 열기.
   * 임베드 환경에서 안내창의 사용자 선택을 기다리느라 loadFile 응답이
   * 지연/교착되는 것을 방지한다. 기본값은 true이며, 안내창을 표시하려면
   * false를 명시한다.
   */
  suppressDialogs?: boolean;
}

export interface RhwpBodyParagraphTargetV1 {
  kind: 'body_paragraph';
  section: number;
  paragraph: number;
  charOffset: 0;
  length: number;
}

export interface RhwpDocumentStateV1 {
  schemaVersion: 1;
  format: 'hwp' | 'hwpx';
  documentEpoch: number;
  changeSeq: number;
  dirty: boolean;
  pageCount: number;
  documentSha256: string;
}

export interface RhwpSelectionContextV1 {
  schemaVersion: 1;
  documentEpoch: number;
  changeSeq: number;
  /** 1부터 시작하는 UI 페이지 번호 */
  page: number;
  editable: boolean;
  collapsed: boolean;
  target: RhwpBodyParagraphTargetV1 | null;
  selectedTextSha256: string | null;
}

export interface RhwpApplyTextCommandV1 {
  schemaVersion: 1;
  commandId: string;
  expectedDocumentEpoch: number;
  expectedChangeSeq: number;
  expectedDocumentSha256: string;
  target: RhwpBodyParagraphTargetV1;
  expectedBeforeSha256: string;
  expectedFormatSha256: string;
  expectedAdjacentContextSha256: string;
  replacement: string;
}

export interface RhwpRevertTextCommandV1 {
  schemaVersion: 1;
  commandId: string;
  expectedDocumentEpoch: number;
  expectedChangeSeq: number;
  expectedAfterDocumentSha256: string;
  expectedAfterSha256: string;
}

export interface RhwpTextCommandReceiptV1 {
  schemaVersion: 1;
  commandId: string;
  operation: 'apply' | 'revert';
  documentEpoch: number;
  beforeChangeSeq: number;
  afterChangeSeq: number;
  beforeDocumentSha256: string;
  afterDocumentSha256: string;
  beforeTextSha256: string;
  afterTextSha256: string;
  formatSha256: string;
  adjacentContextSha256: string;
  pageCountBefore: number;
  pageCountAfter: number;
  target: RhwpBodyParagraphTargetV1;
}

export interface RhwpDocumentChangedEventV1 {
  schemaVersion: 1;
  reason: 'agent_apply' | 'agent_revert';
  documentEpoch: number;
  changeSeq: number;
  commandId: string;
}

export interface RhwpDocumentAgentError extends Error {
  code: string;
  /** TRANSACTION_FAILED/RENDER_FAILED에서 snapshot 복구 성공 여부 */
  recovered?: boolean;
}

export declare class RhwpEditor {
  private constructor();
  /** HWP 파일을 로드합니다 */
  loadFile(data: ArrayBuffer | Uint8Array, fileName?: string, options?: LoadFileOptions): Promise<LoadResult>;
  /** 현재 문서의 페이지 수를 반환합니다 */
  pageCount(): Promise<number>;
  /** 특정 페이지를 SVG 문자열로 렌더링합니다 */
  getPageSvg(page?: number): Promise<string>;
  /** 선택된 renderer와 페이지별 readiness 진단을 반환합니다 */
  getRendererDiagnostics(page?: number): Promise<RendererDiagnosticsV1>;
  /** 현재 snapshot만 읽는 bounded font 결정 계보를 반환합니다 */
  getFontDecisionTrace(page?: number, options?: FontDecisionTraceOptions): Promise<FontDecisionTraceV1>;
  /** 현재 문서를 HWP 바이너리로 내보냅니다 */
  exportHwp(): Promise<Uint8Array>;
  /** 현재 문서를 HWPX(ZIP+XML) 바이너리로 내보냅니다 */
  exportHwpx(): Promise<Uint8Array>;
  /** 현재 문서를 HML(XML) 바이너리로 내보냅니다 */
  exportHml(): Promise<Uint8Array>;
  /** 현재 문서의 HML 저장 가능 여부와 blocker를 반환합니다 */
  getHmlSaveState(): Promise<HmlSaveState>;
  /** HWP 직렬화 + 자기 재로드 검증 메타데이터 (#178) */
  exportHwpVerify(): Promise<HwpVerifyResult>;
  /**
   * 내보내기 바이트의 영속화(업로드/핸드오프) 완료를 스튜디오에 통지합니다 (#2660).
   * dirty 해제 + 자동복구 draft 삭제 완료 후 resolve — resolve 이후 창을 닫아도 안전.
   * 업로드 실패 시에는 호출하지 마세요(백업 draft 보존).
   * 스튜디오가 notify-saved-v1 capability를 광고하지 않으면 요청 없이 실패합니다.
   */
  notifySaved(fileName?: string): Promise<{ ok: true; wasDirty: boolean }>;
  /** 현재 문서의 에이전트 명령 fence와 SHA-256 상태 */
  getDocumentState(): Promise<RhwpDocumentStateV1>;
  /** 현재 캐럿/선택의 exact body paragraph 컨텍스트 */
  getSelectionContext(): Promise<RhwpSelectionContextV1>;
  /** exact preimage fence를 검증하고 문단 전체를 한 트랜잭션으로 교체 */
  applyTextCommand(command: RhwpApplyTextCommandV1): Promise<RhwpTextCommandReceiptV1>;
  /** 가장 최근에 성공한 exact command를 한 트랜잭션으로 되돌림 */
  revertTextCommand(command: RhwpRevertTextCommandV1): Promise<RhwpTextCommandReceiptV1>;
  /** exact body paragraph target으로 캐럿과 뷰포트 이동 */
  focusTarget(target: RhwpBodyParagraphTargetV1): Promise<{ focused: boolean; page: number }>;
  /** agent apply/revert가 commit된 뒤 strict v1 변경 이벤트 구독 */
  onDocumentChanged(listener: (event: RhwpDocumentChangedEventV1) => void): () => void;
  /** iframe 엘리먼트를 반환합니다 */
  readonly element: HTMLIFrameElement;
  // ── 브리지 표면 ────────────────────────────────────────────────

  /** studio 커맨드·메뉴. `list()` 는 레지스트리 전체, `menuModel()` 은 실제 메뉴 구조 */
  readonly commands: {
    list(): Promise<CommandInfo[]>;
    menuModel(): Promise<MenuNode[]>;
    isEnabled(id: string): Promise<boolean>;
    execute(
      id: string,
      params?: Record<string, unknown>,
      options?: { allowDialog?: boolean },
    ): Promise<CommandResult>;
    context(): Promise<Record<string, unknown>>;
  };

  /** 플러그인 수명. 올릴 수 있는 이름은 studio 의 allowlist 가 정한다 */
  readonly plugins: {
    list(): Promise<Array<{ id: string; apiVersion: number; active: boolean }>>;
    load(id: string): Promise<{ id: string; methods: string[] }>;
    unload(id: string): Promise<{ ok: true }>;
    invoke(id: string, method: string, args?: unknown[]): Promise<unknown>;
  };

  /** HwpCtrl API — `plugins.load('hwpctrl')` 이후 사용 */
  readonly hwpctrl: {
    call(method: string, args?: unknown[]): Promise<unknown>;
    /** 여러 호출을 한 메시지·한 트랜잭션으로. undo 도 1스텝 */
    batch(build: ((h: Record<string, (...args: unknown[]) => unknown>) => void)
      | Array<{ m: string; a?: unknown[] }>): Promise<unknown[]>;
    exportBytes(format?: 'hwp' | 'hwpx' | 'hml'): Promise<Uint8Array>;
    undo(): Promise<CommandResult>;
    redo(): Promise<CommandResult>;
  };

  /** 글꼴 — 호스트 글꼴 선택기용. 문서 글꼴은 DocInfo 글꼴 표에서 읽는다(본문 순회 없음) */
  readonly fonts: {
    document(): Promise<RhwpDocumentFonts>;
    status(names: string[]): Promise<RhwpFontStatus[]>;
    /** 번들 웹 글꼴 적재. 적재를 확인한 뒤에만 ok */
    activate(name: string): Promise<RhwpFontActivation>;
    /** 캐럿 위치 글자의 글꼴 */
    current(): Promise<{ fontName: string | null }>;
    /** 선택 영역(없으면 캐럿 대기 서식)에 적용. 적용 전에 activate 를 시도한다 */
    apply(name: string): Promise<{ ok: boolean; activation: RhwpFontActivation }>;
  };

  /** 서식 값 — 호스트 서식 패널용. 값은 pt·%(줄 간격 Percent 면 %, 그 외 pt) */
  readonly format: {
    /** 캐럿 위치의 글자·문단 모양 */
    get(): Promise<RhwpFormatState>;
    /** 선택 영역(없으면 캐럿 대기 서식)에 글자 모양 */
    setChar(props: RhwpCharFormat): Promise<{ ok: boolean }>;
    /** 캐럿·선택 문단에 문단 모양 */
    setPara(props: RhwpParaFormat): Promise<{ ok: boolean }>;
  };

  /** 본문 문단 안 [start, end) 글자(문단 오프셋)를 고르고 화면을 옮긴다. 범위가 문단을 넘으면 selected: false */
  selectRange(range: { section: number; paragraph: number; start: number; end: number }): Promise<{ selected: boolean }>;

  /** 메모 넣기·고치기(실행 취소에 남는다). 메모는 문서 화면에 그려지지 않는다 */
  readonly memo: {
    /** 캐럿(선택이 있으면 그 시작)에 메모. 본문 문단이 아니면 ok: false */
    insert(text: string, author?: string): Promise<{ ok: boolean; memoIndex?: number }>;
    /** 메모 번호(HWPX Number / HWP command)로 글 바꾸기 */
    edit(memoIndex: number, text: string): Promise<{ ok: boolean }>;
  };

  /** 본문 위치에 글 넣기(`\n` = 문단 나누기, 실행 취소 한 단계). 좌표가 본문 문단 밖이면 ok: false.
   *  돌려주는 위치 = 넣은 글 바로 뒤 */
  insertText(position: { section: number; paragraph: number; offset: number; text: string }): Promise<{
    ok: boolean; section?: number; paragraph?: number; offset?: number; paragraphsAdded?: number;
  }>;

  /** 캐럿(선택이 있으면 바꿈)에 블록 = 문단 하나씩. 스타일·굵게·코드 언어까지 실행 취소 한 단계. 캐럿 = 넣은 글 끝 */
  insertBlocks(blocks: Array<{
    text: string;
    style?: 'body' | 'outline1' | 'outline2' | 'outline3' | 'code';
    lang?: string;
    /** [start, end) 글자(코어 단위 = 유니코드 scalar) */
    bold?: Array<[number, number]>;
  }>): Promise<{ ok: boolean; section?: number; paragraph?: number; offset?: number; reason?: string }>;

  /** 마크다운 입력 규칙(기본 꺼짐) */
  readonly markdown: {
    setRules(enabled: boolean): Promise<{ ok: boolean }>;
  };

  /** 코드 블록 — 연속한 '코드' 스타일 본문 문단, 언어 = 책갈피 `_lily_code_<lang>_<n>` */
  readonly code: {
    blocks(): Promise<Array<{ section: number; paragraph: number; count: number; lang: string; lines: string[] }>>;
    context(): Promise<{ section: number; paragraph: number; count: number; lang: string } | null>;
    /** 실행 취소 한 단계 */
    setLanguage(section: number, paragraph: number, lang: string): Promise<{ ok: boolean }>;
    /** 문법 강조 칠하기 — 실행 취소 기록·dirty 없음. text 가 지금 문단 글과 다르면 그 문단은 건너뛴다. 오프셋 = 코어 단위 */
    paint(section: number, paragraphs: Array<{
      paragraph: number; text: string;
      runs: Array<{ start: number; end: number; color: string; bold?: boolean; italic?: boolean }>;
    }>): Promise<{ painted: number }>;
  };

  /** 상태 표시줄 값 */
  readonly status: {
    /** 캐럿의 단·줄(쪽 안 줄 번호)·칸, 모두 1부터. 본문 문단이 아니면(표·머리말·각주 안) null */
    caret(): Promise<{ page: number; column: number; line: number; char: number } | null>;
  };

  /** 메뉴·툴바·상태표시줄 표시. 숨겨도 커맨드는 실행된다 */
  readonly chrome: {
    get(): Promise<ChromeVisibility>;
    set(visibility: Partial<ChromeVisibility>): Promise<ChromeVisibility>;
  };

  /** 에디터를 제거합니다 */
  destroy(): void;
}

export interface CommandInfo {
  id: string;
  label: string;
  shortcutLabel?: string;
  icon?: string;
  enabled: boolean;
  opensDialog?: boolean;
}

export interface MenuItemNode {
  commandId?: string;
  label: string;
  enabled: boolean;
  submenu?: MenuItemNode[];
}

export interface MenuNode {
  menuId: string;
  label: string;
  items: MenuItemNode[];
}

export type CommandResult =
  | { ok: true }
  | { ok: false; reason: string; message?: string };

export type RhwpWebFontSupply = 'loaded' | 'registered' | 'catalogued' | 'absent';

export interface RhwpDocumentFont {
  fontName: string;
  /** available | needs-local-check | web-substitute | missing */
  status: string;
  source: string;
  /** 지금 화면에 대신 쓰는 글꼴 */
  substituteFont: string | null;
  webSupply: RhwpWebFontSupply;
  /** 이 이름에 등록된 웹 글꼴 파일. 상용 글꼴 이름에 오픈 글꼴 파일을 대역으로 붙인 경우가 있다 */
  webSupplyFile: string | null;
}

export interface RhwpDocumentFonts {
  fonts: RhwpDocumentFont[];
  fallbackFont: string | null;
  localSupported: boolean;
  localSnapshotStored: boolean;
}

export interface RhwpFontStatus {
  name: string;
  webSupply: RhwpWebFontSupply;
  /** true = OS 설치 확인. false 는 "확인 안 됨"(없다는 뜻이 아님) */
  local: boolean;
  webSupplyFile: string | null;
}

export interface RhwpFontActivation {
  ok: boolean;
  result: 'loaded' | 'local' | 'not-supplied' | 'failed';
  webSupply: RhwpWebFontSupply;
}

export type RhwpAlignment = 'justify' | 'left' | 'right' | 'center' | 'distribute' | 'split';
export type RhwpLineSpacingType = 'Percent' | 'Fixed' | 'SpaceOnly' | 'Minimum';

export interface RhwpCharFormat {
  fontSizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  /** '#rrggbb' */
  textColor?: string;
}

export interface RhwpParaFormat {
  alignment?: RhwpAlignment;
  lineSpacingType?: RhwpLineSpacingType;
  /** Percent 면 %, 그 외 pt */
  lineSpacing?: number;
  marginLeftPt?: number;
  marginRightPt?: number;
  /** 첫 줄(음수 = 내어 쓰기) */
  indentPt?: number;
  spacingBeforePt?: number;
  spacingAfterPt?: number;
}

export interface RhwpFormatState {
  char: {
    fontName: string | null;
    fontSizePt: number | null;
    textColor: string | null;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    superscript: boolean;
    subscript: boolean;
  };
  para: {
    alignment: RhwpAlignment | null;
    lineSpacingType: RhwpLineSpacingType | null;
    lineSpacing: number | null;
    marginLeftPt: number | null;
    marginRightPt: number | null;
    indentPt: number | null;
    spacingBeforePt: number | null;
    spacingAfterPt: number | null;
  };
}

export interface ChromeVisibility {
  menu: boolean;
  toolbar: boolean;
  statusbar: boolean;
}

export interface StudioOptions extends EditorOptions {
  /** 부팅 직후 올릴 플러그인 id 목록 (예: `['hwpctrl']`) */
  plugins?: string[];
  /** 초기 chrome 표시 상태 */
  chrome?: Partial<ChromeVisibility>;
}

/**
 * HWP 에디터를 생성하여 지정된 컨테이너에 마운트합니다.
 *
 * @example
 * ```javascript
 * import { createEditor } from '@rhwp/editor';
 *
 * const editor = await createEditor('#container');
 * const resp = await fetch('document.hwp');
 * await editor.loadFile(await resp.arrayBuffer());
 * ```
 */
export declare function createEditor(
  container: string | HTMLElement,
  options?: EditorOptions,
): Promise<RhwpEditor>;

/**
 * studio 인스턴스를 만들어 컨테이너에 심습니다.
 *
 * `createEditor` 의 상위 집합입니다. 컨테이너 이동은 지원하지 않습니다 — iframe 을 DOM
 * 이동시키면 브라우저가 문서를 재로드하므로, 옮기려면 `destroy()` 후 다시 만듭니다.
 */
export declare function createStudio(
  container: string | HTMLElement,
  options?: StudioOptions,
): Promise<RhwpEditor>;
