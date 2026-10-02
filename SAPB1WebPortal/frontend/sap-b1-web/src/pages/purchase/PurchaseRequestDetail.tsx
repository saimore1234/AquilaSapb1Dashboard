import PurchaseDocumentDetail from '../../components/purchase/PurchaseDocumentDetail';
import { getPurchaseRequestByEntry } from '../../api/purchase';

export default function PurchaseRequestDetail() {
  return (
    <PurchaseDocumentDetail
      printType="purchase-request"
      documentLabel="Purchase Request"
      backLabel="Back to Purchase Requests"
      backRoute="/purchase/requests"
      fetchFn={getPurchaseRequestByEntry}
      title={(d) => d.requester || 'Purchase Request'}
      extraFields={(d) => [{ label: 'Required Date', value: d.requiredDate ? new Date(d.requiredDate).toLocaleDateString() : '—' }]}
    />
  );
}
