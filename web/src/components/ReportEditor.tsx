import { MarkdownField } from './MarkdownField';
import {
  markdownFieldKeys,
  markdownFieldLabels,
  type EditableReport,
  type MarkdownFieldKey,
} from '../types';

type IdentityField = 'authorName' | 'team' | 'department';

type ReportEditorProps = {
  canDelete: boolean;
  canSave: boolean;
  error: string | null;
  fieldErrors: Partial<Record<IdentityField, string>>;
  hasUnsavedChanges: boolean;
  isDeleting: boolean;
  isLoading: boolean;
  isNew: boolean;
  isSaving: boolean;
  onBack: () => void;
  onChangeIdentityField: (field: IdentityField, value: string) => void;
  onChangeMarkdownField: (field: MarkdownFieldKey, value: string) => void;
  onChangeEmpty: (value: boolean) => void;
  onDelete: () => void;
  onRetry: () => void;
  onSave: () => void;
  report: EditableReport | null;
};

const formatDate = (value?: string) => {
  if (!value) {
    return 'Not saved yet';
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsedDate);
};

const identityFields: Array<{
  field: IdentityField;
  label: string;
  placeholder: string;
}> = [
  {
    field: 'authorName',
    label: 'Author name',
    placeholder: 'Who prepared this report?',
  },
  {
    field: 'team',
    label: 'Team',
    placeholder: 'Which team does this report cover?',
  },
  {
    field: 'department',
    label: 'Department',
    placeholder: 'Which department owns the team?',
  },
];

export function ReportEditor({
  canDelete,
  canSave,
  error,
  fieldErrors,
  hasUnsavedChanges,
  isDeleting,
  isLoading,
  isNew,
  isSaving,
  onBack,
  onChangeIdentityField,
  onChangeMarkdownField,
  onChangeEmpty,
  onDelete,
  onRetry,
  onSave,
  report,
}: ReportEditorProps) {
  if (isLoading) {
    return (
      <section className="editor-panel">
        <div className="state-card">
          <h2>Loading report</h2>
          <p>Pulling the latest content from the API�</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="editor-panel">
        <div className="state-card state-card--error" role="alert">
          <h2>Unable to open report</h2>
          <p>{error}</p>
          <button className="secondary-button" onClick={onRetry} type="button">
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (!report) {
    return (
      <section className="editor-panel">
        <div className="state-card state-card--empty">
          <h2>Select a report</h2>
          <p>
            Pick a report from the list to edit it, or create a new one for a team
            that has not submitted yet.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="editor-panel">
      <form
        className="editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className="editor-panel__header">
          <button className="back-button" onClick={onBack} type="button">
            ? Reports
          </button>

          <div className="editor-panel__title-group">
            <p className="eyebrow">{isNew ? 'New draft' : 'Editing report'}</p>
            <h2>{report.team.trim() || 'Untitled report'}</h2>
            <div className="status-row">
              <span className="status-pill">
                {hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
              </span>
              <span className="status-pill status-pill--neutral">
                Last updated {formatDate(report.lastModified)}
              </span>
            </div>
          </div>

          <div className="editor-panel__actions">
            {canDelete ? (
              <button
                className="danger-button"
                disabled={isDeleting || isSaving}
                onClick={onDelete}
                type="button"
              >
                {isDeleting ? 'Deleting�' : 'Delete'}
              </button>
            ) : null}

            <button
              className="primary-button"
              disabled={!canSave || isSaving || isDeleting}
              type="submit"
            >
              {isSaving ? 'Saving�' : 'Save report'}
            </button>
          </div>
        </div>

        <div className="identity-grid">
          {identityFields.map(({ field, label, placeholder }) => (
            <div className="field-group" key={field}>
              <label className="field-label" htmlFor={field}>
                {label}
              </label>
              <input
                aria-invalid={fieldErrors[field] ? 'true' : 'false'}
                className="text-input"
                id={field}
                onChange={(event) => onChangeIdentityField(field, event.target.value)}
                placeholder={placeholder}
                required
                type="text"
                value={report[field]}
              />
              {fieldErrors[field] ? (
                <p className="field-error" role="alert">
                  {fieldErrors[field]}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="markdown-sections">
          {markdownFieldKeys.map((field) => (
            <MarkdownField
              id={`report-${field}`}
              key={field}
              label={markdownFieldLabels[field]}
              onChange={(value) => onChangeMarkdownField(field, value)}
              value={report[field]}
            />
          ))}
        </div>

        {markdownFieldKeys.every((field) => report[field].trim() === '') ? (
          <label className="empty-report-toggle">
            <input
              checked={report.empty}
              onChange={(event) => onChangeEmpty(event.target.checked)}
              type="checkbox"
            />
            Mark this report as empty
          </label>
        ) : null}
      </form>
    </section>
  );
}
