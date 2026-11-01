const taskPriorities = new Set(['high', 'medium', 'low']);
const memoryCategories = new Set(['Preference', 'Idea', 'Note', 'Personal']);
const scheduleTypes = new Set(['Meeting', 'Fitness', 'Meal', 'Appointment', 'Task', 'Other']);
const goalCategories = new Set(['Writing', 'Skills', 'Personal', 'Health', 'Career', 'Learning', 'Finance', 'Relationships', 'General']);

export function parseMercyActions(rawActions, now = new Date(), existingTaskIds = new Set(), existingGoalIds = new Set()) {
  if (!Array.isArray(rawActions)) return [];

  const seenExistingTaskIds = new Set();
  const seenExistingGoalIds = new Set();
  return rawActions.slice(0, 8).flatMap(action => {
    if (!action || typeof action !== 'object' || typeof action.title !== 'string') return [];
    const title = action.title.trim().slice(0, 120);
    if (!title) return [];
    const details = typeof action.details === 'string' ? action.details.trim().slice(0, 500) : '';
    const startsAtDate = typeof action.startsAt === 'string' ? new Date(action.startsAt) : null;
    const startsAt = startsAtDate && !Number.isNaN(startsAtDate.getTime()) && startsAtDate > now
      ? startsAtDate.toISOString()
      : null;

    if (action.type === 'memory') {
      if (!details) return [];
      return [{
        type: 'memory',
        title,
        content: details,
        category: memoryCategories.has(action.category) ? action.category : 'Note',
      }];
    }

    if (action.type === 'goal') {
      const existingGoalId = typeof action.existingGoalId === 'string'
        ? action.existingGoalId
        : null;
      if (existingGoalId && (
        !existingGoalIds.has(existingGoalId) ||
        seenExistingGoalIds.has(existingGoalId)
      )) return [];
      if (existingGoalId) seenExistingGoalIds.add(existingGoalId);
      return [{
        type: 'goal',
        title,
        details,
        existingGoalId,
        category: goalCategories.has(action.category) ? action.category : 'General',
        deadline: typeof action.deadline === 'string' ? action.deadline.trim().slice(0, 60) : '',
      }];
    }

    if (action.type === 'event' && startsAt) {
      return [{
        type: 'event',
        title,
        details,
        startsAt,
        reminderMinutes: Number.isInteger(action.reminderMinutes)
          ? Math.max(0, Math.min(120, action.reminderMinutes))
          : 10,
        category: scheduleTypes.has(action.category) && action.category !== 'Task'
          ? action.category
          : 'Other',
      }];
    }

    if (action.type === 'task' || action.type === 'event') {
      const existingTaskId = typeof action.existingTaskId === 'string'
        ? action.existingTaskId
        : null;
      if (existingTaskId && (
        !existingTaskIds.has(existingTaskId) ||
        seenExistingTaskIds.has(existingTaskId)
      )) return [];
      if (existingTaskId) seenExistingTaskIds.add(existingTaskId);
      return [{
        type: 'task',
        title,
        details,
        ...(startsAt ? { startsAt } : {}),
        existingTaskId,
        priority: taskPriorities.has(action.priority) ? action.priority : 'medium',
      }];
    }

    return [];
  });
}

export function applyMercyActions(actions, scheduleItems, memories, goals = [], now = Date.now()) {
  const taskActions = actions.filter(action => action.type === 'task');
  const events = actions.filter(action => action.type === 'event');
  const memoryActions = actions.filter(action => action.type === 'memory');
  const goalActions = actions.filter(action => action.type === 'goal');
  const existingTasks = scheduleItems.filter(item => item.type === 'Task');
  const tasksById = new Map(existingTasks.map(item => [String(item.id), item]));
  const usedTaskIds = new Set();
  const updatedTasks = taskActions.map((action, index) => {
    const existing = action.existingTaskId && tasksById.get(action.existingTaskId);
    if (existing && !usedTaskIds.has(String(existing.id))) {
      usedTaskIds.add(String(existing.id));
      return {
        ...existing,
        title: action.title,
        ...(action.details ? { notes: action.details } : {}),
        priority: action.priority,
        ...(action.startsAt ? {
          startsAt: action.startsAt,
          time: new Date(action.startsAt).toLocaleString(),
        } : {}),
      };
    }
    return {
      id: `${now}-${index}`,
      title: action.title,
      time: action.startsAt ? new Date(action.startsAt).toLocaleString() : 'Not scheduled',
      ...(action.startsAt ? { startsAt: action.startsAt } : {}),
      ...(action.details ? { notes: action.details } : {}),
      type: 'Task',
      priority: action.priority,
      completed: false,
    };
  });

  existingTasks.forEach(task => {
    if (!usedTaskIds.has(String(task.id))) updatedTasks.push(task);
  });

  let taskIndex = 0;
  const updatedSchedule = scheduleItems.map(item => (
    item.type === 'Task' ? updatedTasks[taskIndex++] : item
  ));
  updatedSchedule.push(...updatedTasks.slice(taskIndex));
  updatedSchedule.push(...events.map((event, index) => ({
    id: `${now}-event-${index}`,
    title: event.title,
    time: new Date(event.startsAt).toLocaleString(),
    startsAt: event.startsAt,
    reminderMinutes: event.reminderMinutes,
    type: event.category,
    ...(event.details ? { notes: event.details } : {}),
    completed: false,
  })));

  const updatedMemories = [
    ...memories,
    ...memoryActions.map((memory, index) => ({
      id: `${now}-memory-${index}`,
      title: memory.title,
      content: memory.content,
      category: memory.category,
    })),
  ];

  const goalsById = new Map(goals.map(goal => [String(goal.id), goal]));
  const usedGoalIds = new Set();
  const updatedGoals = [
    ...goalActions.map((action, index) => {
      const existing = action.existingGoalId && goalsById.get(action.existingGoalId);
      if (existing && !usedGoalIds.has(String(existing.id))) {
        usedGoalIds.add(String(existing.id));
        return {
          ...existing,
          title: action.title,
          ...(action.details ? { notes: action.details } : {}),
          category: action.category,
          ...(action.deadline ? { deadline: action.deadline } : {}),
        };
      }
      return {
        id: `${now}-goal-${index}`,
        title: action.title,
        ...(action.details ? { notes: action.details } : {}),
        progress: 0,
        category: action.category,
        deadline: action.deadline || 'Not set',
      };
    }),
    ...goals.filter(goal => !usedGoalIds.has(String(goal.id))),
  ];

  return {
    scheduleItems: updatedSchedule,
    memories: updatedMemories,
    goals: updatedGoals,
    appliedCount: taskActions.length + events.length + memoryActions.length + goalActions.length,
  };
}
