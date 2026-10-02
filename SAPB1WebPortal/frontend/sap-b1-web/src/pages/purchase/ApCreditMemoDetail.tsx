import PurchaseDocumentDetail from '../../components/purchase/PurchaseDocumentDetail';
import { getApCreditMemoByEntry } from '../../api/purchase';

export default function ApCreditMemoDetail() {
  return (
    <PurchaseDocumentDetail
      printType="ap-credit-memo"
      documentLabel="A/P Credit Memo"
      backLabel="Back to A/P Credit Memos"
      backRoute="/purchase/credit-memos"
      fetchFn={getApCreditMemoByEntry}
      title={(d) => d.vendorName || d.vendorCode}
      subtitle={(d) => d.vendorCode}
      extraFields={() => []}
    />
  );
}
