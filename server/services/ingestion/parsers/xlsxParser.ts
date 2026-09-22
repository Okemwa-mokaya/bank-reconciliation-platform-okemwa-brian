import * as XLSX from 'xlsx';
import { ExtractionResult, IngestionSourceType, ColumnMappingConfig } from '../types';
import { detectColumnMapping } from '../columnMappingService';

/**
 * Parses XLSX / XLS buffer into structured rows and detects headers.
 */
export async function parseXlsxBuffer(
  fileBuffer: Buffer,
  sourceType: IngestionSourceType,
  userMapping?: ColumnMappingConfig,
  sheetNameOrIndex?: string | number
): Promise<ExtractionResult> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
  } catch (err: any) {
    throw new Error(`Excel parsing error: ${err.message || 'Corrupted workbook'}`);
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Excel workbook contains no visible worksheets');
  }

  // Choose sheet: by name, index, or default to first non-empty
  let selectedSheetName = workbook.SheetNames[0];
  if (typeof sheetNameOrIndex === 'string' && workbook.SheetNames.includes(sheetNameOrIndex)) {
    selectedSheetName = sheetNameOrIndex;
  } else if (typeof sheetNameOrIndex === 'number' && workbook.SheetNames[sheetNameOrIndex]) {
    selectedSheetName = workbook.SheetNames[sheetNameOrIndex];
  }

  const worksheet = workbook.Sheets[selectedSheetName];
  if (!worksheet) {
    throw new Error(`Selected worksheet '${selectedSheetName}' could not be accessed`);
  }

  // Convert worksheet to array of arrays (raw string/date/number values)
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
  });

  if (!rawData || rawData.length < 2) {
    throw new Error(`Worksheet '${selectedSheetName}' contains insufficient data (less than 2 rows)`);
  }

  // Find header row: look through the first 10 rows
  let headerIndex = 0;
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i];
    if (Array.isArray(row)) {
      const match = row.some((c) => /date|desc|narration|amount|debit|credit|balance|particulars/i.test(String(c)));
      if (match) {
        headerIndex = i;
        break;
      }
    }
  }

  const headerRow = rawData[headerIndex] as unknown[];
  const headers: string[] = [];
  const headerSet = new Set<string>();

  for (let j = 0; j < headerRow.length; j++) {
    let h = String(headerRow[j] || '').trim();
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
  for (let i = headerIndex + 1; i < rawData.length; i++) {
    const row = rawData[i] as unknown[];
    if (!row || !Array.isArray(row) || row.every((c) => String(c || '').trim() === '')) {
      continue;
    }

    const rowObj: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      rowObj[headers[j]] = row[j] !== undefined ? String(row[j]).trim() : '';
    }
    rows.push(rowObj);
  }

  const { mapping, confidence, warnings } = detectColumnMapping(headers, sourceType, userMapping);

  return {
    headers,
    rows,
    detectedMapping: mapping,
    mappingConfidence: confidence,
    extractionMethod: 'XLSX_PARSER',
    extractionConfidence: 0.98,
    pageCount: 1,
    warnings,
  };
}
