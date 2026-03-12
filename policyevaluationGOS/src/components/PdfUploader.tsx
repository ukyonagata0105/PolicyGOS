import { useState } from 'react';

import { createPdfFile } from '@/lib/workspace';
import type { PdfFile, PdfProcessingStatus } from '@/types';

interface PdfUploaderProps {
  onPdfUpload: (pdfs: PdfFile[]) => void;
  onProcessingStatusChange?: (status: PdfProcessingStatus) => void;
  disabled?: boolean;
}

export function PdfUploader({
  onPdfUpload,
  onProcessingStatusChange,
  disabled = false,
}: PdfUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<PdfProcessingStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFiles = async (files: FileList | File[]) => {
    const allFiles = Array.from(files);
    const pdfFiles = allFiles.filter((file) => file.type === 'application/pdf');

    if (pdfFiles.length === 0) {
      const error = 'PDF ファイルのみアップロード可能です';
      setErrorMessage(error);
      setProcessingStatus('error');
      onProcessingStatusChange?.('error');
      return;
    }

    if (pdfFiles.length !== allFiles.length) {
      setErrorMessage('PDF 以外のファイルは無視されました');
    } else {
      setErrorMessage(null);
    }

    setProcessingStatus('loading');
    onProcessingStatusChange?.('loading');

    const createdDocuments = pdfFiles.map(createPdfFile);
    onPdfUpload(createdDocuments);

    setProcessingStatus('success');
    onProcessingStatusChange?.('success');

    window.setTimeout(() => {
      setProcessingStatus('idle');
      setErrorMessage(null);
      onProcessingStatusChange?.('idle');
    }, 1000);
  };

  return (
    <div className="w-full">
      <div
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (!disabled) {
            void handleFiles(event.dataTransfer.files);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) {
            setIsDragging(true);
          }
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        className={`relative rounded-[1.5rem] border-2 border-dashed p-12 text-center transition ${
          isDragging
            ? 'border-sky-500 bg-sky-50'
            : 'border-slate-300 bg-white/80 hover:border-sky-400 hover:bg-white'
        } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        <input
          type="file"
          accept="application/pdf"
          multiple
          onChange={(event) => {
            if (event.target.files) {
              void handleFiles(event.target.files);
              event.target.value = '';
            }
          }}
          disabled={disabled || processingStatus === 'loading'}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />

        {processingStatus === 'loading' ? (
          <div className="space-y-4">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
            <div>
              <p className="text-sm font-medium text-slate-700">文書セットを準備中...</p>
              <p className="mt-1 text-xs text-slate-500">処理キューに追加しています</p>
            </div>
          </div>
        ) : processingStatus === 'success' ? (
          <div className="space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-700">文書を追加しました</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.6}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">
                {isDragging ? 'ここにドロップしてください' : 'PDF を複数まとめて追加'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                住民向け・職員向けなどの属性に合わせて UI を再生成します
              </p>
            </div>
            <p className="text-xs text-slate-400">複数 PDF 対応。PDF 以外は無視されます。</p>
            {errorMessage && <p className="text-xs text-amber-600">{errorMessage}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
