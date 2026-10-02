import SalesDocumentDetail from '../../components/sales/SalesDocumentDetail';
import { getDeliveryByEntry } from '../../api/sales';

export default function DeliveryDetail() {
  return (
    <SalesDocumentDetail
      printType="delivery"
      documentLabel="Delivery"
      backLabel="Back to Deliveries"
      backRoute="/sales/deliveries"
      fetchFn={getDeliveryByEntry}
      title={(d) => d.customerName || d.customerCode}
      subtitle={(d) => d.customerCode}
      extraFields={(d) => [
        { label: 'Delivery Date', value: d.dueDate ? new Date(d.dueDate).toLocaleDateString() : '—' },
        { label: 'Sales Employee', value: d.salesEmployee }
      ]}
    />
  );
}
