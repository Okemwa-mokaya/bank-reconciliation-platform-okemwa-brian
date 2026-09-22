import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { IngestionFileFormat } from './types';

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export interface ValidatedFileMetadata {
  sanitizedFilename: string;
  originalFilename: string;
  fileFormat: IngestionFileFormat;
  mimeType: string;
  fileSize: number;
  fileHash: string; // SHA-256 fingerprint
  storagePath: string;
}

/**
 * Validates file buffer, size, format, magic bytes, and generates secure storage path.
 */
export async function validateAndPreserveSourceFile(
  fileBuffer: Buffer,
  originalName: string,
  clientMimeType: string | undefined,
  organizationId: string,
  subDirectory: 'statements' | 'gl'
): Promise<ValidatedFileMetadata> {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('Uploaded file is empty or corrupted');
  }

  if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of 20 MB`);
  }

  // Sanitize filename to prevent path traversal or special character injection
  const baseName = path.basename(originalName);
  const sanitizedFilename = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = path.extname(sanitizedFilename).toLowerCase();

  let fileFormat: IngestionFileFormat;
  let detectedMimeType = clientMimeType || 'application/octet-stream';

  if (ext === '.csv') {
    fileFormat = 'CSV';
    detectedMimeType = 'text/csv';
    // Validate that it's readable text without binary execution headers
    const headerSlice = fileBuffer.slice(0, 4);
    if (headerSlice.toString('ascii').startsWith('MZ')) {
      throw new Error('Invalid CSV file: Executable binary signatures detected');
    }
  } else if (ext === '.xlsx') {
    fileFormat = 'XLSX';
    detectedMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    // Check Zip magic bytes (PK\x03\x04)
    if (fileBuffer.length < 4 || fileBuffer[0] !== 0x50 || fileBuffer[1] !== 0x4B) {
      throw new Error('Invalid Excel file: File does not match valid OpenXML spreadsheet structure');
    }
  } else if (ext === '.xls') {
    fileFormat = 'XLS';
    detectedMimeType = 'application/vnd.ms-excel';
    // Check OLE compound document magic bytes (0xD0CF11E0)
    if (fileBuffer.length < 8 || fileBuffer[0] !== 0xD0 || fileBuffer[1] !== 0xCF) {
      throw new Error('Invalid XLS file: File does not match legacy Excel compound document structure');
    }
  } else if (ext === '.pdf') {
    fileFormat = 'PDF';
    detectedMimeType = 'application/pdf';
    // Check %PDF magic bytes
    const pdfMagic = fileBuffer.slice(0, 5).toString('ascii');
    if (!pdfMagic.startsWith('%PDF-')) {
      throw new Error('Invalid PDF file: Missing standard %PDF- file header signature');
    }
  } else {
    throw new Error(`Unsupported file type '${ext}'. Supported formats: CSV (.csv), Excel (.xlsx, .xls), and PDF (.pdf)`);
  }

  // Calculate cryptographic SHA-256 fingerprint of the source document
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Secure storage path isolation per organization
  const storageDir = path.join(process.cwd(), 'secure-storage', organizationId, subDirectory);
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const storedFilename = `${Date.now()}_${fileHash.substring(0, 12)}_${sanitizedFilename}`;
  const absoluteStoragePath = path.join(storageDir, storedFilename);

  // Write original raw source file to disk
  fs.writeFileSync(absoluteStoragePath, fileBuffer);

  // Internal storage identifier relative to workspace for audit trails
  const storagePath = `secure-storage/${organizationId}/${subDirectory}/${storedFilename}`;

  return {
    sanitizedFilename,
    originalFilename: baseName,
    fileFormat,
    mimeType: detectedMimeType,
    fileSize: fileBuffer.length,
    fileHash,
    storagePath,
  };
}
