import { apiClient } from './client';

/** Document-type slugs the backend print endpoint accepts (see SapB1PrintService). */
export type PrintDocumentType =
  | 'purchase-request'
  | 'purchase-quotation'
  | 'purchase-order'
  | 'grpo'
  | 'ap-invoice'
  | 'ap-credit-memo'
  | 'sales-quotation'
  | 'sales-order'
  | 'delivery'
  | 'ar-invoice'
  | 'ar-credit-memo'
  | 'production-order'
  | 'incoming-payment'
  | 'outgoing-payment';

export type PrintErrorKind = 'no-layout' | 'render-failed' | 'forbidden' | 'not-found';

export class PrintError extends Error {
  constructor(public kind: PrintErrorKind, message: string) {
    super(message);
  }
}

const MESSAGES: Record<PrintErrorKind, string> = {
  'no-layout': 'No SAP Business One print layout is configured for this document.',
  'render-failed': 'Unable to render the configured SAP Business One print format.',
  forbidden: 'You do not have permission to print this document.',
  'not-found': 'The document was not found.'
};

/**
 * Fetches the PDF rendered by the company's EXISTING SAP B1 layout. The company
 * is never sent: the backend takes it from the JWT.
 */
export async function fetchPrintPdf(type: PrintDocumentType, docEntry: number, layout?: string): Promise<Blob> {
  try {
    const { data } = await apiClient.get<Blob>(`/print/${type}/${docEntry}`, { params: layout ? { layout } : undefined, responseType: 'blob' });
    return data;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 403) throw new PrintError('forbidden', MESSAGES.forbidden);
    if (status === 404) {
      // The body is a JSON blob; NO_LAYOUT distinguishes "no layout" from "document not found".
      let noLayout = false;
      try {
        const text = await (err.response.data as Blob).text();
        noLayout = JSON.parse(text)?.errors?.includes('NO_LAYOUT') ?? false;
      } catch {
        // Unparseable body — treat as not found.
      }
      throw new PrintError(noLayout ? 'no-layout' : 'not-found', noLayout ? MESSAGES['no-layout'] : MESSAGES['not-found']);
    }
    throw new PrintError('render-failed', MESSAGES['render-failed']);
  }
}

export interface PrintLayout {
  code: string;
  name: string;
  isDefault: boolean;
}

/** Every Crystal layout SAP B1 holds for this document type in the logged-in company (default first). */
export async function fetchPrintLayouts(type: PrintDocumentType, docEntry: number): Promise<PrintLayout[]> {
  const { data } = await apiClient.get<{ success: boolean; data: PrintLayout[] }>(`/print/${type}/${docEntry}/layouts`);
  return data.data ?? [];
}
