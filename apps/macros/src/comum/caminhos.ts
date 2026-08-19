import { join } from 'path';

/**
 * Pasta do cliente web (HTML, CSS e JS servidos pelo próprio servidor).
 *
 * Fica num módulo sem efeito colateral de propósito: importar isso do `main.ts`
 * dispararia o `bootstrap()` e subiria um servidor de verdade dentro do teste.
 * O caminho parte do cwd porque `__dirname` muda entre `dist/` e `src/`.
 */
export const PASTA_PUBLICA = join(process.cwd(), 'publico');
