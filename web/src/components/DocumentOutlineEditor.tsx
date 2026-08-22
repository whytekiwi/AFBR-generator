import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchDocumentOutline, updateDocumentOutline, uploadMedia } from '../api';
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  createOutlineNodeId,
  getMediaAssetUrl,
  outlineSignature,
  type DepartmentChildItem,
  type DepartmentItem,
  type DocumentOutline,
  type ImageItem,
  type OutlineItem,
  type ReportSummary,
  type TableItem,
  type UploadedMedia,
} from '../types';
import { MarkdownField } from './MarkdownField';

type NoticeState = {
  message: string;
  tone: 'error' | 'success';
} | null;

type DocumentOutlineEditorProps = {
  onNotice: (notice: NoticeState) => void;
  onRetryReports: () => void;
  onUnsavedChange: (hasUnsavedChanges: boolean) => void;
  reportSummaries: ReportSummary[];
  reportsError: string | null;
  reportsLoading: boolean;
};

type FilePickerButtonProps = {
  buttonClassName?: string;
  disabled?: boolean;
  label: string;
  onSelect: (file: File) => void;
};

const acceptedImageTypes = '.png,.jpg,.jpeg,.gif,.webp,.svg';
const allowedExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.';

const formatReportLabel = (summary: ReportSummary) =>
  `${summary.team} · ${summary.department} · ${summary.authorName}`;

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number): T[] => {
  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);

  if (typeof movedItem === 'undefined') {
    return items;
  }

  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
};

const createImageItem = (media: UploadedMedia, seed: string): ImageItem => ({
  type: 'image',
  id: createOutlineNodeId(seed, 'image'),
  mediaId: media.id,
  fileName: media.fileName,
  contentType: media.contentType,
  altText: '',
  caption: '',
  fullWidth: false,
  fullPage: false,
});

const createTableItem = (): TableItem => ({
  type: 'table',
  id: createOutlineNodeId('table'),
  title: '',
  markdown: '| Column A | Column B |\n| --- | --- |\n|  |  |',
  pageBreakAfter: false,
});

const validateImageFile = (file: File): string | null => {
  const normalizedType = file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const isSupportedType =
    ALLOWED_IMAGE_CONTENT_TYPES.includes(
      normalizedType as (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number],
    ) || allowedExtensions.has(extension);

  if (!isSupportedType) {
    return 'Please upload a PNG, JPEG, GIF, WebP, or SVG image.';
  }

  return null;
};

const getOutlineItemTitle = (item: OutlineItem): string => {
  switch (item.type) {
    case 'section':
      return item.title.trim() || 'Untitled section';
    case 'contents':
      return 'Generated contents';
    case 'image':
      return item.fileName;
    case 'department':
      return item.name.trim() || 'Untitled department';
  }
};

const getOutlineItemLabel = (item: OutlineItem): string => {
  switch (item.type) {
    case 'section':
      return 'Section';
    case 'contents':
      return 'Contents';
    case 'image':
      return 'Image';
    case 'department':
      return 'Department';
  }
};

const getDepartmentChildKey = (item: DepartmentChildItem, index: number) =>
  item.type === 'report' ? `report-${item.reportId}-${index}` : item.id;

const getDepartmentChildLabel = (item: DepartmentChildItem): string => {
  switch (item.type) {
    case 'report':
      return 'Report';
    case 'table':
      return 'Table';
    case 'image':
      return 'Image';
  }
};

function FilePickerButton({
  buttonClassName = 'secondary-button',
  disabled = false,
  label,
  onSelect,
}: FilePickerButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <input
        accept={acceptedImageTypes}
        className="file-input"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (file) {
            onSelect(file);
          }

          event.target.value = '';
        }}
        ref={inputRef}
        type="file"
      />
      <button
        className={buttonClassName}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {label}
      </button>
    </>
  );
}

export function DocumentOutlineEditor({
  onNotice,
  onRetryReports,
  onUnsavedChange,
  reportSummaries,
  reportsError,
  reportsLoading,
}: DocumentOutlineEditorProps) {
  const [draftOutline, setDraftOutline] = useState<DocumentOutline | null>(null);
  const [savedOutline, setSavedOutline] = useState<DocumentOutline | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const [collapsedItemIds, setCollapsedItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [departmentSelections, setDepartmentSelections] = useState<
    Record<string, string>
  >({});

  const loadOutline = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);

    try {
      const outline = await fetchDocumentOutline(signal);
      setDraftOutline(outline);
      setSavedOutline(outline);
      setCollapsedItemIds(new Set(outline.items.map((item) => item.id)));
    } catch (nextError) {
      if (nextError instanceof DOMException && nextError.name === 'AbortError') {
        return;
      }

      setDraftOutline(null);
      setSavedOutline(null);
      setError(getErrorMessage(nextError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadOutline(controller.signal);

    return () => controller.abort();
  }, [loadOutline]);

  const hasUnsavedChanges = useMemo(
    () => outlineSignature(draftOutline) !== outlineSignature(savedOutline),
    [draftOutline, savedOutline],
  );

  useEffect(() => {
    onUnsavedChange(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChange]);

  useEffect(
    () => () => {
      onUnsavedChange(false);
    },
    [onUnsavedChange],
  );

  const reportSummaryById = useMemo(
    () => new Map(reportSummaries.map((summary) => [summary.id, summary])),
    [reportSummaries],
  );

  const placedReportIds = useMemo(() => {
    const placedIds = new Set<string>();

    draftOutline?.items.forEach((item) => {
      if (item.type !== 'department') {
        return;
      }

      item.items.forEach((childItem) => {
        if (childItem.type === 'report') {
          placedIds.add(childItem.reportId);
        }
      });
    });

    return placedIds;
  }, [draftOutline]);

  const unplacedReports = useMemo(
    () => reportSummaries.filter((summary) => !placedReportIds.has(summary.id)),
    [placedReportIds, reportSummaries],
  );

  const contentsEntries = useMemo(
    () =>
      draftOutline?.items
        .filter(
          (item): item is Extract<OutlineItem, { type: 'section' | 'department' }> =>
            item.type === 'section' || item.type === 'department',
        )
        .map((item) => getOutlineItemTitle(item)) ?? [],
    [draftOutline],
  );

  const isBusy = isSaving || uploadingTarget !== null;
  const isReportCatalogPending = reportsLoading && reportSummaries.length === 0;

  const updateOutlineItems = (updater: (items: OutlineItem[]) => OutlineItem[]) => {
    setDraftOutline((currentOutline) =>
      currentOutline
        ? {
            ...currentOutline,
            items: updater(currentOutline.items),
          }
        : currentOutline,
    );
  };

  const updateDepartment = (
    departmentId: string,
    updater: (department: DepartmentItem) => DepartmentItem,
  ) => {
    updateOutlineItems((items) =>
      items.map((item) =>
        item.type === 'department' && item.id === departmentId ? updater(item) : item,
      ),
    );
  };

  const handleAddSection = () => {
    updateOutlineItems((items) => [
      ...items,
      {
        type: 'section',
        id: createOutlineNodeId('section'),
        title: '',
        body: '',
      },
    ]);
  };

  const handleAddDepartment = () => {
    updateOutlineItems((items) => [
      ...items,
      {
        type: 'department',
        id: createOutlineNodeId('department'),
        name: '',
        items: [],
      },
    ]);
  };

  const handleSave = async () => {
    if (!draftOutline || !hasUnsavedChanges || isBusy) {
      return;
    }

    setIsSaving(true);
    onNotice(null);

    try {
      const savedDocument = await updateDocumentOutline(draftOutline);
      setDraftOutline(savedDocument);
      setSavedOutline(savedDocument);
      onNotice({ tone: 'success', message: 'Document outline saved successfully.' });
    } catch (nextError) {
      onNotice({ tone: 'error', message: getErrorMessage(nextError) });
    } finally {
      setIsSaving(false);
    }
  };

  const uploadImageToOutline = async (
    file: File,
    target: { kind: 'top-level' } | { departmentId: string; kind: 'department' },
  ) => {
    const validationError = validateImageFile(file);

    if (validationError) {
      onNotice({ tone: 'error', message: validationError });
      return;
    }

    setUploadingTarget(
      target.kind === 'top-level' ? 'top-level-image' : `department-${target.departmentId}`,
    );
    onNotice(null);

    try {
      const media = await uploadMedia(file);
      const nextImage = createImageItem(media, file.name.replace(/\.[^.]+$/, '') || 'image');

      if (target.kind === 'top-level') {
        updateOutlineItems((items) => [...items, nextImage]);
      } else {
        updateDepartment(target.departmentId, (department) => ({
          ...department,
          items: [...department.items, nextImage],
        }));
      }
    } catch (nextError) {
      onNotice({ tone: 'error', message: getErrorMessage(nextError) });
    } finally {
      setUploadingTarget(null);
    }
  };

  const handleMoveTopLevelItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;

    updateOutlineItems((items) => {
      if (nextIndex < 0 || nextIndex >= items.length) {
        return items;
      }

      return moveItem(items, index, nextIndex);
    });
  };

  const handleRemoveTopLevelItem = (item: OutlineItem) => {
    const message =
      item.type === 'department'
        ? `Remove this department and its ${item.items.length} item${item.items.length === 1 ? '' : 's'}?`
        : item.type === 'contents'
          ? 'Remove this generated contents block from the outline?'
          : item.type === 'section'
            ? 'Remove this section from the outline?'
            : 'Remove this image from the outline?';

    if (!window.confirm(message)) {
      return;
    }

    updateOutlineItems((items) => items.filter((currentItem) => currentItem.id !== item.id));
    setCollapsedItemIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(item.id);
      return nextIds;
    });
  };

  const handleToggleTopLevelItem = (itemId: string) => {
    setCollapsedItemIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(itemId)) {
        nextIds.delete(itemId);
      } else {
        nextIds.add(itemId);
      }
      return nextIds;
    });
  };

  const handleExpandAll = () => {
    setCollapsedItemIds(new Set());
  };

  const handleCollapseAll = () => {
    setCollapsedItemIds(new Set(draftOutline?.items.map((item) => item.id) ?? []));
  };

  const handleAddReportToDepartment = (departmentId: string) => {
    const selectedReportId = departmentSelections[departmentId]?.trim();

    if (!selectedReportId) {
      return;
    }

    if (placedReportIds.has(selectedReportId)) {
      onNotice({
        tone: 'error',
        message: 'That report is already placed elsewhere in the outline.',
      });
      return;
    }

    updateDepartment(departmentId, (department) => ({
      ...department,
      items: [...department.items, { type: 'report', reportId: selectedReportId, pageBreakAfter: false }],
    }));

    setDepartmentSelections((currentSelections) => ({
      ...currentSelections,
      [departmentId]: '',
    }));
  };

  const handleAddTableToDepartment = (departmentId: string) => {
    updateDepartment(departmentId, (department) => ({
      ...department,
      items: [...department.items, createTableItem()],
    }));
  };

  const handleMoveDepartmentChild = (
    departmentId: string,
    childIndex: number,
    direction: -1 | 1,
  ) => {
    const nextIndex = childIndex + direction;

    updateDepartment(departmentId, (department) => {
      if (nextIndex < 0 || nextIndex >= department.items.length) {
        return department;
      }

      return {
        ...department,
        items: moveItem(department.items, childIndex, nextIndex),
      };
    });
  };

  const handleRemoveDepartmentChild = (
    departmentId: string,
    childItem: DepartmentChildItem,
  ) => {
    const message =
      childItem.type === 'report'
        ? 'Remove this report from the department?'
        : childItem.type === 'table'
          ? 'Remove this table from the department?'
          : 'Remove this image from the department?';

    if (!window.confirm(message)) {
      return;
    }

    updateDepartment(departmentId, (department) => ({
      ...department,
      items: department.items.filter((departmentItem) => departmentItem !== childItem),
    }));
  };

  if (isLoading) {
    return (
      <section className="editor-panel document-editor">
        <div className="state-card">
          <h2>Loading document outline</h2>
          <p>Pulling the latest structure from the API…</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="editor-panel document-editor">
        <div className="state-card state-card--error" role="alert">
          <h2>Unable to load the document outline</h2>
          <p>{error}</p>
          <button className="secondary-button" onClick={() => void loadOutline()} type="button">
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (!draftOutline) {
    return (
      <section className="editor-panel document-editor">
        <div className="state-card state-card--empty">
          <h2>No document outline available</h2>
          <p>Try reloading the page or retrying the API request.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="editor-panel document-editor">
      <div className="editor-form document-editor__form">
        <div className="editor-panel__header document-editor__header">
          <div className="editor-panel__title-group">
            <p className="eyebrow">Document outline</p>
            <h2>Structured document outline</h2>
            <p className="subtitle">
              Arrange sections, departments, reports, and images in the exact order
              they should appear.
            </p>
            <div className="status-row">
              <span className="status-pill">
                {hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
              </span>
              <span className="status-pill status-pill--neutral">
                {draftOutline.items.length} top-level item
                {draftOutline.items.length === 1 ? '' : 's'}
              </span>
              {isReportCatalogPending ? (
                <span className="status-pill status-pill--neutral">
                  Loading report library…
                </span>
              ) : null}
              {reportsError ? (
                <span className="status-pill status-pill--warning">
                  Report library unavailable
                </span>
              ) : null}
            </div>
          </div>

          <div className="editor-panel__actions">
            <button
              className="primary-button"
              disabled={!hasUnsavedChanges || isBusy}
              onClick={() => void handleSave()}
              type="button"
            >
              {isSaving ? 'Saving…' : 'Save outline'}
            </button>
          </div>
        </div>

        {reportsError ? (
          <div className="state-card state-card--error" role="alert">
            <h3>Unable to load report summaries</h3>
            <p>
              Existing report placements still appear, but labels and unplaced report
              options may be incomplete.
            </p>
            <p>{reportsError}</p>
            <button className="secondary-button" onClick={onRetryReports} type="button">
              Retry report summaries
            </button>
          </div>
        ) : null}

        <fieldset className="document-outline-controls" disabled={isBusy}>
          <div className="document-toolbar">
            <div className="document-toolbar__group">
              <button className="secondary-button" onClick={handleAddSection} type="button">
                Add section
              </button>
              <button className="secondary-button" onClick={handleAddDepartment} type="button">
                Add department
              </button>
              <FilePickerButton
                disabled={isBusy}
                label={
                  uploadingTarget === 'top-level-image' ? 'Uploading image…' : 'Add top-level image'
                }
                onSelect={(file) => void uploadImageToOutline(file, { kind: 'top-level' })}
              />
            </div>
            <div className="document-toolbar__group document-toolbar__group--view">
              <button
                className="secondary-button"
                disabled={draftOutline.items.every((item) => !collapsedItemIds.has(item.id))}
                onClick={handleExpandAll}
                type="button"
              >
                Expand all
              </button>
              <button
                className="secondary-button"
                disabled={draftOutline.items.every((item) => collapsedItemIds.has(item.id))}
                onClick={handleCollapseAll}
                type="button"
              >
                Collapse all
              </button>
            </div>
          </div>

        <p className="field-hint document-toolbar__hint">
                                          Upload PNG, JPEG, GIF, WebP, or SVG images. New uploads are
          added to the outline immediately and saved when you save the outline.
        </p>

        {draftOutline.items.length === 0 ? (
          <div className="state-card state-card--empty">
            <h3>Start building the outline</h3>
            <p>
              Add sections, departments, or images to define the structure of the final
              document.
            </p>
          </div>
        ) : null}

        <ol className="outline-list">
          {draftOutline.items.map((item, index) => (
            <li className="outline-list__item" key={item.id}>
              <article className="outline-card">
                <div className="outline-card__header">
                  <div className="outline-card__heading">
                    <span className="outline-order">{index + 1}</span>
                    <button
                      aria-controls={`${item.id}-content`}
                      aria-expanded={!collapsedItemIds.has(item.id)}
                      aria-label={collapsedItemIds.has(item.id) ? 'Expand' : 'Collapse'}
                      className="outline-collapse-button"
                      onClick={() => handleToggleTopLevelItem(item.id)}
                      title={collapsedItemIds.has(item.id) ? 'Expand' : 'Collapse'}
                      type="button"
                    >
                      {collapsedItemIds.has(item.id) ? <>&#8964;</> : <>&#8963;</>}
                    </button>
                    <div>
                      <p className="outline-type">{getOutlineItemLabel(item)}</p>
                      <h3>{getOutlineItemTitle(item)}</h3>
                    </div>
                  </div>

                  <div className="outline-actions">
                    <button
                      className="secondary-button secondary-button--compact"
                      disabled={index === 0 || isBusy}
                      onClick={() => handleMoveTopLevelItem(index, -1)}
                      type="button"
                    >
                      Move up
                    </button>
                    <button
                      className="secondary-button secondary-button--compact"
                      disabled={index === draftOutline.items.length - 1 || isBusy}
                      onClick={() => handleMoveTopLevelItem(index, 1)}
                      type="button"
                    >
                      Move down
                    </button>
                    <button
                      className="danger-button danger-button--compact"
                      disabled={isBusy}
                      onClick={() => handleRemoveTopLevelItem(item)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div
                  className="outline-card__content"
                  hidden={collapsedItemIds.has(item.id)}
                  id={`${item.id}-content`}
                >
                {item.type === 'section' ? (
                  <div className="outline-card__body">
                    <div className="field-group">
                      <label className="field-label" htmlFor={`${item.id}-title`}>
                        Section title
                      </label>
                      <input
                        className="text-input"
                        id={`${item.id}-title`}
                        onChange={(event) =>
                          updateOutlineItems((items) =>
                            items.map((currentItem) =>
                              currentItem.type === 'section' && currentItem.id === item.id
                                ? { ...currentItem, title: event.target.value }
                                : currentItem,
                            ),
                          )
                        }
                        placeholder="Give this section a clear heading"
                        type="text"
                        value={item.title}
                      />
                    </div>

                    <MarkdownField
                      id={`${item.id}-body`}
                      label="Section body"
                      onChange={(value) =>
                        updateOutlineItems((items) =>
                          items.map((currentItem) =>
                            currentItem.type === 'section' && currentItem.id === item.id
                              ? { ...currentItem, body: value }
                              : currentItem,
                          ),
                        )
                      }
                      value={item.body}
                    />
                  </div>
                ) : null}

                {item.type === 'contents' ? (
                  <div className="outline-card__body">
                    <p className="field-hint">
                      This item is generated automatically from the current section and
                      department order.
                    </p>
                    {contentsEntries.length > 0 ? (
                      <ol className="contents-preview">
                        {contentsEntries.map((entry, entryIndex) => (
                          <li key={`${item.id}-${entryIndex}`}>{entry}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="placeholder-text">
                        Add sections or departments to populate the contents.
                      </p>
                    )}
                  </div>
                ) : null}

                {item.type === 'image' ? (
                  <div className="outline-card__body image-fields">
                    <div className="image-preview-card">
                      <img
                        alt={item.altText || item.fileName}
                        className="image-preview"
                        src={getMediaAssetUrl(item.mediaId)}
                      />
                      <p className="field-hint image-preview-card__meta">
                        {item.fileName} · {item.contentType}
                      </p>
                    </div>

                    <div className="image-fields__inputs">
                      <div className="field-group">
                        <label className="field-label" htmlFor={`${item.id}-alt-text`}>
                          Alt text
                        </label>
                        <input
                          className="text-input"
                          id={`${item.id}-alt-text`}
                          onChange={(event) =>
                            updateOutlineItems((items) =>
                              items.map((currentItem) =>
                                currentItem.type === 'image' && currentItem.id === item.id
                                  ? { ...currentItem, altText: event.target.value }
                                  : currentItem,
                              ),
                            )
                          }
                          placeholder="Describe the image for accessibility"
                          type="text"
                          value={item.altText}
                        />
                      </div>

                      <div className="field-group">
                        <label className="field-label" htmlFor={`${item.id}-caption`}>
                          Caption
                        </label>
                        <textarea
                          className="text-area-input"
                          id={`${item.id}-caption`}
                          onChange={(event) =>
                            updateOutlineItems((items) =>
                              items.map((currentItem) =>
                                currentItem.type === 'image' && currentItem.id === item.id
                                  ? { ...currentItem, caption: event.target.value }
                                  : currentItem,
                              ),
                            )
                          }
                          placeholder="Add optional supporting context"
                          rows={3}
                          value={item.caption}
                        />
                      </div>

                      <label className="empty-report-toggle">
                        <input
                          checked={item.fullPage || item.fullWidth}
                          onChange={(event) =>
                            updateOutlineItems((items) =>
                              items.map((currentItem) =>
                                currentItem.type === 'image' && currentItem.id === item.id
                                  ? { ...currentItem, fullPage: event.target.checked, fullWidth: false }
                                  : currentItem,
                              ),
                            )
                          }
                          type="checkbox"
                        />
                        Full page image
                      </label>
                    </div>
                  </div>
                ) : null}

                {item.type === 'department' ? (
                  <div className="outline-card__body department-fields">
                    <div className="field-group">
                      <label className="field-label" htmlFor={`${item.id}-name`}>
                        Department name
                      </label>
                      <input
                        className="text-input"
                        id={`${item.id}-name`}
                        onChange={(event) =>
                          updateDepartment(item.id, (department) => ({
                            ...department,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Name this department"
                        type="text"
                        value={item.name}
                      />
                    </div>

                    <div className="department-toolbar">
                      <div className="field-group department-toolbar__select-group">
                        <label className="field-label" htmlFor={`${item.id}-report-select`}>
                          Add unplaced report
                        </label>
                        <select
                          className="select-input"
                          disabled={reportsLoading || Boolean(reportsError) || isBusy}
                          id={`${item.id}-report-select`}
                          onChange={(event) =>
                            setDepartmentSelections((currentSelections) => ({
                              ...currentSelections,
                              [item.id]: event.target.value,
                            }))
                          }
                          value={departmentSelections[item.id] ?? ''}
                        >
                          <option value="">Select a report</option>
                          {unplacedReports.map((summary) => (
                            <option key={summary.id} value={summary.id}>
                              {formatReportLabel(summary)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        className="secondary-button"
                        disabled={
                          !departmentSelections[item.id] ||
                          reportsLoading ||
                          Boolean(reportsError) ||
                          isBusy
                        }
                        onClick={() => handleAddReportToDepartment(item.id)}
                        type="button"
                      >
                        Add report
                      </button>
                      <FilePickerButton
                        disabled={isBusy}
                        label={
                          uploadingTarget === `department-${item.id}`
                            ? 'Uploading image…'
                            : 'Add image'
                        }
                        onSelect={(file) =>
                          void uploadImageToOutline(file, {
                            departmentId: item.id,
                            kind: 'department',
                          })
                        }
                      />
                      <button
                        className="secondary-button"
                        disabled={isBusy}
                        onClick={() => handleAddTableToDepartment(item.id)}
                        type="button"
                      >
                        Add table
                      </button>
                    </div>

                    {!reportsLoading && !reportsError && unplacedReports.length === 0 ? (
                      <p className="field-hint">
                        Every available report is already placed somewhere in the outline.
                      </p>
                    ) : null}

                    {item.items.length === 0 ? (
                      <div className="state-card state-card--empty department-empty-state">
                        <h4>No department items yet</h4>
                        <p>Add a report or image to this department.</p>
                      </div>
                    ) : (
                      <ol className="department-list">
                        {item.items.map((childItem, childIndex) => {
                          const summary =
                            childItem.type === 'report'
                              ? reportSummaryById.get(childItem.reportId)
                              : null;

                          return (
                            <li
                              className="department-list__item"
                              key={getDepartmentChildKey(childItem, childIndex)}
                            >
                              <div className="department-item-card">
                                <div className="outline-card__header outline-card__header--nested">
                                  <div className="outline-card__heading">
                                    <span className="outline-order">{childIndex + 1}</span>
                                    <div>
                                      <p className="outline-type">
                                        {getDepartmentChildLabel(childItem)}
                                      </p>
                                      <h4>
                                        {childItem.type === 'report'
                                          ? summary?.team ?? childItem.reportId
                                          : childItem.type === 'table'
                                            ? childItem.title.trim() || 'Untitled table'
                                            : childItem.fileName}
                                      </h4>
                                    </div>
                                  </div>

                                  <div className="outline-actions">
                                    <button
                                      className="secondary-button secondary-button--compact"
                                      disabled={childIndex === 0 || isBusy}
                                      onClick={() =>
                                        handleMoveDepartmentChild(item.id, childIndex, -1)
                                      }
                                      type="button"
                                    >
                                      Move up
                                    </button>
                                    <button
                                      className="secondary-button secondary-button--compact"
                                      disabled={
                                        childIndex === item.items.length - 1 || isBusy
                                      }
                                      onClick={() =>
                                        handleMoveDepartmentChild(item.id, childIndex, 1)
                                      }
                                      type="button"
                                    >
                                      Move down
                                    </button>
                                    <button
                                      className="danger-button danger-button--compact"
                                      disabled={isBusy}
                                      onClick={() =>
                                        handleRemoveDepartmentChild(item.id, childItem)
                                      }
                                      type="button"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>

                                {childItem.type === 'report' ? (
                                  <div className="department-item-card__copy">
                                    <p className="field-hint">
                                      {summary
                                        ? `${summary.department} · ${summary.authorName}`
                                        : 'Report summary unavailable. The report ID will still be saved.'}
                                    </p>
                                    <label className="empty-report-toggle">
                                      <input
                                        checked={childItem.pageBreakAfter}
                                        onChange={(event) =>
                                          updateDepartment(item.id, (department) => ({
                                            ...department,
                                            items: department.items.map((departmentItem) =>
                                              departmentItem.type === 'report' &&
                                              departmentItem.reportId === childItem.reportId
                                                ? {
                                                    ...departmentItem,
                                                    pageBreakAfter: event.target.checked,
                                                  }
                                                : departmentItem,
                                            ),
                                          }))
                                        }
                                        type="checkbox"
                                      />
                                      Force page break after this report
                                    </label>
                                  </div>
                                ) : childItem.type === 'table' ? (
                                  <div className="table-fields table-fields--nested">
                                    <div className="field-group">
                                      <label
                                        className="field-label"
                                        htmlFor={`${item.id}-${childItem.id}-title`}
                                      >
                                        Title (optional)
                                      </label>
                                      <input
                                        className="text-input"
                                        id={`${item.id}-${childItem.id}-title`}
                                        onChange={(event) =>
                                          updateDepartment(item.id, (department) => ({
                                            ...department,
                                            items: department.items.map((departmentItem) =>
                                              departmentItem.type === 'table' &&
                                              departmentItem.id === childItem.id
                                                ? {
                                                    ...departmentItem,
                                                    title: event.target.value,
                                                  }
                                                : departmentItem,
                                            ),
                                          }))
                                        }
                                        placeholder="Give this table a heading"
                                        type="text"
                                        value={childItem.title}
                                      />
                                    </div>

                                    <div className="field-group">
                                      <label
                                        className="field-label"
                                        htmlFor={`${item.id}-${childItem.id}-markdown`}
                                      >
                                        Table Markdown
                                      </label>
                                      <textarea
                                        className="text-area-input"
                                        id={`${item.id}-${childItem.id}-markdown`}
                                        onChange={(event) =>
                                          updateDepartment(item.id, (department) => ({
                                            ...department,
                                            items: department.items.map((departmentItem) =>
                                              departmentItem.type === 'table' &&
                                              departmentItem.id === childItem.id
                                                ? {
                                                    ...departmentItem,
                                                    markdown: event.target.value,
                                                  }
                                                : departmentItem,
                                            ),
                                          }))
                                        }
                                        placeholder="| Column A | Column B |&#10;| --- | --- |&#10;| Value | Value |"
                                        rows={6}
                                        value={childItem.markdown}
                                      />
                                    </div>

                                    <label className="empty-report-toggle">
                                      <input
                                        checked={childItem.pageBreakAfter}
                                        onChange={(event) =>
                                          updateDepartment(item.id, (department) => ({
                                            ...department,
                                            items: department.items.map((departmentItem) =>
                                              departmentItem.type === 'table' &&
                                              departmentItem.id === childItem.id
                                                ? {
                                                    ...departmentItem,
                                                    pageBreakAfter: event.target.checked,
                                                  }
                                                : departmentItem,
                                            ),
                                          }))
                                        }
                                        type="checkbox"
                                      />
                                      Force page break after this table
                                    </label>
                                  </div>
                                ) : (
                                  <div className="image-fields image-fields--nested">
                                    <div className="image-preview-card">
                                      <img
                                        alt={childItem.altText || childItem.fileName}
                                        className="image-preview"
                                        src={getMediaAssetUrl(childItem.mediaId)}
                                      />
                                      <p className="field-hint image-preview-card__meta">
                                        {childItem.fileName} · {childItem.contentType}
                                      </p>
                                    </div>

                                    <div className="image-fields__inputs">
                                      <div className="field-group">
                                        <label
                                          className="field-label"
                                          htmlFor={`${item.id}-${childItem.id}-alt-text`}
                                        >
                                          Alt text
                                        </label>
                                        <input
                                          className="text-input"
                                          id={`${item.id}-${childItem.id}-alt-text`}
                                          onChange={(event) =>
                                            updateDepartment(item.id, (department) => ({
                                              ...department,
                                              items: department.items.map((departmentItem) =>
                                                departmentItem.type === 'image' &&
                                                departmentItem.id === childItem.id
                                                  ? {
                                                      ...departmentItem,
                                                      altText: event.target.value,
                                                    }
                                                  : departmentItem,
                                              ),
                                            }))
                                          }
                                          placeholder="Describe the image for accessibility"
                                          type="text"
                                          value={childItem.altText}
                                        />
                                      </div>

                                      <div className="field-group">
                                        <label
                                          className="field-label"
                                          htmlFor={`${item.id}-${childItem.id}-caption`}
                                        >
                                          Caption
                                        </label>
                                        <textarea
                                          className="text-area-input"
                                          id={`${item.id}-${childItem.id}-caption`}
                                          onChange={(event) =>
                                            updateDepartment(item.id, (department) => ({
                                              ...department,
                                              items: department.items.map((departmentItem) =>
                                                departmentItem.type === 'image' &&
                                                departmentItem.id === childItem.id
                                                  ? {
                                                      ...departmentItem,
                                                      caption: event.target.value,
                                                    }
                                                  : departmentItem,
                                              ),
                                            }))
                                          }
                                          placeholder="Add optional supporting context"
                                          rows={3}
                                          value={childItem.caption}
                                        />
                                      </div>

                                      <label className="empty-report-toggle">
                                        <input
                                          checked={childItem.fullWidth}
                                          onChange={(event) =>
                                            updateDepartment(item.id, (department) => ({
                                              ...department,
                                              items: department.items.map((departmentItem) =>
                                                departmentItem.type === 'image' &&
                                                departmentItem.id === childItem.id
                                                  ? {
                                                      ...departmentItem,
                                                      fullWidth: event.target.checked,
                                                    }
                                                  : departmentItem,
                                              ),
                                            }))
                                          }
                                          type="checkbox"
                                        />
                                        Full page image
                                      </label>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                ) : null}
                </div>
              </article>
            </li>
          ))}
        </ol>
        </fieldset>
      </div>
    </section>
  );
}
