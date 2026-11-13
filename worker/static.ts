import { ASSETS } from './assets.gen';

/** Serve o site embutido. Rotas desconhecidas caem no index.html (SPA). */
export function serveStatic(req: Request): Response {
  const url = new URL(req.url);
  const hit = ASSETS[url.pathname];
  const asset = hit ?? ASSETS['/index.html']!;
  const body = asset.text ? asset.body : Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0));
  const immutable = !!hit && url.pathname.startsWith('/assets/');
  return new Response(req.method === 'HEAD' ? null : body, {
    headers: {
      'Content-Type': asset.type,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
