import type { ReportSummary } from '../types';

type ReportListProps = {
  error: string | null;
  hasUnsavedChanges: boolean;
  items: ReportSummary[];
  loading: boolean;
  onAdd: () => void;
  onRetry: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (report: ReportSummary) => void;
  searchValue: string;
  selectedId: string | null;
};

const formatDate = (value: string) => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsedDate);
};

export function ReportList({
  error,
  hasUnsavedChanges,
  items,
  loading,
  onAdd,
  onRetry,
  onSearchChange,
  onSelect,
  searchValue,
  selectedId,
}: ReportListProps) {
  return (
    <aside className="report-list">
      <div className="report-list__masthead">
        <div>
          <p className="eyebrow">Afterburn reports</p>
          <h1>Report workspace</h1>
          <p className="subtitle">
            Search, review, and update reports across every team.
          </p>
        </div>

        <button className="primary-button" onClick={onAdd} type="button">
          Add report
        </button>
      </div>

      <div className="report-list__controls">
        <label className="field-label sr-only" htmlFor="report-search">
          Search reports
        </label>
        <input
          className="text-input"
          id="report-search"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by author, team, or department"
          type="search"
          value={searchValue}
        />
        <p aria-live="polite" className="results-count">
          {loading ? 'Loading reports…' : `${items.length} report${items.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {error ? (
        <div className="state-card state-card--error" role="alert">
          <h2>Unable to load reports</h2>
          <p>{error}</p>
          <button className="secondary-button" onClick={onRetry} type="button">
            Try again
          </button>
        </div>
      ) : null}

      {!error && items.length === 0 && !loading ? (
        <div className="state-card">
          <h2>No matching reports</h2>
          <p>
            Try a broader search or create a fresh report for a team that has not
            submitted yet.
          </p>
          <button className="secondary-button" onClick={onAdd} type="button">
            Create report
          </button>
        </div>
      ) : null}

      <div aria-busy={loading} className="report-list__items">
        {items.map((item) => {
          const isSelected = item.id === selectedId;

          return (
            <button
              className={`report-card${isSelected ? ' is-selected' : ''}`}
              key={item.id}
              onClick={() => onSelect(item)}
              type="button"
            >
              <div className="report-card__header">
                <div>
                  <h2>{item.team}</h2>
                  <p>{item.department}</p>
                </div>

                {isSelected && hasUnsavedChanges ? (
                  <span className="status-pill status-pill--warning">Unsaved</span>
                ) : null}
              </div>

              <dl className="report-card__meta">
                <div>
                  <dt>Author</dt>
                  <dd>{item.authorName}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDate(item.lastModified)}</dd>
                </div>
              </dl>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
