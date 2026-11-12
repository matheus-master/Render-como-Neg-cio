import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

export interface UploadHandle {
  promise: Promise<string>;
  cancel: () => void;
}

/** Upload para o Storage com progresso e cancelamento (o supabase-js não expõe progresso). */
export function uploadWithProgress(bucket: string, path: string, file: File, onProgress: (pct: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = (async () => {
    const { data } = await supabase.auth.getSession();
    return new Promise<string>((resolve, reject) => {
      xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`);
      xhr.setRequestHeader('Authorization', `Bearer ${data.session?.access_token}`);
      xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => (xhr.status < 300 ? resolve(path) : reject(new Error('upload ' + xhr.status + ' ' + xhr.responseText)));
      xhr.onerror = () => reject(new Error('rede'));
      xhr.onabort = () => reject(new DOMException('cancelado', 'AbortError'));
      xhr.send(file);
    });
  })();
  return { promise, cancel: () => xhr.abort() };
}

export const safeName = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);
