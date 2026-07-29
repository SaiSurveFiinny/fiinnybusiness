import { useRef, useState } from 'react';
import { Icons } from '../Icons';
import { uploadFile } from '../../lib/storage';

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  folder: string;
  accept?: string;
  previewClassName?: string;
}

/**
 * Shared upload field for every admin media input in the Crop Solutions
 * module (hero images, gallery, guide PDFs/thumbnails, video thumbnails).
 * Uploads to Firebase Storage via lib/storage.ts and stores the resulting
 * download URL — the field's value is always a plain URL string, same shape
 * as every existing image field in Admin.tsx (Products/Blogs), so nothing
 * downstream needs to know whether a URL came from a paste or an upload.
 */
export function ImageUploadField({ label, value, onChange, folder, accept = 'image/*', previewClassName }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const url = await uploadFile(file, folder);
      onChange(url);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const isImage = accept.startsWith('image');

  return (
    <div>
      <label className="block font-sans text-sm font-semibold text-primary mb-2">{label}</label>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Paste a URL or upload a file"
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-3 rounded-xl border border-primary/20 text-primary font-sans font-semibold text-sm hover:bg-primary/5 transition-colors disabled:opacity-60 flex items-center gap-2 shrink-0"
          >
            {uploading ? (
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            ) : (
              <Icons.Download className="w-4 h-4 rotate-180" />
            )}
            Upload
          </button>
          <input ref={inputRef} type="file" accept={accept} onChange={(e) => void handleFileChange(e)} className="hidden" />
        </div>
        {error && <p className="text-xs font-sans text-red-600">{error}</p>}
        {isImage && value && (
          <img src={value} alt="" className={previewClassName ?? 'w-24 h-24 object-cover rounded-lg border border-slate-200'} />
        )}
        {!isImage && value && (
          <a href={value} target="_blank" rel="noreferrer" className="text-xs text-primary font-sans font-semibold hover:underline w-fit">
            View uploaded file
          </a>
        )}
      </div>
    </div>
  );
}
