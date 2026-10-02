import { Wallet, CreditCard } from 'lucide-react';
import PurchaseDocumentDetail from '../../components/purchase/PurchaseDocumentDetail';
import { getApInvoiceByEntry } from '../../api/purchase';

export default function ApInvoiceDetail() {
  return (
    <PurchaseDocumentDetail
      printType="ap-invoice"
      documentLabel="A/P Invoice"
      backLabel="Back to A/P Invoices"
      backRoute="/purchase/invoices"
      fetchFn={getApInvoiceByEntry}
      title={(d) => d.vendorName || d.vendorCode}
      subtitle={(d) => d.vendorCode}
      extraFields={(d) => [{ label: 'Due Date', value: d.dueDate ? new Date(d.dueDate).toLocaleDateString() : '—' }]}
      extraStatCards={(d) => [
        { label: 'Paid', value: d.paid.toLocaleString(), icon: CreditCard, accent: 'green' },
        { label: 'Balance', value: d.balance.toLocaleString(), icon: Wallet, accent: d.balance > 0 ? 'red' : 'slate' }
      ]}
    />
  );
}
