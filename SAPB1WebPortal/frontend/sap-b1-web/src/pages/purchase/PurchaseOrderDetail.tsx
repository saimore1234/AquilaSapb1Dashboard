import PurchaseDocumentDetail from '../../components/purchase/PurchaseDocumentDetail';
import { getPurchaseOrderByEntry } from '../../api/purchase';

export default function PurchaseOrderDetail() {
  return (
    <PurchaseDocumentDetail
      printType="purchase-order"
      documentLabel="Purchase Order"
      backLabel="Back to Purchase Orders"
      backRoute="/purchase/orders"
      fetchFn={getPurchaseOrderByEntry}
      title={(d) => d.vendorName || d.vendorCode}
      subtitle={(d) => d.vendorCode}
      extraFields={(d) => [
        { label: 'Due Date', value: d.dueDate ? new Date(d.dueDate).toLocaleDateString() : '—' },
        { label: 'Buyer', value: d.buyer }
      ]}
    />
  );
}
