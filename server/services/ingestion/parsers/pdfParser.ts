import * as pdfParseModule from 'pdf-parse';
const pdfParse: any = (pdfParseModule as any).default || pdfParseModule;
import { ExtractionResult, IngestionSourceType, ColumnMappingConfig, PageExtractionInfo } from '../types';
import { performPdfOcrExtraction } from './ocrService';

/**
 * Extracts transactions from a PDF buffer. Uses text parsing for native PDFs,
 * or routes to OCR for scanned/image PDFs.
 */
export async function parsePdfBuffer(
  fileBuffer: Buffer,
  sourceType: IngestionSourceType,
  userMapping?: ColumnMappingConfig
): Promise<ExtractionResult> {
  let pdfData: {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
  };

  try {
    pdfData = await pdfParse(fileBuffer);
  } catch (err: any) {
    throw new Error(`Failed to parse PDF document structure: ${err.message || 'Corrupted PDF'}`);
  }

  const numPages = pdfData.numpages || 1;
  const rawText = pdfData.text || '';
  const trimmedText = rawText.trim();

  // If text density is suspiciously low (< 50 characters per page), it's likely a scanned image PDF
  const avgCharsPerPage = trimmedText.length / Math.max(1, numPages);
  if (avgCharsPerPage < 50 || !/\d{2,4}[-/. ]\d{1,2}[-/. ]\d{2,4}/.test(trimmedText)) {
    // Route to OCR Service
    return await performPdfOcrExtraction(fileBuffer, sourceType, userMapping);
  }

  // Text-based PDF extraction
  const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const rows: Record<string, unknown>[] = [];
  const warnings: string[] = [];

  // Common date regex patterns:
  // 1. 2026-01-15 or 15/01/2026 or 01/15/2026
  // 2. 15 Jan 2026 or 15-Jan-2026
  const dateRegex = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/i;
  // Amount pattern: captures currency and numbers like 1,234.56 or (500.00) or 500.00 CR/DR
  const amountRegex = /([-(]?\$?\s*\d{1,3}(?:,\d{3})*\.\d{2}[)-]?(?:\s*(?:CR|DR))?)/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Filter out obvious header/footer recurring lines
    if (
      /page\s+\d+\s+of\s+\d+/i.test(line) ||
      /^statement\s+of\s+account/i.test(line) ||
      /^opening\s+balance/i.test(line) ||
      /^closing\s+balance/i.test(line) ||
      /^account\s+number/i.test(line) ||
      /^date\s+description/i.test(line)
    ) {
      continue;
    }

    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      const dateStr = dateMatch[0];
      const remainder = line.substring(dateStr.length).trim();

      // Find amounts in remainder
      const amounts = remainder.match(amountRegex);
      if (amounts && amounts.length > 0) {
        // Strip amounts from remainder to get description
        let desc = remainder;
        for (const amt of amounts) {
          desc = desc.replace(amt, '');
        }
        desc = desc.trim().replace(/\s+/g, ' ');

        // If line had 1 amount: Amount
        // If line had 2 amounts: Debit / Credit or Amount / Balance
        // If line had 3 amounts: Debit, Credit, Balance
        let debit = '';
        let credit = '';
        let balance = '';

        if (amounts.length === 1) {
          const a = amounts[0];
          if (a.includes('-') || a.includes('(') || /DR/i.test(a)) {
            debit = a;
          } else {
            credit = a;
          }
        } else if (amounts.length === 2) {
          // If second looks like balance
          debit = amounts[0].includes('-') || /DR/i.test(amounts[0]) ? amounts[0] : '';
          credit = !debit ? amounts[0] : '';
          balance = amounts[1];
        } else if (amounts.length >= 3) {
          debit = amounts[0];
          credit = amounts[1];
          balance = amounts[2];
        }

        rows.push({
          Date: dateStr,
          Description: desc || 'Bank Transaction',
          Debit: debit,
          Credit: credit,
          Balance: balance,
        });
      }
    }
  }

  // If table extraction yielded very few rows (< 2), but text was present, invoke OCR fallback
  if (rows.length < 2) {
    warnings.push('Heuristic line parser extracted minimal rows from text. Attempting OCR fallback.');
    return await performPdfOcrExtraction(fileBuffer, sourceType, userMapping);
  }

  const headers = ['Date', 'Description', 'Debit', 'Credit', 'Balance'];
  const detectedMapping: ColumnMappingConfig = {
    transactionDate: 'Date',
    description: 'Description',
    debit: 'Debit',
    credit: 'Credit',
    balance: 'Balance',
    ...userMapping,
  };

  const pagesInfo: PageExtractionInfo[] = [];
  for (let p = 1; p <= numPages; p++) {
    pagesInfo.push({
      pageNumber: p,
      textLength: Math.round(trimmedText.length / numPages),
      ocrUsed: false,
      confidence: 0.94,
    });
  }

  return {
    headers,
    rows,
    detectedMapping,
    mappingConfidence: 0.92,
    extractionMethod: 'PDF_TEXT',
    extractionConfidence: 0.94,
    pageCount: numPages,
    pagesInfo,
    warnings,
  };
}
