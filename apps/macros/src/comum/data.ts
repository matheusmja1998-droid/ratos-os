/** Dia civil no fuso de São Paulo, em AAAA-MM-DD. */
export function hojeSP(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
