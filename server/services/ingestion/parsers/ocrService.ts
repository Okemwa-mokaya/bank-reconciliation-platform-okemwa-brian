import { GoogleGenAI } from '@google/genai';
import { ExtractionResult, IngestionSourceType, ColumnMappingConfig } from '../types';

let aiClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

/**
 * Executes OCR extraction using Gemini multimodal model for scanned or image-based PDFs.
 */
export async function performPdfOcrExtraction(
  fileBuffer: Buffer,
  sourceType: IngestionSourceType,
  userMapping?: ColumnMappingConfig
): Promise<ExtractionResult> {
  const ai = getGenAI();

  if (!ai) {
    return {
      headers: ['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'],
      rows: [],
      detectedMapping: {
        transactionDate: 'Date',
        description: 'Description',
        referenceNumber: 'Reference',
        debit: 'Debit',
        credit: 'Credit',
        balance: 'Balance',
      },
      mappingConfidence: 0.5,
      extractionMethod: 'PDF_OCR',
      extractionConfidence: 0.4,
      pageCount: 1,
      warnings: [
        'Document appears to be a scanned or image-based PDF. GEMINI_API_KEY is not configured for automatic AI optical character recognition (OCR). Manual review or CSV/XLSX export recommended.',
      ],
    };
  }

  const base64Data = fileBuffer.toString('base64');
  const prompt = `You are a high-precision financial data ingestion parser for a bank reconciliation system.
Extract all transaction records from this financial document.
Output strict JSON matching this exact structure:
{
  "headers": ["Date", "Description", "Reference", "Debit", "Credit", "Amount", "Balance"],
  "rows": [
    {
      "Date": "YYYY-MM-DD",
      "Description": "Exact narration or description",
      "Reference": "Reference or cheque number if available",
      "Debit": "Withdrawal/debit amount or empty",
      "Credit": "Deposit/credit amount or empty",
      "Amount": "Signed amount (+ for credit, - for debit)",
      "Balance": "Running balance if available"
    }
  ],
  "confidence": 0.95,
  "warnings": []
}
Important:
- Never fabricate transactions or numbers.
- Filter out bank contact headers, opening/closing balance summary headers, disclaimers, or page footers.
- Retain all individual transaction rows accurately.
- Return ONLY the JSON object without markdown formatting.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Data,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
    });

    const responseText = response.text || '';
    const cleanJson = responseText.replace(/```json\s*|\s*```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    const headers = Array.isArray(parsed.headers) ? parsed.headers : ['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Amount', 'Balance'];
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.92;
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];

    const detectedMapping: ColumnMappingConfig = {
      transactionDate: 'Date',
      description: 'Description',
      referenceNumber: 'Reference',
      debit: 'Debit',
      credit: 'Credit',
      amount: 'Amount',
      balance: 'Balance',
      ...userMapping,
    };

    return {
      headers,
      rows,
      detectedMapping,
      mappingConfidence: 0.95,
      extractionMethod: 'PDF_OCR',
      extractionConfidence: confidence,
      pageCount: 1,
      warnings,
    };
  } catch (error: any) {
    return {
      headers: ['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'],
      rows: [],
      detectedMapping: {
        transactionDate: 'Date',
        description: 'Description',
        debit: 'Debit',
        credit: 'Credit',
        balance: 'Balance',
      },
      mappingConfidence: 0.5,
      extractionMethod: 'PDF_OCR',
      extractionConfidence: 0.3,
      pageCount: 1,
      warnings: [`AI OCR extraction encountered an error: ${error.message || 'Processing timeout'}`],
    };
  }
}
