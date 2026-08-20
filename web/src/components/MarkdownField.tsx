import { useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { MarkdownFieldKey } from '../types';

type MarkdownFieldProps = {
  disabled?: boolean;
  field: MarkdownFieldKey;
  label: string;
  onChange: (field: MarkdownFieldKey, value: string) => void;
  value: string;
};

type SelectionUpdate = {
  nextValue: string;
  selectionEnd: number;
  selectionStart: number;
};

const wrapSelection = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix: string,
  placeholder: string,
): SelectionUpdate => {
  const selected = value.slice(selectionStart, selectionEnd) || placeholder;
  const insertion = `${prefix}${selected}${suffix}`;

  return {
    nextValue:
      value.slice(0, selectionStart) + insertion + value.slice(selectionEnd),
    selectionStart: selectionStart + prefix.length,
    selectionEnd: selectionStart + prefix.length + selected.length,
  };
};

const prefixSelectedLines = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  createPrefix: (lineIndex: number) => string,
): SelectionUpdate => {
  const blockStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const foundBlockEnd = value.indexOf('\n', selectionEnd);
  const blockEnd = foundBlockEnd === -1 ? value.length : foundBlockEnd;
  const block = value.slice(blockStart, blockEnd) || 'List item';
  const lines = block.split('\n');
  const formattedBlock = lines
    .map((line, index) => `${createPrefix(index)}${line || 'List item'}`)
    .join('\n');

  return {
    nextValue: value.slice(0, blockStart) + formattedBlock + value.slice(blockEnd),
    selectionStart: blockStart,
    selectionEnd: blockStart + formattedBlock.length,
  };
};

export function MarkdownField({
  disabled = false,
  field,
  label,
  onChange,
  value,
}: MarkdownFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isPreview, setIsPreview] = useState(false);

  const fieldId = `${field}-textarea`;

  const toolbarActions = useMemo(
    () => [
      {
        ariaLabel: `Insert heading into ${label}`,
        label: 'H',
        apply: (currentValue: string, start: number, end: number) =>
          prefixSelectedLines(currentValue, start, end, () => '## '),
      },
      {
        ariaLabel: `Bold selected text in ${label}`,
        label: 'B',
        apply: (currentValue: string, start: number, end: number) =>
          wrapSelection(currentValue, start, end, '**', '**', 'Bold text'),
      },
      {
        ariaLabel: `Italicise selected text in ${label}`,
        label: 'I',
        apply: (currentValue: string, start: number, end: number) =>
          wrapSelection(currentValue, start, end, '*', '*', 'Italic text'),
      },
      {
        ariaLabel: `Create a bulleted list in ${label}`,
        label: '• List',
        apply: (currentValue: string, start: number, end: number) =>
          prefixSelectedLines(currentValue, start, end, () => '- '),
      },
      {
        ariaLabel: `Create a numbered list in ${label}`,
        label: '1. List',
        apply: (currentValue: string, start: number, end: number) =>
          prefixSelectedLines(currentValue, start, end, (index) => `${index + 1}. `),
      },
      {
        ariaLabel: `Insert a link into ${label}`,
        label: 'Link',
        apply: (currentValue: string, start: number, end: number) =>
          wrapSelection(
            currentValue,
            start,
            end,
            '[',
            '](https://example.com)',
            'Link text',
          ),
      },
    ],
    [label],
  );

  const applyToolbarAction = (
    transform: (currentValue: string, start: number, end: number) => SelectionUpdate,
  ) => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    const result = transform(
      value,
      textarea.selectionStart,
      textarea.selectionEnd,
    );

    onChange(field, result.nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  return (
    <section className="markdown-field">
      <div className="markdown-field__header">
        <div>
          <label className="field-label" htmlFor={fieldId}>
            {label}
          </label>
        </div>

        <div
          aria-label={`${label} mode`}
          className="segmented-control"
          role="group"
        >
          <button
            className={!isPreview ? 'is-active' : undefined}
            disabled={disabled}
            onClick={() => setIsPreview(false)}
            type="button"
          >
            Edit
          </button>
          <button
            className={isPreview ? 'is-active' : undefined}
            onClick={() => setIsPreview(true)}
            type="button"
          >
            Preview
          </button>
        </div>
      </div>

      <div className="markdown-toolbar" role="toolbar" aria-label={`${label} formatting`}>
        {toolbarActions.map((action) => (
          <button
            aria-label={action.ariaLabel}
            className="toolbar-button"
            disabled={disabled || isPreview}
            key={action.label}
            onClick={() => applyToolbarAction(action.apply)}
            type="button"
          >
            {action.label}
          </button>
        ))}
      </div>

      {isPreview ? (
        <div className="markdown-preview" aria-live="polite">
          {value.trim() ? (
            <ReactMarkdown
              components={{
                a: ({ node: _node, ...props }) => (
                  <a {...props} rel="noreferrer" target="_blank" />
                ),
              }}
            >
              {value}
            </ReactMarkdown>
          ) : (
            <p className="placeholder-text">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        <textarea
          className="markdown-textarea"
          disabled={disabled}
          id={fieldId}
          onChange={(event) => onChange(field, event.target.value)}
          placeholder={`Write the ${label.toLowerCase()} in Markdown...`}
          ref={textareaRef}
          rows={8}
          value={value}
        />
      )}
    </section>
  );
}
