import PurchaseDocumentDetail from '../../components/purchase/PurchaseDocumentDetail';
import { getGrpoByEntry } from '../../api/purchase';

export default function GrpoDetail() {
  return (
    <PurchaseDocumentDetail
      documentLabel="Goods Receipt PO"
      backLabel="Back to Goods Receipt PO"
      backRoute="/purchase/grpo"
      fetchFn={getGrpoByEntry}
      title={(d) => d.vendorName || d.vendorCode}
      subtitle={(d) => d.vendorCode}
      extraFields={(d) => [{ label: 'Due Date', value: d.dueDate ? new Date(d.dueDate).toLocaleDateString() : '—' }]}
    />
  );
}
