const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;

export class DocumentValidationError extends Error {
  constructor(errors) {
    super('Document outline validation failed');
    this.name = 'DocumentValidationError';
    this.errors = errors;
  }
}

function text(value, field, errors, { required = true } = {}) {
  if (typeof value !== 'string' || (required && value.trim() === '')) {
    errors.push({ field, message: required ? 'Is required' : 'Must be text' });
    return '';
  }
  return value.trim();
}

function id(value, field, errors, seenIds) {
  const normalized = text(value, field, errors);
  if (normalized && !ID_PATTERN.test(normalized)) {
    errors.push({ field, message: 'Must contain lowercase letters, numbers, and hyphens only' });
  } else if (normalized && seenIds.has(normalized)) {
    errors.push({ field, message: `Duplicate outline id "${normalized}"` });
  } else if (normalized) {
    seenIds.add(normalized);
  }
  return normalized;
}

function validateImage(item, field, errors, seenIds) {
  return {
    type: 'image',
    id: id(item.id, `${field}.id`, errors, seenIds),
    mediaId: text(item.mediaId, `${field}.mediaId`, errors),
    fileName: text(item.fileName, `${field}.fileName`, errors),
    contentType: text(item.contentType, `${field}.contentType`, errors),
    altText: text(item.altText ?? '', `${field}.altText`, errors, { required: false }),
    caption: text(item.caption ?? '', `${field}.caption`, errors, { required: false }),
  };
}

export function validateDocumentOutline(document) {
  const errors = [];
  const seenIds = new Set();
  const seenReports = new Set();
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new DocumentValidationError([{ field: 'document', message: 'Must be an object' }]);
  }
  if (!Array.isArray(document.items)) {
    throw new DocumentValidationError([{ field: 'items', message: 'Must be an array' }]);
  }

  const items = document.items.map((item, index) => {
    const field = `items[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({ field, message: 'Must be an object' });
      return null;
    }

    if (item.type === 'section') {
      return {
        type: 'section',
        id: id(item.id, `${field}.id`, errors, seenIds),
        title: text(item.title, `${field}.title`, errors),
        body: text(item.body ?? '', `${field}.body`, errors, { required: false }),
      };
    }

    if (item.type === 'contents') {
      return {
        type: 'contents',
        id: id(item.id ?? 'contents', `${field}.id`, errors, seenIds),
      };
    }

    if (item.type === 'image') return validateImage(item, field, errors, seenIds);

    if (item.type === 'department') {
      const department = {
        type: 'department',
        id: id(item.id, `${field}.id`, errors, seenIds),
        name: text(item.name, `${field}.name`, errors),
        items: [],
      };
      if (!Array.isArray(item.items)) {
        errors.push({ field: `${field}.items`, message: 'Must be an array' });
        return department;
      }
      department.items = item.items.map((child, childIndex) => {
        const childField = `${field}.items[${childIndex}]`;
        if (!child || typeof child !== 'object' || Array.isArray(child)) {
          errors.push({ field: childField, message: 'Must be an object' });
          return null;
        }
        if (child.type === 'image') return validateImage(child, childField, errors, seenIds);
        if (child.type === 'report') {
          const reportId = text(child.reportId, `${childField}.reportId`, errors);
          if (reportId && seenReports.has(reportId)) {
            errors.push({ field: `${childField}.reportId`, message: `Duplicate report "${reportId}"` });
          }
          seenReports.add(reportId);
          return { type: 'report', reportId };
        }
        errors.push({ field: `${childField}.type`, message: 'Must be "report" or "image"' });
        return null;
      }).filter(Boolean);
      return department;
    }

    errors.push({
      field: `${field}.type`,
      message: 'Must be "section", "contents", "image", or "department"',
    });
    return null;
  }).filter(Boolean);

  if (errors.length > 0) throw new DocumentValidationError(errors);
  return { version: 1, items };
}

export function serializeContentSection(section) {
  return `# ${section.title.trim()}\n\n${section.body.trim()}\n`;
}

export function parseContentSection(markdown) {
  const match = markdown.replace(/^\uFEFF/, '').match(/^#\s+(.+?)\s*\r?\n(?:\r?\n)?([\s\S]*)$/);
  if (!match) throw new Error('Section Markdown must begin with one level-one title');
  return { title: match[1].trim(), body: match[2].trim() };
}

export function stripSectionBodies(
  document,
  sectionFile = (item) => `sections/${item.id}.md`,
) {
  return {
    version: 1,
    items: document.items.map((item) => item.type === 'section'
      ? { type: 'section', id: item.id, file: sectionFile(item) }
      : item),
  };
}
