/** Arquivos .md entram no Worker como texto (regra "Text" no wrangler.jsonc). */
declare module '*.md' {
  const content: string;
  export default content;
}
