import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  CellStyleModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ColumnApiModule,
  EventApiModule,
  LocaleModule,
  ModuleRegistry,
  NumberFilterModule,
  PaginationModule,
  QuickFilterModule,
  RenderApiModule,
  RowApiModule,
  TextFilterModule,
  TooltipModule,
  ValidationModule,
  themeQuartz,
  type ColDef,
  type CsvExportParams,
  type GridApi,
  type GetRowIdParams,
} from 'ag-grid-community';

// Only the modules we use (keeps the bundle small).
ModuleRegistry.registerModules([
  CellStyleModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ColumnApiModule,
  EventApiModule,
  LocaleModule,
  NumberFilterModule,
  PaginationModule,
  QuickFilterModule,
  RenderApiModule,
  RowApiModule,
  TextFilterModule,
  TooltipModule,
  ...(import.meta.env.DEV ? [ValidationModule] : []),
]);

/** AG Grid theme tuned to the Countersign palette (warm neutrals, orange accent, mono data). */
const countersignTheme = themeQuartz.withParams({
  accentColor: '#ea580c',
  backgroundColor: '#ffffff',
  foregroundColor: '#1c1917',
  textColor: '#292524',
  headerBackgroundColor: '#faf7f2',
  headerTextColor: '#78716c',
  headerFontSize: 11,
  headerFontWeight: 600,
  borderColor: '#ebe5dc',
  rowBorder: { color: '#f1ece4' },
  rowHoverColor: '#fff7ed',
  selectedRowBackgroundColor: '#ffedd5',
  oddRowBackgroundColor: '#ffffff',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 12.5,
  wrapperBorderRadius: 16,
  wrapperBorder: { color: '#e7e0d6' },
  spacing: 8,
  rowHeight: 46,
  headerHeight: 40,
  menuBackgroundColor: '#ffffff',
  inputFocusBorder: { color: '#ea580c' },
});

export interface DataGridHandle {
  getApi: () => GridApi | null;
  exportCsv: (params?: CsvExportParams) => void;
  /** Rows currently shown, after the grid's own filtering and sorting. */
  getDisplayedRows: () => unknown[];
}

interface DataGridProps<T> {
  rowData: T[];
  columnDefs: ColDef<T>[];
  /** Free-text filter applied across all searchable columns. */
  quickFilterText?: string;
  onRowClicked?: (row: T) => void;
  getRowId?: (row: T) => string;
  /** Fixed grid height in px. Pagination keeps long lists usable. */
  height?: number;
  pageSize?: number;
  emptyText?: string;
  ariaLabel?: string;
}

function DataGridInner<T>(
  {
    rowData,
    columnDefs,
    quickFilterText,
    onRowClicked,
    getRowId,
    height = 560,
    pageSize,
    emptyText = 'Nothing to show.',
    ariaLabel,
  }: DataGridProps<T>,
  ref: React.ForwardedRef<DataGridHandle>
) {
  const apiRef = useRef<GridApi | null>(null);

  useImperativeHandle(ref, () => ({
    getApi: () => apiRef.current,
    exportCsv: (params) => apiRef.current?.exportDataAsCsv(params),
    getDisplayedRows: () => {
      const rows: unknown[] = [];
      apiRef.current?.forEachNodeAfterFilterAndSort((node) => {
        if (node.data) rows.push(node.data);
      });
      return rows;
    },
  }));

  const defaultColDef = useMemo<ColDef>(
    () => ({ sortable: true, filter: true, resizable: true, suppressMovable: true }),
    []
  );
  const localeText = useMemo(() => ({ noRowsToShow: emptyText }), [emptyText]);

  return (
    <div style={{ height }} aria-label={ariaLabel}>
      <AgGridReact<T>
        theme={countersignTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        quickFilterText={quickFilterText}
        localeText={localeText}
        getRowId={getRowId ? (p: GetRowIdParams<T>) => getRowId(p.data) : undefined}
        onGridReady={(e) => {
          apiRef.current = e.api;
        }}
        onRowClicked={(e) => {
          if (e.data && onRowClicked) onRowClicked(e.data);
        }}
        pagination={pageSize !== undefined}
        paginationPageSize={pageSize}
        paginationPageSizeSelector={false}
        tooltipShowDelay={400}
        suppressCellFocus={false}
        animateRows
      />
    </div>
  );
}

export const DataGrid = forwardRef(DataGridInner) as <T>(
  props: DataGridProps<T> & { ref?: React.Ref<DataGridHandle> }
) => React.ReactElement;
