import test from 'node:test';
import assert from 'node:assert/strict';
import { getTodayScheduleItems } from './schedule.js';

test('returns all events today in chronological order', () => {
  const now = new Date('2026-10-28T12:00:00');
  const items = [
    { id: 'later', startsAt: new Date(2026, 9, 28, 16).toISOString(), completed: false },
    { id: 'tomorrow', startsAt: new Date(2026, 9, 29, 9).toISOString(), completed: false },
    { id: 'earlier', startsAt: new Date(2026, 9, 28, 8).toISOString(), completed: false },
    { id: 'done', startsAt: new Date(2026, 9, 28, 10).toISOString(), completed: true },
    { id: 'no-date', completed: false },
  ];

  assert.deepEqual(
    getTodayScheduleItems(items, now).map(item => item.id),
    ['earlier', 'done', 'later'],
  );
});
