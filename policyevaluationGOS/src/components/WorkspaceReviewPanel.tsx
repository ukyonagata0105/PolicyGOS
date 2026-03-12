import { useMemo, useState } from 'react';

import { PolicyDataView } from '@/components/PolicyDataView';
import type {
  ProcessingJob,
  WorkspaceDocumentReviewDebugState,
  WorkspaceProjectExplorerItem,
} from '@/types';

type ReviewSurfaceTab = 'projects' | 'policy' | 'debug';

interface WorkspaceReviewPanelProps {
  selectedDocument: WorkspaceDocumentReviewDebugState | null;
  projectExplorerItems: WorkspaceProjectExplorerItem[];
  isOpen: boolean;
  onToggle: () => void;
}

export function WorkspaceReviewPanel({
  selectedDocument,
  projectExplorerItems,
  isOpen,
  onToggle,
}: WorkspaceReviewPanelProps) {
  const [activeTab, setActiveTab] = useState<ReviewSurfaceTab>('projects');

  const selectedDocumentProjects = useMemo(() => {
    if (!selectedDocument) {
      return [];
    }

    return projectExplorerItems.filter((project) => project.sourceDocumentId === selectedDocument.display.id);
  }, [projectExplorerItems, selectedDocument]);

  const visibleProjects = selectedDocumentProjects.length > 0 ? selectedDocumentProjects : projectExplorerItems;
  const openReviewCount = selectedDocument?.reviewItems.filter((item) => item.status === 'open').length ?? 0;

  return (
    <section className="rounded-[1.75rem] border border-white/70 bg-white/80 p-6 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Review Workspace</h2>
          <p className="mt-1 text-sm text-slate-500">
            Project Explorer / structured policy / debug trace を必要なときだけ開く検証面に集約します。
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
        >
          {isOpen ? '閉じる' : '開く'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
        <SurfacePill label="文書" value={selectedDocument?.display.name || '未選択'} />
        <SurfacePill label="Projects" value={`${visibleProjects.length}`} />
        <SurfacePill label="Open review" value={`${openReviewCount}`} />
        {selectedDocument && (
          <SurfacePill label="Status" value={statusLabel(selectedDocument.display.processing.status)} />
        )}
      </div>

      {!isOpen && (
        <div className="mt-5 rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
          生成ビューを主面に保ちつつ、抽出確認はこのワークスペース内で切り替えます。
        </div>
      )}

      {isOpen && (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            <TabButton label="Project Explorer" active={activeTab === 'projects'} onClick={() => setActiveTab('projects')} />
            <TabButton label="Structured policy" active={activeTab === 'policy'} onClick={() => setActiveTab('policy')} />
            <TabButton label="Debug trace" active={activeTab === 'debug'} onClick={() => setActiveTab('debug')} />
          </div>

          {activeTab === 'projects' && (
            <div className="space-y-5">
              {selectedDocument && (
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    raw candidates {selectedDocument.debugSummary.rawProjectCandidateCount}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    candidate rows {selectedDocument.debugSummary.candidateProjectCount}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    normalized rows {selectedDocument.debugSummary.normalizedRowCount}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    repaired rows {selectedDocument.debugSummary.repairedRowCount}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    sections {selectedDocument.debugSummary.sectionCount}
                  </span>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {visibleProjects.slice(0, 12).map((project) => (
                  <article key={project.id} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      {project.projectNumber || '番号未抽出'} / {project.municipality}
                    </p>
                    <h3 className="mt-2 text-base font-semibold text-slate-900">{project.projectName}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{project.projectSummary}</p>
                    {project.sectionPath.length ? (
                      <p className="mt-2 text-xs text-slate-500">{project.sectionPath.join(' > ')}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-white px-3 py-1">活動 {project.activityIndicatorCount}</span>
                      <span className="rounded-full bg-white px-3 py-1">成果 {project.outcomeIndicatorCount}</span>
                      <span className="rounded-full bg-white px-3 py-1">信頼度 {project.confidencePercent}%</span>
                      <span className="rounded-full bg-white px-3 py-1">
                        {project.publicationStatus === 'ready'
                          ? '公開可'
                          : project.publicationStatus === 'blocked'
                            ? '公開保留'
                            : '要確認'}
                      </span>
                    </div>
                    {project.reviewFlags.length > 0 && (
                      <p className="mt-3 text-xs text-amber-700">要確認: {project.reviewFlags.join(' / ')}</p>
                    )}
                    {project.publicationNotes.length > 0 && (
                      <p className="mt-2 text-xs text-slate-500">{project.publicationNotes.join(' / ')}</p>
                    )}
                  </article>
                ))}
                {visibleProjects.length === 0 && (
                  <div className="rounded-[1.25rem] border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                    事業レコードはまだありません。
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'policy' && (
            selectedDocument?.structuredData ? (
              <PolicyDataView
                structuredData={selectedDocument.structuredData}
                isProcessing={false}
                ocrResult={selectedDocument.ocrText}
                pdfFileName={selectedDocument.display.name}
              />
            ) : (
              <EmptySurfaceState message="構造化データはまだありません。" />
            )
          )}

          {activeTab === 'debug' && (
            selectedDocument ? (
              <DebugTraceSurface selectedDocument={selectedDocument} />
            ) : (
              <EmptySurfaceState message="文書を選択すると debug trace を表示できます。" />
            )
          )}
        </div>
      )}
    </section>
  );
}

interface DebugTraceSurfaceProps {
  selectedDocument: WorkspaceDocumentReviewDebugState;
}

function DebugTraceSurface({ selectedDocument }: DebugTraceSurfaceProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Review flags</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedDocument.reviewItems.length > 0 ? (
            selectedDocument.reviewItems.map((item) => (
              <span key={item.id} className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">
                {item.reason}
              </span>
            ))
          ) : (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700">確認項目なし</span>
          )}
        </div>
      </div>

      {selectedDocument.pipeline.tables.tableResults.length > 0 && (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Parsed tables</p>
          <div className="mt-3 space-y-3">
            {selectedDocument.pipeline.tables.tableResults.map((result) => (
              <div key={result.table.id} className="rounded-2xl border border-white bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900">
                    {result.status === 'parsed' ? result.table.parserId : 'no_parse'}
                  </p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
                    {Math.round(result.decision.confidence * 100)}%
                  </span>
                </div>
                {result.status === 'parsed' ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full border-collapse text-left text-xs text-slate-600">
                      <thead>
                        <tr>
                          {result.table.headers.map((header) => (
                            <th key={header} className="border-b border-slate-200 px-2 py-1 font-semibold text-slate-700">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.table.rows.slice(0, 4).map((row, index) => (
                          <tr key={`${result.table.id}-${index}`}>
                            {row.map((cell, cellIndex) => (
                              <td key={`${result.table.id}-${index}-${cellIndex}`} className="border-b border-slate-100 px-2 py-1 align-top">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-3 whitespace-pre-wrap text-xs text-slate-500">{result.table.preview}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedDocument.pipeline.extraction.rawCandidateRows.length > 0 && (
        <TraceTableSection
          title="Raw candidate rows"
          headers={['kind', 'section', 'project', 'indicator', 'source']}
          rows={selectedDocument.pipeline.extraction.rawCandidateRows.slice(0, 12).map((row) => [
            row.candidateKind,
            row.sectionPath.join(' > ') || '-',
            `${row.projectNumber ? `${row.projectNumber} ` : ''}${row.projectNameCandidate || '-'}`,
            row.activityIndicatorName || '-',
            row.sourceReference,
          ])}
        />
      )}

      {selectedDocument.pipeline.extraction.candidateRows.length > 0 && (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <TraceTableSection
            title="Normalized candidate rows"
            headers={['kind', 'section', 'project', 'indicator', 'source']}
            rows={selectedDocument.pipeline.extraction.candidateRows.slice(0, 12).map((row) => [
              row.candidateKind,
              row.sectionPath.join(' > ') || '-',
              `${row.projectNumber ? `${row.projectNumber} ` : ''}${row.projectNameCandidate || '-'}`,
              row.activityIndicatorName || '-',
              row.sourceReference,
            ])}
            nested={false}
          />
          {selectedDocument.projectRowsCsv && (
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-[11px] leading-5 text-slate-100">
              {selectedDocument.projectRowsCsv.split('\n').slice(0, 8).join('\n')}
            </pre>
          )}
        </div>
      )}

      {(selectedDocument.pipeline.extraction.provider ||
        selectedDocument.pipeline.extraction.rawResponse ||
        selectedDocument.pipeline.extraction.error) && (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Extraction trace</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            {selectedDocument.pipeline.extraction.provider && (
              <span className="rounded-full bg-white px-3 py-1">{selectedDocument.pipeline.extraction.provider}</span>
            )}
            {selectedDocument.pipeline.extraction.model && (
              <span className="rounded-full bg-white px-3 py-1">{selectedDocument.pipeline.extraction.model}</span>
            )}
            {selectedDocument.pipeline.extraction.error && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">
                {selectedDocument.pipeline.extraction.error}
              </span>
            )}
          </div>
          {selectedDocument.pipeline.extraction.candidateBundle && (
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-[11px] leading-5 text-slate-100">
              {JSON.stringify(selectedDocument.pipeline.extraction.candidateBundle, null, 2).slice(0, 4000)}
            </pre>
          )}
          {selectedDocument.pipeline.extraction.rawResponse && (
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-[11px] leading-5 text-slate-100">
              {selectedDocument.pipeline.extraction.rawResponse.slice(0, 12000)}
            </pre>
          )}
        </div>
      )}

      {(selectedDocument.pipeline.repair.repairProvider ||
        selectedDocument.pipeline.repair.repairRawResponse ||
        selectedDocument.pipeline.repair.repairError) && (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Repair trace</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-white px-3 py-1">{selectedDocument.pipeline.repair.repairStatus}</span>
            {selectedDocument.pipeline.repair.repairProvider && (
              <span className="rounded-full bg-white px-3 py-1">{selectedDocument.pipeline.repair.repairProvider}</span>
            )}
            {selectedDocument.pipeline.repair.repairModel && (
              <span className="rounded-full bg-white px-3 py-1">{selectedDocument.pipeline.repair.repairModel}</span>
            )}
            {selectedDocument.pipeline.repair.repairError && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">
                {selectedDocument.pipeline.repair.repairError}
              </span>
            )}
          </div>
          {selectedDocument.pipeline.repair.repairNotes.length > 0 && (
            <p className="mt-3 text-xs text-slate-600">{selectedDocument.pipeline.repair.repairNotes.join(' / ')}</p>
          )}
          {selectedDocument.pipeline.repair.repairMetrics && (
            <p className="mt-3 text-xs text-slate-500">
              rows {selectedDocument.pipeline.repair.repairMetrics.originalNormalizedRowCount} -&gt;{' '}
              {selectedDocument.pipeline.repair.repairMetrics.repairedNormalizedRowCount} / projects{' '}
              {selectedDocument.pipeline.repair.repairMetrics.originalProjectCount} -&gt;{' '}
              {selectedDocument.pipeline.repair.repairMetrics.repairedProjectCount}
            </p>
          )}
          {selectedDocument.pipeline.repair.repairRawResponse && (
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-[11px] leading-5 text-slate-100">
              {selectedDocument.pipeline.repair.repairRawResponse.slice(0, 12000)}
            </pre>
          )}
        </div>
      )}

      {selectedDocument.pipeline.extraction.rowDecisions.length > 0 && (
        <TraceTableSection
          title="Gemini row decisions"
          headers={['source', 'decision', 'project', 'quality hints', 'notes']}
          rows={selectedDocument.pipeline.extraction.rowDecisions.slice(0, 12).map((row) => [
            row.sourceReference,
            row.decision,
            `${row.projectNumber ? `${row.projectNumber} ` : ''}${row.projectName || '-'}`,
            row.qualityHints.join(' / ') || '-',
            row.decisionNotes.join(' / ') || '-',
          ])}
        />
      )}

      {selectedDocument.pipeline.repair.normalizedRows.length > 0 && (
        <TraceTableSection
          title="Gemini normalized rows"
          headers={['section', 'project', 'activity', 'outcome', 'confidence', 'flags']}
          rows={selectedDocument.pipeline.repair.normalizedRows.slice(0, 12).map((row) => [
            row.sectionPath.join(' > ') || '-',
            `${row.projectNumber ? `${row.projectNumber} ` : ''}${row.projectName}`,
            row.activityIndicatorName || '-',
            row.outcomeIndicatorName || '-',
            `${Math.round(row.confidence * 100)}%`,
            row.reviewFlags.join(' / ') || '-',
          ])}
        />
      )}
    </div>
  );
}

interface TraceTableSectionProps {
  title: string;
  headers: string[];
  rows: string[][];
  nested?: boolean;
}

function TraceTableSection({ title, headers, rows, nested = true }: TraceTableSectionProps) {
  const containerClassName = nested
    ? 'rounded-3xl border border-slate-200 bg-slate-50 p-4'
    : '';

  return (
    <div className={containerClassName}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-xs text-slate-600">
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header} className="border-b border-slate-200 px-2 py-1 font-semibold text-slate-700">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${title}-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${title}-${rowIndex}-${cellIndex}`} className="border-b border-slate-100 px-2 py-1 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface EmptySurfaceStateProps {
  message: string;
}

function EmptySurfaceState({ message }: EmptySurfaceStateProps) {
  return (
    <div className="rounded-[1.25rem] border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

interface SurfacePillProps {
  label: string;
  value: string;
}

function SurfacePill({ label, value }: SurfacePillProps) {
  return <span className="rounded-full bg-slate-100 px-3 py-1">{label}: {value}</span>;
}

interface TabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function TabButton({ label, active, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? 'bg-slate-900 text-white shadow-sm'
          : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );
}

function statusLabel(status: ProcessingJob['status']): string {
  switch (status) {
    case 'completed':
      return '完了';
    case 'failed':
      return '失敗';
    case 'processing':
      return '処理中';
    case 'queued':
      return '待機中';
    case 'idle':
    default:
      return '未開始';
  }
}
