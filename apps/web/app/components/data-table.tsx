'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { EmptyState } from './ui';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  searchValue?: (row: T) => string;
  filterValue?: (row: T) => string;
}

export interface DataTableFilter {
  label: string;
  value: string;
}

export function DataTable<T>({
  rows,
  columns,
  searchPlaceholder,
  filterLabel,
  filters,
  emptyTitle,
  emptyDescription,
  pageSize = 8,
}: Readonly<{
  rows: T[];
  columns: Array<DataTableColumn<T>>;
  searchPlaceholder: string;
  filterLabel: string;
  filters: DataTableFilter[];
  emptyTitle: string;
  emptyDescription?: string;
  pageSize?: number;
}>) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesFilter =
        filter === 'all' ||
        columns.some((column) => column.filterValue?.(row).toLowerCase() === filter.toLowerCase());
      const searchable = columns
        .map((column) => column.searchValue?.(row) ?? '')
        .join(' ')
        .toLowerCase();
      const matchesQuery = normalizedQuery.length === 0 || searchable.includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [columns, filter, query, rows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const updateQuery = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const updateFilter = (value: string) => {
    setFilter(value);
    setPage(1);
  };

  return (
    <div className="data-table">
      <div className="data-table__toolbar">
        <input
          aria-label={searchPlaceholder}
          placeholder={searchPlaceholder}
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
        />
        <label>
          <span>{filterLabel}</span>
          <select value={filter} onChange={(event) => updateFilter(event.target.value)}>
            {filters.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {pageRows.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          {...(emptyDescription === undefined ? {} : { description: emptyDescription })}
        />
      ) : (
        <div className="data-table__scroll">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column) => (
                    <td key={column.key}>{column.render(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="data-table__pagination">
        <span>
          {filteredRows.length} · {currentPage}/{totalPages}
        </span>
        <div>
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)}>
            ‹
          </button>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
