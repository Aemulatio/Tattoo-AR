export function developmentDiagnosticsEnabled(
  isDevelopment: boolean,
  search: string,
): boolean {
  return isDevelopment && new URLSearchParams(search).has('debug');
}
