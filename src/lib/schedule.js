export function getTodayScheduleItems(scheduleItems, now = new Date()) {
  const today = now.toDateString();
  return scheduleItems
    .filter(item => (
      item.startsAt &&
      new Date(item.startsAt).toDateString() === today
    ))
    .sort((first, second) => new Date(first.startsAt) - new Date(second.startsAt));
}
