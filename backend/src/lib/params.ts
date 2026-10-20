export function idOf(req: { params: unknown }, name = 'id'): string {
  const params = req.params as Record<string, string | string[] | undefined>;
  const value = params[name];
  return Array.isArray(value) ? value[0] : (value ?? '');
}
