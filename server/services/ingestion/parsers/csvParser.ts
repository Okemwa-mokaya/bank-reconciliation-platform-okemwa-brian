import { parse } from 'csv-parse/sync';
import { ExtractionResult, IngestionSourceType, ColumnMappingConfig } from '../types';
import { detectColumnMapping } from '../columnMappingService';

/**
 * Detects CSV delimiter by inspecting first few lines.
 */
function detectDelimiter(content: string): string {
  const sample = content.slice(0, 4000);
  const delimiters = [',', ';', '\t', '|'];
  let bestDelimiter = ',';
  let maxCount = 0;

  for (const delim of delimiters) {
    const lines = sample.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;
    const counts = lines.slice(0, 5).map((l) => l.split(delim).length - 1);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (avg > maxCount && counts.every((c) => c > 0)) {
      maxCount = avg;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}

/**
 * Parses CSV buffer into structured rows and detects headers and mapping.
 */
export async function parseCsvBuffer(
  fileBuffer: Buffer,
  sourceType: IngestionSourceType,
  userMapping?: ColumnMappingConfig
): Promise<ExtractionResult> {
  // Strip UTF-8 BOM if present
  let text = fileBuffer.toString('utf-8');
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.substring(1);
  }

  const delimiter = detectDelimiter(text);

  let rawRecords: string[][];
  try {
    rawRecords = parse(text, {
      delimiter,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
  } catch (err: any) {
    throw new Error(`CSV parsing error: ${err.message || 'Malformed CSV content'}`);
  }

  if (!rawRecords || rawRecords.length < 2) {
    throw new Error('CSV file must contain a header row and at least one data row');
  }

  // Find header row: usually row 0, but sometimes preceded by title rows
  let headerIndex = 0;
  for (let i = 0; i < Math.min(5, rawRecords.length); i++) {
    const row = rawRecords[i];
    const hasDateOrDesc = row.some((col) => /date|desc|amount|debit|credit|particulars/i.test(col));
    if (hasDateOrDesc) {
      headerIndex = i;
      break;
    }
  }

  const rawHeaders = rawRecords[headerIndex];
  // Ensure headers are unique and non-empty
  const headers: string[] = [];
  const headerSet = new Set<string>();

  for (let j = 0; j < rawHeaders.length; j++) {
    let h = (rawHeaders[j] || '').trim();
    if (!h) {
      h = `Column_${j + 1}`;
    }
    let uniqueH = h;
    let counter = 1;
    while (headerSet.has(uniqueH)) {
      uniqueH = `${h}_${counter++}`;
    }
    headerSet.add(uniqueH);
    headers.push(uniqueH);
  }

  const rows: Record<string, unknown>[] = [];
  for (let i = headerIndex + 1; i < rawRecords.length; i++) {
    const row = rawRecords[i];
    // Skip empty lines
    if (!row || row.every((c) => !c || c.trim() === '')) continue;

    const rowObj: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      rowObj[headers[j]] = row[j] !== undefined ? row[j].trim() : '';
    }
    rows.push(rowObj);
  }

  const { mapping, confidence, warnings } = detectColumnMapping(headers, sourceType, userMapping);

  return {
    headers,
    rows,
    detectedMapping: mapping,
    mappingConfidence: confidence,
    extractionMethod: 'CSV_PARSER',
    extractionConfidence: 0.99,
    pageCount: 1,
    warnings,
  };
}
