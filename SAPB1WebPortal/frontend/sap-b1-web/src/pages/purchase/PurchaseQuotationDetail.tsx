import PurchaseDocumentDetail from '../../components/purchase/PurchaseDocumentDetail';
import { getPurchaseQuotationByEntry } from '../../api/purchase';

export default function PurchaseQuotationDetail() {
  return (
    <PurchaseDocumentDetail
      printType="purchase-quotation"
      documentLabel="Purchase Quotation"
      backLabel="Back to Purchase Quotations"
      backRoute="/purchase/quotations"
      fetchFn={getPurchaseQuotationByEntry}
      title={(d) => d.vendorName || d.vendorCode}
      subtitle={(d) => d.vendorCode}
      extraFields={(d) => [
        { label: 'Due Date', value: d.dueDate ? new Date(d.dueDate).toLocaleDateString() : '—' },
        { label: 'Buyer', value: d.buyer }
      ]}
    />
  );
}
