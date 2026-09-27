import SalesDocumentDetail from '../../components/sales/SalesDocumentDetail';
import { getSalesQuotationByEntry } from '../../api/sales';

export default function SalesQuotationDetail() {
  return (
    <SalesDocumentDetail
      documentLabel="Sales Quotation"
      backLabel="Back to Sales Quotations"
      backRoute="/sales/quotations"
      fetchFn={getSalesQuotationByEntry}
      title={(d) => d.customerName || d.customerCode}
      subtitle={(d) => d.customerCode}
      extraFields={(d) => [
        { label: 'Valid Until', value: d.dueDate ? new Date(d.dueDate).toLocaleDateString() : '—' },
        { label: 'Sales Employee', value: d.salesEmployee }
      ]}
    />
  );
}
