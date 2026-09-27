import SalesDocumentDetail from '../../components/sales/SalesDocumentDetail';
import { getArCreditMemoByEntry } from '../../api/sales';

export default function ArCreditMemoDetail() {
  return (
    <SalesDocumentDetail
      documentLabel="A/R Credit Memo"
      backLabel="Back to A/R Credit Memos"
      backRoute="/sales/credit-memos"
      fetchFn={getArCreditMemoByEntry}
      title={(d) => d.customerName || d.customerCode}
      subtitle={(d) => d.customerCode}
      extraFields={() => []}
    />
  );
}
