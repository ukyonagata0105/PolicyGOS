/**
 * Shared application type definitions.
 */

/** PDF file with metadata */
export interface PdfFile {
  file: File;
  id: string;
  name: string;
  size: number;
  uploadedAt: Date;
  extractedText?: string;
  pageCount?: number;
  metadata?: PdfMetadata;
}

/** PDF processing status */
export type PdfProcessingStatus = 'idle' | 'loading' | 'success' | 'error';

/** PDF metadata */
export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
}

/** PDF processing result */
export interface PdfProcessingResult {
  text: string;
  pageCount: number;
  metadata: PdfMetadata;
}

export type DocumentClassification = 'digital_text_pdf' | 'image_pdf' | 'mixed_pdf' | 'unknown';
export type IngestionPath = 'pdf_text_fast_path' | 'backend_ocr' | 'fallback' | 'yomitoku_ocr';

export interface PdfPageText {
  pageNumber: number;
  text: string;
  layoutText: string;
  charCount: number;
}

export interface PdfLayoutProcessingResult extends PdfProcessingResult {
  layoutText: string;
  pages: PdfPageText[];
  classification: DocumentClassification;
  classificationConfidence: number;
}

/** OCR processing status */
export type OcrStatus = 'idle' | 'processing' | 'completed' | 'error';

/** OCR processing result */
export interface OCRResult {
  text: string;
  confidence?: number;
  processingTimeMs: number;
  model?: string;
}

/** Deepseek OCR options */
export interface DeepseekOCROptions {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  onProgress?: (status: string, progress: number) => void;
}

/** Ollama connection status */
export type OllamaStatus = 'idle' | 'checking' | 'available' | 'unavailable';

/** Policy category */
export type PolicyCategory =
  | 'environment'
  | 'welfare'
  | 'education'
  | 'infrastructure'
  | 'healthcare'
  | 'economy'
  | 'public-safety'
  | 'culture'
  | 'agriculture'
  | 'digital'
  | 'other';

/** Key point in a policy */
export interface PolicyKeyPoint {
  text: string;
  importance?: 'high' | 'medium' | 'low';
}

/** Structured policy data extracted from documents */
export interface StructuredPolicy {
  title: string;
  municipality: string;
  summary: string;
  keyPoints: PolicyKeyPoint[];
  category: PolicyCategory;
  extractedAt?: string;
  model?: string;
  sourceDocumentId?: string;

  budget?: {
    amount?: number;
    fiscalYear?: string;
    description?: string;
  };
  implementationPeriod?: {
    startDate?: string;
    endDate?: string;
    duration?: string;
  };
  targetPopulation?: string;
  departments?: string[];
  kpis?: Array<{
    name: string;
    currentValue?: string;
    targetValue?: string;
    unit?: string;
  }>;
  stakeholders?: Array<{
    name: string;
    role: string;
  }>;
  tags?: string[];
}

export type SourceDiscoveryStrategy =
  | 'manual-upload'
  | 'static-pdf-url'
  | 'listing-page'
  | 'viewer-kintone';

export type SourceCollectionStatus = 'manual' | 'discovered' | 'collected' | 'review';

export interface SourceDiscoveryCandidateSummary {
  url: string;
  label: string;
  fileName: string;
}

export interface CollectionSource {
  id: string;
  municipality: string;
  label: string;
  sourceUrl: string;
  discoveryStrategy: SourceDiscoveryStrategy;
  status: SourceCollectionStatus;
  notes?: string;
  lastCollectedAt?: string;
  discoveryCandidates?: SourceDiscoveryCandidateSummary[];
}

export type PromptConversationRole = 'user' | 'assistant';

export interface PromptConversationMessage {
  role: PromptConversationRole;
  content: string;
}

export type PromptSubmissionMode = 'fresh' | 'follow-up';

export interface PromptSessionAttachment {
  id: string;
  kind: 'pdf';
  name: string;
  sourceDocumentId: string;
}

export interface PromptSession {
  turns: PromptConversationMessage[];
  attachment: PromptSessionAttachment | null;
}

export interface PromptSessionSubmission {
  prompt: string;
  mode: PromptSubmissionMode;
  session: PromptSession;
}

export interface PromptGenerationRequest {
  prompt: string;
  mode: PromptSubmissionMode;
  messages: PromptConversationMessage[];
  contextDocumentId?: string | null;
}

export interface PromptGenerationResult {
  session: PromptSession;
  messages: PromptConversationMessage[];
  generatedUi: GeneratedUI;
  exportDocuments: WorkspaceDocument[];
}

export interface EvidenceRef {
  documentId: string;
  documentName: string;
  page?: number;
  tableId?: string;
  rowNumber?: number;
  sourceReference?: string;
  excerpt?: string;
}

export type IndicatorType = 'activity' | 'outcome';

export interface IndicatorRecord {
  id: string;
  projectId: string;
  indicatorType: IndicatorType;
  name: string;
  unit?: string;
  plannedValue?: string;
  actualValue?: string;
  targetValue?: string;
  achievement?: string;
  sourceRefs: EvidenceRef[];
}

export type ProjectPublicationStatus = 'ready' | 'review' | 'blocked';

export interface ProjectCandidateRow {
  id: string;
  sourceDocumentId: string;
  extractorStrategy: 'row-segmented' | 'sheet' | 'block';
  page?: number;
  tableId?: string;
  rowNumber?: number;
  sourceReference: string;
  sectionPath: string[];
  projectNumber?: string;
  projectNameCandidate: string;
  projectSummaryCandidate: string;
  activityIndicatorName?: string;
  indicatorUnit?: string;
  actualValue?: string;
  targetValue?: string;
  department?: string;
  budget?: string;
  status?: string;
  fiscalYear?: string;
  rowFields: Record<string, string>;
  confidence: number;
  candidateKind: 'project' | 'section';
}

export interface ProjectCandidateRowBundle {
  documentId: string;
  documentName: string;
  municipalityHint?: string;
  titleHint?: string;
  overviewHint?: string;
  candidateRows: ProjectCandidateRow[];
  fieldGlossary?: Record<string, string>;
  neighborRows?: Array<{
    sourceReference: string;
    previousSourceReference?: string;
    previousProjectName?: string;
    nextSourceReference?: string;
    nextProjectName?: string;
  }>;
  rawCsvPreview?: string;
  layoutPreview?: string;
}

export type ProjectRowDecisionType = 'project' | 'continuation' | 'section' | 'note' | 'drop';

export interface ProjectRowDecision {
  sourceReference: string;
  decision: ProjectRowDecisionType;
  sectionPath: string[];
  municipality?: string;
  projectNumber?: string;
  projectName?: string;
  projectSummary?: string;
  department?: string;
  budget?: string;
  fiscalYear?: string;
  status?: string;
  activityIndicatorName?: string;
  activityIndicatorUnit?: string;
  activityPlannedValue?: string;
  activityActualValue?: string;
  outcomeIndicatorName?: string;
  outcomeIndicatorUnit?: string;
  outcomeTargetValue?: string;
  outcomeActualValue?: string;
  achievement?: string;
  supportingFields: string[];
  supportingTextSpans: string[];
  decisionNotes: string[];
  qualityHints: string[];
  confidence: number;
  reviewFlags: string[];
}

export interface NormalizedProjectRow {
  sourceReference: string;
  sectionPath: string[];
  municipality?: string;
  projectNumber?: string;
  projectName: string;
  projectSummary: string;
  department?: string;
  budget?: string;
  fiscalYear?: string;
  status?: string;
  activityIndicatorName?: string;
  activityIndicatorUnit?: string;
  activityPlannedValue?: string;
  activityActualValue?: string;
  outcomeIndicatorName?: string;
  outcomeIndicatorUnit?: string;
  outcomeTargetValue?: string;
  outcomeActualValue?: string;
  achievement?: string;
  confidence: number;
  reviewFlags: string[];
}

export type RepairStatus = 'idle' | 'running' | 'adopted' | 'rejected' | 'failed';

export interface RepairMetrics {
  originalNormalizedRowCount: number;
  repairedNormalizedRowCount: number;
  adoptedNormalizedRowCount: number;
  originalProjectCount: number;
  repairedProjectCount: number;
  adoptedProjectCount: number;
  improvedFlags: string[];
  worsenedFlags: string[];
}

export interface RepairResult {
  success: boolean;
  provider: string;
  model?: string;
  normalizedRows: NormalizedProjectRow[];
  notes: string[];
  rawResponse?: string | null;
  error?: string | null;
}

export interface RepairRowPayload {
  source_reference: string;
  section_path: string[];
  municipality?: string;
  project_number?: string;
  project_name: string;
  project_summary: string;
  department?: string;
  budget?: string;
  fiscal_year?: string;
  status?: string;
  activity_indicator_name?: string;
  activity_indicator_unit?: string;
  activity_planned_value?: string;
  activity_actual_value?: string;
  outcome_indicator_name?: string;
  outcome_indicator_unit?: string;
  outcome_target_value?: string;
  outcome_actual_value?: string;
  achievement?: string;
  confidence: number;
  review_flags: string[];
}

export interface RepairDocumentPayload {
  document_id: string;
  document_name: string;
  municipality_hint?: string;
  title_hint?: string;
  overview_hint?: string;
  raw_csv?: string;
  extraction_raw_response?: string;
  candidate_rows: ProjectCandidateRow[];
  row_decisions: ProjectRowDecision[];
  normalized_rows: RepairRowPayload[];
  review_items: ReviewItem[];
  gemini_api_key?: string;
  model?: string;
}

export interface RepairResponse {
  success: boolean;
  provider: string;
  model?: string;
  normalized_rows: RepairRowPayload[];
  notes: string[];
  raw_response?: string | null;
  error?: string | null;
}

export interface ProjectRecord {
  id: string;
  sourceDocumentId: string;
  projectNumber?: string;
  projectName: string;
  projectSummary: string;
  department?: string;
  budget?: string;
  fiscalYear?: string;
  status?: string;
  sourceRefs: EvidenceRef[];
  indicators: IndicatorRecord[];
  confidence: number;
  reviewFlags: string[];
  publicationStatus: ProjectPublicationStatus;
  publicationNotes: string[];
}

export interface DocumentDigest {
  title: string;
  municipality: string;
  overview: string;
  category?: PolicyCategory;
}

export interface ReviewItem {
  id: string;
  documentId: string;
  projectId?: string;
  severity: 'low' | 'medium' | 'high';
  reason: string;
  suggestedAction?: string;
  status: 'open' | 'resolved';
}

/** Data structuring result */
export interface DataStructuringResult {
  success: boolean;
  policy?: StructuredPolicy;
  error?: string;
  rawResponse?: string;
  provider?: string;
  model?: string;
}

export interface ProjectExtractionResult {
  success: boolean;
  documentDigest?: DocumentDigest;
  candidateBundle?: ProjectCandidateRowBundle;
  rawCandidateRows?: ProjectCandidateRow[];
  candidateRows?: ProjectCandidateRow[];
  routeDecision?: DocumentRouteDecision;
  rowDecisions?: ProjectRowDecision[];
  normalizedRows?: NormalizedProjectRow[];
  projectRowsCsv?: string;
  projects?: ProjectRecord[];
  reviewItems?: ReviewItem[];
  error?: string;
  rawResponse?: string;
  provider?: string;
  model?: string;
}

export interface IngestionStageArtifacts {
  ocrText: string | null;
  structuringText: string | null;
  rawLayoutText: string | null;
  rawJson: string | null;
  rawCsv: string | null;
  documentType?: DocumentClassification;
  ingestionPath?: IngestionPath;
  classificationConfidence?: number;
  error: string | null;
}

export interface TableStageArtifacts {
  tableArtifacts: TableArtifact[];
  tableResults: TableParseResult[];
}

export interface ProjectExtractionArtifacts {
  documentDigest: DocumentDigest | null;
  candidateBundle: ProjectCandidateRowBundle | null;
  rawCandidateRows: ProjectCandidateRow[];
  candidateRows: ProjectCandidateRow[];
  routeDecision: DocumentRouteDecision | null;
  rowDecisions: ProjectRowDecision[];
  normalizedRows: NormalizedProjectRow[];
  projectRowsCsv: string | null;
  projects: ProjectRecord[];
  reviewItems: ReviewItem[];
  provider?: string;
  model?: string;
  rawResponse?: string | null;
  error?: string | null;
}

export interface RepairStageArtifacts {
  repairStatus: RepairStatus;
  repairProvider?: string;
  repairModel?: string;
  repairRawResponse?: string | null;
  repairError?: string | null;
  repairNotes: string[];
  repairMetrics?: RepairMetrics | null;
  originalNormalizedRows: NormalizedProjectRow[];
  repairedNormalizedRows: NormalizedProjectRow[];
  normalizedRows: NormalizedProjectRow[];
}

export type DocumentContentRoute = 'table' | 'direct';

export type DocumentRouteReason =
  | 'viable_candidate_rows'
  | 'parsed_tables_without_viable_rows'
  | 'raw_csv_without_viable_rows'
  | 'no_tabular_evidence';

export type DocumentRouteConfidence = 'strong' | 'moderate' | 'weak';

export interface DocumentRouteEvidence {
  rawCsvPresent: boolean;
  parsedTableCount: number;
  tableArtifactCount: number;
  candidateRowCount: number;
  projectCandidateRowCount: number;
  viableCandidateRowCount: number;
}

export interface DocumentRouteDecision {
  route: DocumentContentRoute;
  reason: DocumentRouteReason;
  confidence: DocumentRouteConfidence;
  evidence: DocumentRouteEvidence;
}

/** Data structuring options */
export interface DataStructuringOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export type DeliveryMode = 'interactive-browser' | 'fullscreen-present' | 'zip-export';
export type AudienceType = 'resident' | 'staff' | 'legislator' | 'researcher';
export type ReadingPreference = 'summary' | 'detail' | 'comparison';
export type DisplayConstraint = 'mobile' | 'desktop' | 'presentation';
export type WorkspacePhase = 'idle' | 'ingestion' | 'understanding' | 'generation' | 'delivery';

export interface UserProfile {
  audience: AudienceType;
  readingPreference: ReadingPreference;
  displayConstraint: DisplayConstraint;
}

export interface ProcessingJob {
  provider: string;
  status: 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  jobId?: string;
  pages?: number | null;
  startedAt?: string;
  completedAt?: string;
}

export type TableParserId =
  | 'backend_csv_passthrough'
  | 'markdown_table'
  | 'fixed_width_columns'
  | 'key_value_rows'
  | 'multi_header_matrix'
  | 'ledger_budget_table'
  | 'llm_repair'
  | 'no_parse';

export interface TableArtifact {
  id: string;
  sourceDocumentId: string;
  page: number | null;
  tableIndex: number;
  sourceType: 'ocr_markdown' | 'ocr_text' | 'backend_csv' | 'pdf_layout_text' | 'yomitoku_csv';
  preview: string;
  rawText: string;
  rawMarkdown?: string;
  rawCsv?: string;
  layoutText?: string;
  sourcePath?: IngestionPath;
}

export interface ParserHints {
  headerRows?: number;
  rowLabelCol?: number;
  notes?: string;
}

export interface ParserDecision {
  parserId: TableParserId;
  confidence: number;
  hints?: ParserHints;
  fallbackParserIds: TableParserId[];
  provider: string;
  model: string;
}

export interface ParsedTable {
  id: string;
  artifactId: string;
  parserId: Exclude<TableParserId, 'no_parse'>;
  headers: string[];
  rows: string[][];
  csv: string;
  json: Array<Record<string, string>>;
  issues: string[];
}

export interface UnparsedTable {
  id: string;
  artifactId: string;
  parserId: 'no_parse';
  preview: string;
  reason: string;
  issues: string[];
}

export type TableParseResult =
  | {
      status: 'parsed';
      table: ParsedTable;
      decision: ParserDecision;
    }
  | {
      status: 'unparsed';
      table: UnparsedTable;
      decision: ParserDecision;
    };

export interface WorkspaceDocument extends PdfFile {
  collectionSource: CollectionSource;
  processing: ProcessingJob;
  ocrText: string | null;
  structuringText: string | null;
  rawLayoutText: string | null;
  rawJson: string | null;
  rawCsv: string | null;
  structuredData: StructuredPolicy | null;
  documentDigest: DocumentDigest | null;
  rawCandidateRows: ProjectCandidateRow[];
  candidateRows: ProjectCandidateRow[];
  routeDecision: DocumentRouteDecision | null;
  rowDecisions: ProjectRowDecision[];
  originalNormalizedRows: NormalizedProjectRow[];
  repairedNormalizedRows: NormalizedProjectRow[];
  normalizedRows: NormalizedProjectRow[];
  repairStatus: RepairStatus;
  repairProvider?: string;
  repairModel?: string;
  repairRawResponse?: string | null;
  repairError?: string | null;
  repairNotes: string[];
  repairMetrics?: RepairMetrics | null;
  extractionProvider?: string;
  extractionModel?: string;
  extractionRawResponse?: string | null;
  extractionError?: string | null;
  projectRecords: ProjectRecord[];
  reviewItems: ReviewItem[];
  tableArtifacts: TableArtifact[];
  tableResults: TableParseResult[];
  documentType?: DocumentClassification;
  ingestionPath?: IngestionPath;
  classificationConfidence?: number;
  error: string | null;
}

export interface WorkspaceSummary {
  title: string;
  municipalities: string[];
  categories: PolicyCategory[];
  documentCount: number;
  projectCount: number;
  openReviewCount: number;
  keyPoints: PolicyKeyPoint[];
  combinedSummary: string;
}

export interface PolicyCorpus {
  id: string;
  generatedAt: string;
  sources: CollectionSource[];
  documents: Array<{
    id: string;
    name: string;
    municipality: string;
    title: string;
    strategy: SourceDiscoveryStrategy;
    status: SourceCollectionStatus;
    projectCount: number;
    reviewCount: number;
    ingestionPath?: IngestionPath;
  }>;
  projects: ProjectRecord[];
  reviewItems: ReviewItem[];
  publicationSummary: {
    ready: number;
    review: number;
    blocked: number;
  };
}

export type ViewAccent = 'sky' | 'emerald' | 'amber' | 'slate';
export type ViewSectionKind =
  | 'hero'
  | 'summary-grid'
  | 'key-points'
  | 'documents'
  | 'comparison'
  | 'data-table'
  | 'timeline'
  | 'text';

export interface ViewItem {
  label: string;
  value: string;
  emphasis?: 'default' | 'strong';
}

export interface ViewTable {
  columns: string[];
  rows: string[][];
  rowSectionIds?: Array<string | null>;
  rowLinkColumnIndex?: number;
}

export interface GeneratedViewSection {
  id: string;
  kind: ViewSectionKind;
  title: string;
  description?: string;
  accent?: ViewAccent;
  items?: ViewItem[];
  paragraphs?: string[];
  table?: ViewTable;
}

export interface GeneratedViewSchema {
  sections: GeneratedViewSection[];
  layout: {
    density: 'compact' | 'comfortable';
    emphasis: ReadingPreference;
    heroStyle: 'editorial' | 'dashboard' | 'presentation';
  };
}

export interface GeneratedUI {
  id: string;
  title: string;
  summary: string;
  schema: GeneratedViewSchema;
  timestamp: string;
  provider: string;
  model: string;
  prompt?: string;
  htmlDocument?: string;
  renderMode?: 'schema' | 'html';
  warnings?: string[];
}

export type GeneratedUIStructure = GeneratedViewSchema;

/** UI generation options */
export interface UIGenerationOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  retryAttempts?: number;
  retryDelay?: number;
  sourceRegistry?: CollectionSource[];
  promptRequest?: PromptGenerationRequest;
}

export interface GeneratedUIBuildInput {
  documents: WorkspaceDocument[];
  userProfile: UserProfile;
  sourceRegistry: CollectionSource[];
  promptRequest?: PromptGenerationRequest;
}

export interface GeneratedUIBuildOutput {
  ui: GeneratedUI;
  provider: string;
  model: string;
  error?: string;
}

/** UI generation result */
export interface UIGenerationResult {
  success: boolean;
  ui?: GeneratedUI;
  error?: string;
  rawResponse?: string;
  provider?: string;
  model?: string;
}

export interface WorkspaceDocumentPipelineSlices {
  ingestion: IngestionStageArtifacts;
  tables: TableStageArtifacts;
  extraction: ProjectExtractionArtifacts;
  repair: RepairStageArtifacts;
}

export interface WorkspaceDocumentDisplayState {
  id: string;
  name: string;
  municipality: string;
  projectCount: number;
  openReviewCount: number;
  repairStatus: RepairStatus;
  repairProvider?: string;
  ingestionPath?: IngestionPath;
  documentType?: DocumentClassification;
  processing: ProcessingJob;
  error: string | null;
}

export interface WorkspaceDocumentDebugSummary {
  rawProjectCandidateCount: number;
  candidateProjectCount: number;
  normalizedRowCount: number;
  repairedRowCount: number;
  sectionCount: number;
}

export interface WorkspaceDocumentReviewDebugState {
  display: WorkspaceDocumentDisplayState;
  structuredData: StructuredPolicy | null;
  ocrText: string | null;
  reviewItems: ReviewItem[];
  debugSummary: WorkspaceDocumentDebugSummary;
  projectRowsCsv: string | null;
  pipeline: WorkspaceDocumentPipelineSlices;
}

export interface WorkspaceProjectExplorerItem {
  id: string;
  sourceDocumentId: string;
  sourceDocumentName: string;
  municipality: string;
  projectNumber?: string;
  projectName: string;
  projectSummary: string;
  sectionPath: string[];
  activityIndicatorCount: number;
  outcomeIndicatorCount: number;
  confidencePercent: number;
  publicationStatus: ProjectPublicationStatus;
  reviewFlags: string[];
  publicationNotes: string[];
}

export interface WorkspacePresentationState {
  workspaceSummary: WorkspaceSummary | null;
  corpus: PolicyCorpus;
  documentCards: WorkspaceDocumentDisplayState[];
  selectedDocument: WorkspaceDocumentReviewDebugState | null;
  projectExplorerItems: WorkspaceProjectExplorerItem[];
}

export interface WorkspaceState {
  sessionId: string;
  sourceRegistry: CollectionSource[];
  documents: WorkspaceDocument[];
  generatedUI: GeneratedUI | null;
  activeDeliveryMode: DeliveryMode;
  phase: WorkspacePhase;
  isProcessing: boolean;
  error: string | null;
  lastUpdatedAt: string;
}

/** Legacy application state kept for compatibility with existing utilities */
export interface AppState {
  pdfFile: PdfFile | null;
  ocrStatus: OcrStatus;
  ocrResult: string | null;
  structuredData: StructuredPolicy | null;
  generatedUI: GeneratedUI | null;
  currentStep: WorkflowStep;
  isProcessing: boolean;
  error: string | null;
}

/** Legacy workflow step values retained for compatibility */
export type WorkflowStep =
  | 'upload'
  | 'ocr'
  | 'structuring'
  | 'ui-generation'
  | 'completed'
  | 'ingestion'
  | 'understanding'
  | 'generation'
  | 'delivery';
