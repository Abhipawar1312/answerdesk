'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import { uploadDocumentAction } from '@/actions/document';

interface DropzoneProps {
  workspaceSlug: string;
  maxFileSizeMB: number;
}

export function DocumentUploadDropzone({
  workspaceSlug,
  maxFileSizeMB,
}: DropzoneProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState('');
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const allowedExtensions = ['.pdf', '.txt', '.md'];
  const maxBytes = maxFileSizeMB * 1024 * 1024;

  const validateAndSetFile = (selectedFile: File) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const ext = selectedFile.name.slice(selectedFile.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      setErrorMessage(`Unsupported format "${ext}". Please upload a PDF, TXT, or MD document.`);
      return;
    }

    if (selectedFile.size > maxBytes) {
      setErrorMessage(`File is too large (${(selectedFile.size / (1024 * 1024)).toFixed(1)}MB). Limit is ${maxFileSizeMB}MB.`);
      return;
    }

    setFile(selectedFile);
    if (!title) {
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleClear = () => {
    setFile(null);
    setTitle('');
    setErrorMessage(null);
    setSuccessMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || isUploading) return;

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append('workspaceSlug', workspaceSlug);
      formData.append('file', file);
      if (title.trim()) {
        formData.append('title', title.trim());
      }

      const res = await uploadDocumentAction(formData);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to index document.');
      } else {
        setSuccessMessage(`"${file.name}" uploaded and indexed successfully!`);
        handleClear();
      }
    } catch {
      setErrorMessage('An unexpected network error occurred while uploading.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Dropzone Container */}
      {!file ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative group flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-primary bg-primary/5 scale-[0.99]'
              : 'border-border/80 bg-muted/10 hover:bg-muted/30 hover:border-border'
          }`}
          role="button"
          tabIndex={0}
          aria-label="Upload document dropzone"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
            onChange={handleFileInputChange}
            className="hidden"
          />

          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/80 bg-card group-hover:scale-105 group-hover:border-primary/40 group-hover:text-primary transition-all shadow-2xs mb-3 text-muted-foreground">
            <UploadCloud className="h-6 w-6" />
          </div>

          <p className="text-xs font-semibold text-foreground">
            Click to choose a file or drag and drop
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Supports <span className="font-mono text-[11px] text-foreground font-medium">.PDF</span>, <span className="font-mono text-[11px] text-foreground font-medium">.TXT</span>, or <span className="font-mono text-[11px] text-foreground font-medium">.MD</span> documents up to {maxFileSizeMB}MB
          </p>
          <p className="mt-2.5 text-[11px] text-muted-foreground/70 max-w-md bg-muted/40 px-3 py-1.5 rounded-lg border border-border/50">
            Tip: PDFs in Hindi or Marathi with non-standard font encodings may extract cleanly as UTF-8 .txt or .md files.
          </p>
        </div>
      ) : (
        <form onSubmit={handleUpload} className="rounded-xl border border-border/80 bg-muted/10 p-4.5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate max-w-sm">{file.name}</p>
                <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                  {(file.size / 1024).toFixed(1)} KB &bull; {file.name.slice(file.name.lastIndexOf('.')).toUpperCase()}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClear}
              disabled={isUploading}
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label="Remove selected file"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Document Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Employee Handbook & FAQ"
              disabled={isUploading}
              className="text-xs h-9 bg-background"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={isUploading}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isUploading}
              className="text-xs h-8 min-w-32 font-medium"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Indexing...
                </>
              ) : (
                'Upload & Index'
              )}
            </Button>
          </div>
        </form>
      )}

      {/* Success Notification */}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-500">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="font-medium text-foreground">{successMessage}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-500">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
