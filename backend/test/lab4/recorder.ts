import fs from 'node:fs';
import path from 'node:path';

/**
 * Records each Lab 4 test case's input, expected output and actual output so the
 * test report can quote what the system really returned. Rows are written to
 * test/lab4/results/<suite>.json when the suite finishes.
 */
export interface CaseRow {
  id: string;
  technique: string;
  input: string;
  expected: string;
  actual: string;
}

export function createRecorder(suite: string) {
  const rows: CaseRow[] = [];
  return {
    record(row: CaseRow): void {
      rows.push(row);
    },
    flush(): void {
      const dir = path.resolve(__dirname, 'results');
      fs.mkdirSync(dir, { recursive: true });
      rows.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
      fs.writeFileSync(path.join(dir, `${suite}.json`), JSON.stringify(rows, null, 2));
    },
  };
}
