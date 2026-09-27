export interface ColumnDef<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'right';
  /** Extra classes for th/td — typically responsive visibility, e.g. "hidden lg:table-cell". */
  className?: string;
}

interface ResponsiveTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  keyField: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  /** Card rendering used below the md breakpoint, replacing the table entirely. */
  renderMobileCard: (row: T) => React.ReactNode;
}

export default function ResponsiveTable<T>({ columns, rows, keyField, onRowClick, renderMobileCard }: ResponsiveTableProps<T>) {
  return (
    <>
      {/* Desktop / tablet: real table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-secondary text-ink-secondary text-left sticky top-0">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 font-medium ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.className ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, index) => (
              <tr
                key={keyField(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`transition-colors ${onRowClick ? 'cursor-pointer hover:bg-surface-tertiary' : ''}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : ''} ${col.className ?? ''}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <div className="md:hidden divide-y divide-border">
        {rows.map((row, index) => (
          <div
            key={keyField(row, index)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={onRowClick ? 'cursor-pointer active:bg-surface-tertiary' : ''}
          >
            {renderMobileCard(row)}
          </div>
        ))}
      </div>
    </>
  );
}
