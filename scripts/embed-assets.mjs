// Embute o build do site (dist/) dentro do Worker, como módulo gerado.
// Evita a etapa separada de upload de assets da Cloudflare.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const DIST = 'dist';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const TEXT = new Set(['.html', '.js', '.css', '.svg', '.json', '.txt']);

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const entries = walk(DIST).map((f) => {
  const ext = extname(f);
  const buf = readFileSync(f);
  return { path: '/' + relative(DIST, f).split('\\').join('/'), type: TYPES[ext] || 'application/octet-stream', text: TEXT.has(ext), body: TEXT.has(ext) ? buf.toString('utf8') : buf.toString('base64') };
});
const out = `// GERADO por scripts/embed-assets.mjs. Não editar.
export interface EmbeddedAsset { type: string; text: boolean; body: string }
export const ASSETS: Record<string, EmbeddedAsset> = {
${entries.map((e) => `  ${JSON.stringify(e.path)}: { type: ${JSON.stringify(e.type)}, text: ${e.text}, body: ${JSON.stringify(e.body)} },`).join('\n')}
};
`;
writeFileSync('worker/assets.gen.ts', out);
console.log('assets embutidos:', entries.map((e) => `${e.path} (${(e.body.length / 1024).toFixed(0)} KB)`).join(', '));
