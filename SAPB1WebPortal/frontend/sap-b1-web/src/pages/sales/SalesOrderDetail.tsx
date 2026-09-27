import SalesDocumentDetail from '../../components/sales/SalesDocumentDetail';
import { getSalesOrderByEntry } from '../../api/sales';

export default function SalesOrderDetail() {
  return (
    <SalesDocumentDetail
      documentLabel="Sales Order"
      backLabel="Back to Sales Orders"
      backRoute="/sales/orders"
      fetchFn={getSalesOrderByEntry}
      title={(d) => d.customerName || d.customerCode}
      subtitle={(d) => d.customerCode}
      extraFields={(d) => [
        { label: 'Delivery Date', value: d.dueDate ? new Date(d.dueDate).toLocaleDateString() : '—' },
        { label: 'Sales Employee', value: d.salesEmployee }
      ]}
    />
  );
}
