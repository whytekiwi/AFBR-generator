import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createReport,
  deleteReport,
  fetchReport,
  fetchReports,
  updateReport,
} from './api';
import { ReportEditor } from './components/ReportEditor';
import { ReportList } from './components/ReportList';
import {
  createEditableFromReport,
  createEmptyReport,
  editableSignature,
  type EditableReport,
  type MarkdownFieldKey,
  type ReportSummary,
  toUpsertPayload,
} from './types';

type NoticeState = {
  message: string;
  tone: 'error' | 'success';
} | null;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.';

const useIsDesktop = (breakpoint = 960) => {
  const getMatch = () =>
    window.matchMedia(`(min-width: ${breakpoint}px)`).matches;

  const [isDesktop, setIsDesktop] = useState<boolean>(getMatch);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const listener = (event: MediaQueryListEvent) => setIsDesktop(event.matches);

    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener('change', listener);

    return () => mediaQuery.removeEventListener('change', listener);
  }, [breakpoint]);

  return isDesktop;
};

const findLikelyCreatedReport = (
  summaries: ReportSummary[],
  draft: EditableReport,
): ReportSummary | null => {
  const draftAuthor = draft.authorName.trim().toLowerCase();
  const draftTeam = draft.team.trim().toLowerCase();
  const draftDepartment = draft.department.trim().toLowerCase();

  return (
    summaries.find(
      (summary) =>
        summary.authorName.trim().toLowerCase() === draftAuthor &&
        summary.team.trim().toLowerCase() === draftTeam &&
        summary.department.trim().toLowerCase() === draftDepartment,
    ) ?? summaries[0] ?? null
  );
};

export default function App() {
  const isDesktop = useIsDesktop();

  const [searchValue, setSearchValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [summaries, setSummaries] = useState<ReportSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<EditableReport | null>(null);
  const [savedDraft, setSavedDraft] = useState<EditableReport | null>(null);
  const [mobilePane, setMobilePane] = useState<'editor' | 'list'>('list');
  const [notice, setNotice] = useState<NoticeState>(null);
  const [isListLoading, setIsListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchQuery(searchValue);
    }, 250);

    return () => window.clearTimeout(handle);
  }, [searchValue]);

  const loadReports = useCallback(
    async (options?: { signal?: AbortSignal; silent?: boolean }) => {
      const { signal, silent = false } = options ?? {};

      if (!silent) {
        setIsListLoading(true);
      }

      setListError(null);

      try {
        const items = await fetchReports(searchQuery, signal);
        setSummaries(items);
        setIsListLoading(false);
        return items;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return null;
        }

        setListError(getErrorMessage(error));
        setIsListLoading(false);
        return null;
      }
    },
    [searchQuery],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadReports({ signal: controller.signal });

    return () => controller.abort();
  }, [loadReports, listRefreshKey]);

  useEffect(() => {
    if (isDesktop) {
      setMobilePane('editor');
    } else if (selectedId === null) {
      setMobilePane('list');
    }
  }, [isDesktop, selectedId]);

  useEffect(() => {
    if (isDesktop && selectedId === null && summaries.length > 0) {
      setSelectedId(summaries[0].id);
    }
  }, [isDesktop, selectedId, summaries]);

  const loadSelectedReport = useCallback(async (id: string, signal?: AbortSignal) => {
    setIsDetailLoading(true);
    setDetailError(null);

    try {
      const report = await fetchReport(id, signal);
      const editableReport = createEditableFromReport(report);
      setDraft(editableReport);
      setSavedDraft(editableReport);
      setIsDetailLoading(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setDraft(null);
      setSavedDraft(null);
      setDetailError(getErrorMessage(error));
      setIsDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      setSavedDraft(null);
      setDetailError(null);
      setIsDetailLoading(false);
      return;
    }

    if (selectedId === 'new') {
      const emptyReport = createEmptyReport();
      setDraft(emptyReport);
      setSavedDraft(emptyReport);
      setDetailError(null);
      setIsDetailLoading(false);
      return;
    }

    const controller = new AbortController();
    void loadSelectedReport(selectedId, controller.signal);

    return () => controller.abort();
  }, [loadSelectedReport, selectedId]);

  const hasUnsavedChanges = useMemo(
    () => editableSignature(draft) !== editableSignature(savedDraft),
    [draft, savedDraft],
  );

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const confirmDiscardChanges = () =>
    !hasUnsavedChanges ||
    window.confirm('You have unsaved changes. Discard them and continue?');

  const openExistingReport = (summary: ReportSummary) => {
    if (summary.id === selectedId) {
      setMobilePane('editor');
      return;
    }

    if (!confirmDiscardChanges()) {
      return;
    }

    setNotice(null);
    setSelectedId(summary.id);
    setMobilePane('editor');
  };

  const openNewReport = () => {
    if (!confirmDiscardChanges()) {
      return;
    }

    setNotice(null);
    setSelectedId('new');
    setMobilePane('editor');
  };

  const handleBackToList = () => {
    if (isDesktop) {
      return;
    }

    if (!confirmDiscardChanges()) {
      return;
    }

    if (selectedId === 'new') {
      setSelectedId(null);
      setDraft(null);
      setSavedDraft(null);
    } else if (hasUnsavedChanges) {
      setDraft(savedDraft ? { ...savedDraft } : null);
    }

    setMobilePane('list');
  };

  const handleIdentityChange = (
    field: 'authorName' | 'department' | 'team',
    value: string,
  ) => {
    setDraft((currentDraft) =>
      currentDraft ? { ...currentDraft, [field]: value } : currentDraft,
    );
  };

  const handleMarkdownChange = (field: MarkdownFieldKey, value: string) => {
    setDraft((currentDraft) =>
      currentDraft ? { ...currentDraft, [field]: value } : currentDraft,
    );
  };

  const fieldErrors = useMemo(() => {
    if (!draft) {
      return {};
    }

    return {
      ...(draft.authorName.trim() ? {} : { authorName: 'Author name is required.' }),
      ...(draft.team.trim() ? {} : { team: 'Team is required.' }),
      ...(draft.department.trim()
        ? {}
        : { department: 'Department is required.' }),
    };
  }, [draft]);

  const canSave =
    Boolean(draft) &&
    Object.keys(fieldErrors).length === 0 &&
    hasUnsavedChanges &&
    !isSaving &&
    !isDeleting;

  const refreshList = () => {
    setListRefreshKey((currentValue) => currentValue + 1);
  };

  const handleSave = async () => {
    if (!draft || !canSave) {
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const payload = toUpsertPayload(draft);

      if (selectedId === 'new' || !draft.id) {
        const createdReport = await createReport(payload);
        const items = await loadReports({ silent: true });
        const nextDraft = createdReport
          ? createEditableFromReport(createdReport)
          : { ...draft };
        const nextSummary =
          createdReport?.id
            ? { id: createdReport.id } as ReportSummary
            : items
              ? findLikelyCreatedReport(items, draft)
              : null;

        setDraft(nextDraft);
        setSavedDraft(nextDraft);
        setNotice({ tone: 'success', message: 'Report created successfully.' });

        if (nextSummary?.id) {
          setSelectedId(nextSummary.id);
        }
      } else {
        const reportId = selectedId;

        if (!reportId || reportId === 'new') {
          throw new Error('A saved report must have a valid identifier.');
        }

        await updateReport(reportId, payload);
        const refreshedReport = await fetchReport(reportId);
        const editableReport = createEditableFromReport(refreshedReport);

        setDraft(editableReport);
        setSavedDraft(editableReport);
        await loadReports({ silent: true });
        setNotice({ tone: 'success', message: 'Report saved successfully.' });
      }
    } catch (error) {
      setNotice({ tone: 'error', message: getErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || selectedId === 'new') {
      return;
    }

    const confirmed = window.confirm(
      'Delete this report permanently? This action cannot be undone.',
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setNotice(null);

    try {
      await deleteReport(selectedId);
      const items = await loadReports({ silent: true });

      setNotice({ tone: 'success', message: 'Report deleted successfully.' });

      if (isDesktop && items && items.length > 0) {
        setSelectedId(items[0].id);
      } else {
        setSelectedId(null);
        setDraft(null);
        setSavedDraft(null);
        setMobilePane('list');
      }
    } catch (error) {
      setNotice({ tone: 'error', message: getErrorMessage(error) });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="app-shell" data-mobile-pane={mobilePane}>
      {notice ? (
        <div
          aria-live="polite"
          className={`app-notice flash-banner flash-banner--${notice.tone}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.message}
        </div>
      ) : null}

      <main className="workspace-grid">
        <div className="app-list-pane">
          <ReportList
            error={listError}
            hasUnsavedChanges={hasUnsavedChanges}
            items={summaries}
            loading={isListLoading}
            onAdd={openNewReport}
            onRetry={refreshList}
            onSearchChange={setSearchValue}
            onSelect={openExistingReport}
            searchValue={searchValue}
            selectedId={selectedId && selectedId !== 'new' ? selectedId : null}
          />
        </div>

        <div className="app-editor-pane">
          <ReportEditor
            canDelete={Boolean(selectedId && selectedId !== 'new')}
            canSave={canSave}
            error={detailError}
            fieldErrors={fieldErrors}
            hasUnsavedChanges={hasUnsavedChanges}
            isDeleting={isDeleting}
            isLoading={isDetailLoading}
            isNew={selectedId === 'new'}
            isSaving={isSaving}
            onBack={handleBackToList}
            onChangeIdentityField={handleIdentityChange}
            onChangeMarkdownField={handleMarkdownChange}
            onDelete={handleDelete}
            onRetry={() => {
              if (selectedId && selectedId !== 'new') {
                void loadSelectedReport(selectedId);
              }
            }}
            onSave={handleSave}
            report={draft}
          />
        </div>
      </main>
    </div>
  );
}
