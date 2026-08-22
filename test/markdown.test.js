import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/markdown.js';

test('renders a GFM-style pipe table', () => {
  const html = renderMarkdown('| Name | Role |\n| --- | --- |\n| Alex | Lead |\n| Sam | Support |');

  assert.match(html, /<table><thead><tr><th>Name<\/th><th>Role<\/th><\/tr><\/thead>/);
  assert.match(html, /<tbody><tr><td>Alex<\/td><td>Lead<\/td><\/tr><tr><td>Sam<\/td><td>Support<\/td><\/tr><\/tbody><\/table>/);
});

test('does not treat an ordinary paragraph followed by a dashed line as a table', () => {
  const html = renderMarkdown('Just a sentence.\n\n---\n\nAnother sentence.');

  assert.doesNotMatch(html, /<table>/);
});

test('renders a blockquote as a single callout', () => {
  const html = renderMarkdown('> Heads up: this is important.');

  assert.equal(html, '<blockquote class="callout"><p>Heads up: this is important.</p></blockquote>');
});

test('splits a callout into multiple paragraphs on blank quoted lines', () => {
  const html = renderMarkdown('> First paragraph.\n>\n> Second paragraph.');

  assert.equal(
    html,
    '<blockquote class="callout"><p>First paragraph.</p><p>Second paragraph.</p></blockquote>',
  );
});

test('renders regular content before and after a callout', () => {
  const html = renderMarkdown('Intro text.\n\n> A callout.\n\nOutro text.');

  assert.equal(
    html,
    '<p>Intro text.</p>\n<blockquote class="callout"><p>A callout.</p></blockquote>\n<p>Outro text.</p>',
  );
});
