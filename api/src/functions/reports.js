import { app } from '@azure/functions';
import { handleCollection, handleItem } from '../report-service.js';

app.http('reportsCollection', {
  route: 'reports',
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: handleCollection,
});

app.http('reportItem', {
  route: 'reports/{id}',
  methods: ['GET', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  handler: handleItem,
});
