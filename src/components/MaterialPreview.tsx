import { Download, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Version } from '../lib/data';
import { fmtDay, fmtMB } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useIsMobile } from '../lib/useIsMobile';
import { extOf, FileIcon } from './ui';

/**
 * Card do material que o aluno enviou, com visualização.
 * PDF abre embutido no computador e em nova aba no celular (o leitor embutido do iPhone mostra só a 1ª página).
 * Word não tem visualização no navegador: vira download. Link abre em nova aba. Texto colado aparece por extenso.
 */
export function MaterialPreview({ v, title, defaultOpen = false }: { v: Version; title: string; defaultOpen?: boolean }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(defaultOpen);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const isPdf = v.source_kind === 'file' && /\.pdf$/i.test(v.file_path || v.file_name || '');
  const ext = v.source_kind === 'file' ? extOf(v.file_name) : v.source_kind === 'link' ? 'LINK' : 'TXT';

  // URL assinada sob demanda (vale 1h). A política do storage só deixa o aluno ler a própria pasta.
  useEffect(() => {
    if (v.source_kind !== 'file' || !v.file_path) return;
    let alive = true;
    supabase.storage
      .from('submissions')
      .createSignedUrl(v.file_path, 3600, isPdf ? undefined : { download: v.file_name || true })
      .then(({ data, error }) => alive && (error ? setErr(true) : setUrl(data.signedUrl)));
    return () => {
      alive = false;
    };
  }, [v.source_kind, v.file_path, v.file_name, isPdf]);

  const link = v.link_url ? (/^https?:\/\//i.test(v.link_url) ? v.link_url : 'https://' + v.link_url) : null;
  const meta = [
    `Versão ${v.version}`,
    `enviada ${fmtDay(v.created_at)}`,
    v.file_size ? fmtMB(v.file_size) : null,
  ].filter(Boolean).join(' · ');

  let action: React.ReactNode = null;
  if (v.source_kind === 'file' && isPdf && !mobile) {
    action = (
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(!open)} disabled={!url}>
        {open ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
        {open ? 'Fechar' : 'Ver documento'}
      </button>
    );
  } else if (v.source_kind === 'file') {
    action = (
      <a className="btn btn-secondary btn-sm" href={url || undefined} target="_blank" rel="noreferrer" aria-disabled={!url}>
        {isPdf ? <ExternalLink size={15} aria-hidden /> : <Download size={15} aria-hidden />}
        {isPdf ? 'Abrir' : 'Baixar'}
      </a>
    );
  } else if (v.source_kind === 'link' && link) {
    action = (
      <a className="btn btn-secondary btn-sm" href={link} target="_blank" rel="noreferrer">
        <ExternalLink size={15} aria-hidden />
        Abrir link
      </a>
    );
  } else if (v.source_kind === 'text') {
    action = (
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(!open)}>
        {open ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
        {open ? 'Fechar' : 'Ver texto'}
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="row" style={{ padding: '14px 16px', gap: 14 }}>
        <FileIcon ext={ext} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label" style={{ marginBottom: 2 }}>Material enviado</div>
          <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {v.source_kind === 'file' ? v.file_name || title : v.source_kind === 'link' ? v.link_url : title}
          </div>
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>{meta}</div>
        </div>
        {action}
      </div>
      {err && <div style={{ padding: '0 16px 14px', fontSize: 13, color: 'var(--err-t)' }}>Não foi possível abrir o arquivo agora. Tente de novo em instantes.</div>}
      {open && isPdf && url && (
        <div style={{ borderTop: '1px solid var(--line)', background: 'var(--alt2)', padding: 12 }}>
          <iframe title={`Material enviado: ${v.file_name || title}`} src={url} style={{ width: '100%', height: 'calc(72vh / var(--z))', border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }} />
        </div>
      )}
      {open && v.source_kind === 'text' && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '16px 18px', maxHeight: 420, overflowY: 'auto', fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--t2)' }}>
          {v.pasted_text}
        </div>
      )}
      {v.note?.trim() && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '12px 16px', fontSize: 14, lineHeight: 1.45, color: 'var(--t2)' }}>
          <span className="label" style={{ marginRight: 8 }}>Sua observação</span>
          {v.note}
        </div>
      )}
    </div>
  );
}
