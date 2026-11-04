import { HttpError } from '../../utils/httpError.js';

export async function convertToPdf(filePath) {
  // Phase 1 supports native PDFs. Future phase integrates LibreOffice soffice headless conversion.
  if (!filePath.toLowerCase().endsWith('.pdf')) {
    throw new HttpError(415, 'UNSUPPORTED_TYPE', 'Direct conversion of non-PDF files is scheduled for a later phase.');
  }
  return filePath;
}

