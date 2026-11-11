import React, { useMemo, useRef, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { DataGrid, DataGridHandle } from '../components/DataGrid.tsx';
import { apiFetch } from '../lib/api.ts';
import { downloadCsv, toCsv } from '../lib/csv.ts';
import { LedgerEvent } from '../domain/types.ts';
import { ShieldCheck, Download, RefreshCw, CheckCircle, AlertTriangle, Code, Search, Filter } from 'lucide-react';

interface LedgerViewProps {
  events: LedgerEvent[];
  onRefresh: () => void;
}

/** Colour cue for the event family, so the audit trail reads at a glance. */
function eventDot(type: string): string {
  if (type.startsWith('PAYOUT') || type.startsWith('RESERVATION_SETTLED')) return 'bg-emerald-500';
  if (type.startsWith('APPROVAL')) return 'bg-amber-500';
  if (type.startsWith('POLICY')) return 'bg-violet-500';
  if (type.startsWith('INTENT') || type.startsWith('BUDGET') || type.startsWith('RESERVATION')) return 'bg-blue-500';
  if (type.startsWith('WEBHOOK')) return 'bg-pink-500';
  return 'bg-slate-400';
}

export const LedgerView: React.FC<LedgerViewProps> = ({ events, onRefresh }) => {
  const [selectedEvent, setSelectedEvent] = useState<LedgerEvent | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    totalEvents: number;
    reason?: string;
  } | null>(null);

  const [eventTypeFilter, setEventTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const gridRef = useRef<DataGridHandle>(null);

  // The event-type dropdown narrows the data set; the grid's own quick filter handles free-text search.
  const filteredEvents = useMemo(
    () => events.filter((e) => eventTypeFilter === 'ALL' || e.eventType === eventTypeFilter),
    [events, eventTypeFilter]
  );

  const columnDefs = useMemo<ColDef<LedgerEvent>[]>(
    () => [
      {
        headerName: 'Block',
        field: 'id',
        width: 112,
        pinned: 'left',
        sort: 'desc',
        filter: 'agNumberColumnFilter',
        cellRenderer: (p: { value: number }) => <span className="font-mono font-bold text-slate-900">#{p.value}</span>,
      },
      {
        headerName: 'Event type',
        field: 'eventType',
        flex: 1.6,
        minWidth: 220,
        cellRenderer: (p: { value: string }) => (
          <span className="inline-flex items-center gap-2 font-mono font-semibold text-slate-800">
            <span className={`h-2 w-2 rounded-full ${eventDot(p.value)}`} />
            {p.value}
          </span>
        ),
      },
      {
        headerName: 'Actor',
        valueGetter: (p) => (p.data ? `${p.data.actorType} · ${p.data.actorId}` : ''),
        flex: 1.2,
        minWidth: 170,
        cellRenderer: (p: { value: string }) => (
          <span className="inline-block max-w-full truncate rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">
            {p.value}
          </span>
        ),
      },
      {
        headerName: 'Payment',
        field: 'paymentIntentId',
        flex: 1.3,
        minWidth: 165,
        cellRenderer: (p: { value: string | null }) =>
          p.value ? <span className="font-mono text-[11px] text-slate-600">{p.value}</span> : <span className="text-slate-300">—</span>,
      },
      {
        headerName: 'Previous hash',
        field: 'prevHash',
        flex: 1,
        minWidth: 120,
        filter: false,
        tooltip: true,
        cellRenderer: (p: { value: string }) => <span className="font-mono text-[11px] text-slate-400">{p.value.substring(0, 10)}…</span>,
      },
      {
        headerName: 'Block hash',
        field: 'hash',
        flex: 1,
        minWidth: 120,
        filter: false,
        tooltip: true,
        cellRenderer: (p: { value: string }) => <span className="font-mono text-[11px] font-semibold text-emerald-700">{p.value.substring(0, 10)}…</span>,
      },
      {
        headerName: 'Time',
        field: 'createdAt',
        flex: 0.9,
        minWidth: 110,
        filter: false,
        cellRenderer: (p: { value: string }) => (
          <span className="font-mono text-[11px] text-slate-500">{new Date(p.value).toLocaleTimeString()}</span>
        ),
      },
      {
        headerName: '',
        colId: 'inspect',
        width: 92,
        sortable: false,
        filter: false,
        cellRenderer: () => <span className="font-mono text-xs font-semibold text-blue-600">Inspect</span>,
      },
    ],
    []
  );

  const handleVerifyChain = async () => {
    setIsVerifying(true);
    try {
      const res = await apiFetch('/api/v1/ledger/verify');
      const data = await res.json();
      setVerifyResult(data);
    } catch {
      setVerifyResult({ valid: false, totalEvents: 0, reason: 'Failed to reach verification endpoint' });
    } finally {
      setIsVerifying(false);
    }
  };

  const exportCSV = () => {
    const headers = ['ID', 'Timestamp', 'EventType', 'ActorType', 'ActorID', 'PrevHash', 'Hash'];
    // Export exactly what the grid is showing (its filters and sort order applied).
    const shown = (gridRef.current?.getDisplayedRows() as LedgerEvent[] | undefined) ?? events;
    const rows = shown.map((event) => [
      event.id,
      event.createdAt,
      event.eventType,
      event.actorType,
      event.actorId,
      event.prevHash,
      event.hash,
    ]);

    downloadCsv(`countersign_ledger_${Date.now()}.csv`, toCsv(headers, rows));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>Tamper-Evident Append-Only Ledger</span>
            <span className="text-xs px-2 py-0.5 rounded font-mono font-normal bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              HMAC-SHA256 Chain
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            Immutable cryptographic audit trail linking agent submissions, policy checks, approvals, and PayPal payouts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleVerifyChain}
            disabled={isVerifying}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{isVerifying ? 'Verifying...' : 'Verify Cryptographic Chain'}</span>
          </button>

          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Verification Result Banner */}
      {verifyResult && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            verifyResult.valid
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                verifyResult.valid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              {verifyResult.valid ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <div className="text-xs font-bold">
                {verifyResult.valid
                  ? `Chain Integrity Verified (${verifyResult.totalEvents} Blocks)`
                  : 'Ledger Integrity Failure Detected'}
              </div>
              <div className="text-[11px] font-mono mt-0.5 opacity-90">
                {verifyResult.valid
                  ? 'All cryptographic links match. Prev hashes and HMAC signatures verified from genesis.'
                  : verifyResult.reason}
              </div>
            </div>
          </div>
          <button
            onClick={() => setVerifyResult(null)}
            className="text-xs font-medium underline opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="text-xs border border-slate-300 rounded px-2.5 py-1 bg-white font-mono"
          >
            <option value="ALL">All Event Types</option>
            <option value="INTENT_RECEIVED">INTENT_RECEIVED</option>
            <option value="POLICY_EVALUATED">POLICY_EVALUATED</option>
            <option value="BUDGET_RESERVED">BUDGET_RESERVED</option>
            <option value="APPROVAL_REQUESTED">APPROVAL_REQUESTED</option>
            <option value="APPROVAL_GRANTED">APPROVAL_GRANTED</option>
            <option value="APPROVAL_REJECTED">APPROVAL_REJECTED</option>
            <option value="PAYOUT_SUBMITTED">PAYOUT_SUBMITTED</option>
            <option value="PAYOUT_SUCCEEDED">PAYOUT_SUCCEEDED</option>
            <option value="PAYOUT_FAILED">PAYOUT_FAILED</option>
            <option value="RESERVATION_SETTLED">RESERVATION_SETTLED</option>
            <option value="RESERVATION_RELEASED">RESERVATION_RELEASED</option>
            <option value="POLICY_VERSION_ACTIVATED">POLICY_VERSION_ACTIVATED</option>
            <option value="AGENT_REGISTERED">AGENT_REGISTERED</option>
            <option value="GENESIS">GENESIS</option>
          </select>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by block #, event, actor, or hash..."
            className="pl-8 pr-3 py-1 text-xs border border-slate-300 rounded-md w-full sm:w-72 focus:ring-1 focus:ring-blue-500 font-mono"
          />
        </div>
      </div>

      {/* Ledger grid (AG Grid): sortable, filterable, paginated, pinned block column */}
      <div className="rounded-2xl shadow-xs">
        <DataGrid<LedgerEvent>
          ref={gridRef}
          ariaLabel="Ledger events"
          rowData={filteredEvents}
          columnDefs={columnDefs}
          quickFilterText={searchQuery}
          getRowId={(row) => String(row.id)}
          onRowClicked={setSelectedEvent}
          pageSize={12}
          height={Math.min(660, Math.max(240, filteredEvents.length * 46 + 140))}
          emptyText="No ledger events match the selected filter."
        />
      </div>

      {/* Event Payload Inspector Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-xs font-mono text-slate-400">LEDGER BLOCK #{selectedEvent.id}</span>
                <h3 className="text-base font-bold text-slate-900 font-mono">{selectedEvent.eventType}</h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Close
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                <div className="text-[10px] text-slate-400 uppercase">Previous Hash</div>
                <div className="text-slate-700 break-all">{selectedEvent.prevHash}</div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                <div className="text-[10px] text-slate-400 uppercase">Block Hash (HMAC-SHA256)</div>
                <div className="text-emerald-700 font-bold break-all">{selectedEvent.hash}</div>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Code className="w-3.5 h-3.5" />
                <span>Canonical Payload Content</span>
              </div>
              <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto max-h-60">
                {JSON.stringify(selectedEvent.payload, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
