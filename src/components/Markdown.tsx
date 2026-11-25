import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Markdown das respostas da IA (sem HTML cru). Usa o mesmo estilo do Harvey. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="hv-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
