export {
  OCRBackendClient as YomiTokuClient,
  getOCRBackendClient as getYomiTokuClient,
  isOCRBackendAvailable as isYomiTokuAvailable,
  resetOCRBackendClient as resetYomiTokuClient,
  resolveBackendConnection,
} from '@/lib/ocrBackendClient';

export type {
  AsyncJobResult,
  BackendConnectionState,
  JobStatus,
  OCRBackendAnalysisResponse as YomiTokuAnalysisResponse,
  OCRBackendConfig as YomiTokuConfig,
  OCRBackendHealthResponse as YomiTokuHealthResponse,
  OutputFormat,
} from '@/lib/ocrBackendClient';
