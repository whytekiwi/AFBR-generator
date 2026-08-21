import { app } from '@azure/functions';
import {
  handleDocument,
  handleMediaCollection,
  handleMediaItem,
} from '../document-service.js';

app.http('documentOutline', {
  route: 'document',
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  handler: handleDocument,
});

app.http('mediaCollection', {
  route: 'media',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: handleMediaCollection,
});

app.http('mediaItem', {
  route: 'media/{id}',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: handleMediaItem,
});
