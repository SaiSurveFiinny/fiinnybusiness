import { useRef, useState } from 'react';
import { Icons } from '../Icons';
import { uploadFile } from '../../lib/storage';

interface ResumeUploadFieldProps {
  value: string;
  fileName: string;
  onChange: (url: string, fileName: string) => void;
  error?: string;
}

/**
 * Resume (PDF) upload for the public apply flow — reuses the same
 * lib/storage.ts uploadFile() helper as the admin's ImageUploadField
 * (components/admin/ImageUploadField.tsx), just with PDF-specific UX
 * (filename display, no image preview) instead of duplicating the upload
 * logic. Uploads to career/resumes/, which storage.rules restricts to
 * admin-only reads — applicants can upload without signing in, but the
 * resulting file is not publicly readable.
 */
export function ResumeUploadField({ value, fileName, onChange, error }: ResumeUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setUploadError('Please upload a PDF file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File is too large. Maximum size is 5MB.');
      return;
    }
    setUploadError('');
    setUploading(true);
    try {
      const url = await uploadFile(file, 'career/resumes');
      onChange(url, file.name);
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <label className="block font-sans text-sm font-semibold text-primary mb-2">Resume (PDF) *</label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left text-sm font-sans transition-colors disabled:opacity-60 ${
          value ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white hover:border-primary/30'
        }`}
      >
        {uploading ? (
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin shrink-0" />
        ) : value ? (
          <Icons.CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        ) : (
          <Icons.FileText className="w-4 h-4 text-slate-400 shrink-0" />
        )}
        <span className={value ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
          {uploading ? 'Uploading...' : value ? fileName : 'Click to upload your resume (PDF, max 5MB)'}
        </span>
      </button>
      <input ref={inputRef} type="file" accept="application/pdf" onChange={(e) => void handleFileChange(e)} className="hidden" />
      {(uploadError || error) && <p className="text-xs font-sans text-red-600 mt-1.5">{uploadError || error}</p>}
    </div>
  );
}
