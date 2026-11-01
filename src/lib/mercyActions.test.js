import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMercyActions, parseMercyActions } from './mercyActions.js';

test('parses actionable memories, goals, tasks, and future schedule items safely', () => {
  const now = new Date('2026-10-28T08:00:00Z');
  const actions = parseMercyActions([
    { type: 'memory', title: 'Tea', details: 'Prefers tea', category: 'Preference' },
    { type: 'goal', title: 'Run a 5K', details: 'Train three times weekly', category: 'Health', deadline: 'December' },
    { type: 'task', title: 'Send report', details: 'Email the team', priority: 'high' },
    { type: 'event', title: 'Lunch', startsAt: '2026-10-28T12:00:00Z', category: 'Meal' },
    { type: 'event', title: 'Invalid past event', startsAt: '2026-10-27T12:00:00Z' },
    { type: 'task', title: '   ' },
    { type: 'task', title: 'Ghost task', existingTaskId: 'not-a-task' },
  ], now);

  assert.deepEqual(actions.map(action => action.type), ['memory', 'goal', 'task', 'event', 'task']);
  assert.equal(actions[2].priority, 'high');
  assert.equal(actions[3].category, 'Meal');
  assert.equal(actions[4].title, 'Invalid past event');
});

test('applies goals, task priority, events, and memories without a confirmation step', () => {
  const existingTask = { id: 1, title: 'Old name', type: 'Task', completed: false };
  const result = applyMercyActions([
    { type: 'task', title: 'Updated name', details: 'Due soon', priority: 'high', existingTaskId: '1' },
    { type: 'event', title: 'Lunch', startsAt: '2026-10-28T12:00:00Z', reminderMinutes: 10, category: 'Meal' },
    { type: 'memory', title: 'Tea', content: 'Prefers tea', category: 'Preference' },
    { type: 'goal', title: 'Run a 5K', details: 'Train three times weekly', category: 'Health', deadline: 'December' },
  ], [existingTask], [], [], Date.parse('2026-10-28T08:00:00Z'));

  assert.equal(result.scheduleItems[0].title, 'Updated name');
  assert.equal(result.scheduleItems[0].priority, 'high');
  assert.equal(result.scheduleItems[1].type, 'Meal');
  assert.equal(result.memories[0].content, 'Prefers tea');
  assert.equal(result.goals[0].title, 'Run a 5K');
  assert.equal(result.goals[0].category, 'Health');
  assert.equal(result.appliedCount, 4);
});
