import React, { useMemo, useRef, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { DataGrid, DataGridHandle } from '../components/DataGrid.tsx';
import { PaymentIntent } from '../domain/types.ts';
import { formatUSD } from '../domain/money.ts';
import { Download, Search, Filter } from 'lucide-react';
import { downloadCsv, toCsv } from '../lib/csv.ts';

interface PaymentsViewProps {
  intents: PaymentIntent[];
  onSelectIntent: (intent: PaymentIntent) => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({ intents, onSelectIntent }) => {
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'SUCCEEDED' | 'DENIED'>('ALL');
  const [search, setSearch] = useState('');

  const gridRef = useRef<DataGridHandle>(null);

  // The tabs narrow the data set; the grid's quick filter handles free-text search.
  const filtered = useMemo(
    () =>
      intents.filter((i) => {
        if (filter === 'PENDING' && i.status !== 'PENDING_APPROVAL') return false;
        if (filter === 'SUCCEEDED' && i.status !== 'SUCCEEDED') return false;
        if (filter === 'DENIED' && i.status !== 'DENIED') return false;
        return true;
      }),
    [intents, filter]
  );

  const columnDefs = useMemo<ColDef<PaymentIntent>[]>(
    () => [
      {
        headerName: 'Time',
        field: 'createdAt',
        flex: 1,
        minWidth: 130,
        sort: 'desc',
        filter: false,
        cellRenderer: (p: { value: string }) => (
          <span className="font-mono text-[11px] text-slate-500">
            {new Date(p.value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        ),
      },
      {
        headerName: 'Intent ID',
        field: 'id',
        flex: 1.3,
        minWidth: 170,
        cellRenderer: (p: { value: string }) => <span className="font-mono text-[11px] font-medium text-slate-700">{p.value}</span>,
      },
      { headerName: 'Agent', field: 'agentName', flex: 1, minWidth: 120 },
      {
        headerName: 'Recipient',
        valueGetter: (p) => (p.data ? `${p.data.recipientSnapshot.displayName} ${p.data.recipientSnapshot.email} ${p.data.invoiceReference}` : ''),
        flex: 1.8,
        minWidth: 230,
        cellRenderer: (p: { data?: PaymentIntent }) =>
          p.data ? (
            <div className="flex h-full flex-col justify-center leading-tight">
              <span className="font-medium text-slate-900">{p.data.recipientSnapshot.displayName}</span>
              <span className="font-mono text-[10px] text-slate-400">{p.data.recipientSnapshot.email}</span>
            </div>
          ) : null,
      },
      {
        headerName: 'Amount (USD)',
        valueGetter: (p) => (p.data ? p.data.amountMinor / 100 : 0),
        type: 'rightAligned',
        filter: 'agNumberColumnFilter',
        flex: 0.9,
        minWidth: 120,
        cellRenderer: (p: { data?: PaymentIntent }) => (
          <span className="font-mono font-bold text-slate-900">{p.data ? formatUSD(p.data.amountMinor) : ''}</span>
        ),
      },
      {
        headerName: 'Decision',
        field: 'decision',
        flex: 1.2,
        minWidth: 150,
        cellRenderer: (p: { value: string }) =>
          p.value === 'AUTHORIZED' ? (
            <span className="font-medium text-emerald-700">Authorized</span>
          ) : p.value === 'PENDING_APPROVAL' ? (
            <span className="font-medium text-amber-700">Pending Countersign</span>
          ) : (
            <span className="font-medium text-rose-700">Denied</span>
          ),
      },
      {
        headerName: 'Status',
        field: 'status',
        flex: 1.2,
        minWidth: 165,
        cellRenderer: (p: { value: string }) => (
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">{p.value}</span>
        ),
      },
      {
        headerName: 'PayPal ref',
        valueGetter: (p) => p.data?.payout?.transactionId || '',
        flex: 1,
        minWidth: 115,
        filter: false,
        cellRenderer: (p: { value: string }) =>
          p.value ? (
            <span className="font-mono text-[11px] font-semibold text-blue-600">{p.value.substring(0, 10)}…</span>
          ) : (
            <span className="text-slate-300">—</span>
          ),
      },
    ],
    []
  );

  const exportCSV = () => {
    const headers = ['ID', 'Date', 'Agent', 'Recipient', 'Email', 'Amount_USD', 'Decision', 'Status', 'PayPal_Tx'];
    // Export exactly what the grid is showing (its filters and sort order applied).
    const shown = (gridRef.current?.getDisplayedRows() as PaymentIntent[] | undefined) ?? filtered;
    const rows = shown.map((intent) => [
      intent.id,
      intent.createdAt,
      intent.agentName,
      intent.recipientSnapshot.displayName,
      intent.recipientSnapshot.email,
      (intent.amountMinor / 100).toFixed(2),
      intent.decision,
      intent.status,
      intent.payout?.transactionId || '',
    ]);

    downloadCsv(`countersign_intents_${Date.now()}.csv`, toCsv(headers, rows));
  };

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Payment Intents</h2>
          <p className="text-xs text-slate-500">
            Every payment requested by an AI agent, its deterministic decision, and execution status
          </p>
        </div>

        <button
          onClick={exportCSV}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          {(['ALL', 'PENDING', 'SUCCEEDED', 'DENIED'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1 rounded-md font-medium transition ${
                filter === tab
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab === 'ALL' && 'All Intents'}
              {tab === 'PENDING' && 'Pending Countersign'}
              {tab === 'SUCCEEDED' && 'Settled via PayPal'}
              {tab === 'DENIED' && 'Denied by Policy'}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by agent, recipient, invoice..."
            className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md w-full sm:w-64 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Payment intents grid (AG Grid): sortable, filterable, paginated */}
      <div className="rounded-2xl shadow-xs">
        <DataGrid<PaymentIntent>
          ref={gridRef}
          ariaLabel="Payment intents"
          rowData={filtered}
          columnDefs={columnDefs}
          quickFilterText={search}
          getRowId={(row) => row.id}
          onRowClicked={onSelectIntent}
          pageSize={10}
          height={Math.min(640, Math.max(240, filtered.length * 46 + 140))}
          emptyText="No payment intents found matching filters."
        />
      </div>
    </div>
  );
};
