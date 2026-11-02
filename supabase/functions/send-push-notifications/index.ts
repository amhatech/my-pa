import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { getDailyEncouragement } from '../../../src/lib/dailyEncouragement.js';

type ScheduleItem = {
  id?: string | number;
  title?: string;
  time?: string;
  type?: string;
  startsAt?: string;
  reminderMinutes?: number;
  completed?: boolean;
};

function localDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function makeDailyNotice(data: Record<string, unknown>, now: Date, timeZone: string) {
  const scheduleItems = Array.isArray(data.scheduleItems) ? data.scheduleItems as ScheduleItem[] : [];
  const todaysEvents = scheduleItems
    .filter(item => (
      !item.completed &&
      item.startsAt &&
      localDateKey(new Date(item.startsAt), timeZone) === localDateKey(now, timeZone)
    ))
    .sort((first, second) => new Date(first.startsAt!).getTime() - new Date(second.startsAt!).getTime())
    .slice(0, 3);
  const goals = Array.isArray(data.goals) ? data.goals as Array<{ title?: string }> : [];
  const firstGoal = goals.find(goal => typeof goal.title === 'string' && goal.title.trim());
  const scheduleSummary = todaysEvents.length
    ? `Today: ${todaysEvents.map(item => `${item.title ?? 'Event'}${item.time ? ` at ${item.time}` : ''}`).join(', ')}.`
    : 'Your schedule is open so far.';
  const prioritySummary = firstGoal?.title
    ? `One goal to keep moving: ${firstGoal.title}.`
    : 'Choose one small priority to make progress on today.';

  const encouragement = getDailyEncouragement(localDateKey(now, timeZone));
  return `Good morning! ${encouragement} ${scheduleSummary} ${prioritySummary} Start with one focused 10-minute step.`;
}

Deno.serve(async request => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  }

  const cronSecret = Deno.env.get('PUSH_CRON_SECRET');
  if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) {
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.error('Missing required push notification configuration.');
    return Response.json({ error: 'Push notifications are not configured.' }, { status: 503 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const [subscriptionsResult, workspacesResult] = await Promise.all([
    supabase.from('push_subscriptions').select('endpoint, user_id, subscription, time_zone'),
    supabase.from('user_workspace').select('user_id, data'),
  ]);
  if (subscriptionsResult.error || workspacesResult.error) {
    console.error('Could not load push notification records:', subscriptionsResult.error?.message ?? workspacesResult.error?.message);
    return Response.json({ error: 'Could not load push notification records.' }, { status: 500 });
  }

  const workspaces = new Map(
    (workspacesResult.data ?? []).map(row => [row.user_id, row.data as Record<string, unknown>]),
  );
  const now = new Date();
  let delivered = 0;
  let expired = 0;

  for (const subscriptionRow of subscriptionsResult.data ?? []) {
    const data = workspaces.get(subscriptionRow.user_id);
    if (!data) continue;

    const sendOnce = async (notificationKey: string, payload: Record<string, unknown>) => {
      const { error: claimError } = await supabase.from('push_notification_deliveries').insert({
        endpoint: subscriptionRow.endpoint,
        notification_key: notificationKey,
      });
      if (claimError?.code === '23505') return;
      if (claimError) throw new Error(`Could not record push delivery: ${claimError.message}`);

      try {
        await webpush.sendNotification(
          subscriptionRow.subscription,
          JSON.stringify(payload),
        );
        delivered += 1;
      } catch (error) {
        const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
          ? Number(error.statusCode)
          : 0;
        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', subscriptionRow.endpoint);
          if (deleteError) console.error('Could not remove expired push subscription:', deleteError.message);
          expired += 1;
        } else {
          const { error: releaseError } = await supabase
            .from('push_notification_deliveries')
            .delete()
            .eq('endpoint', subscriptionRow.endpoint)
            .eq('notification_key', notificationKey);
          if (releaseError) console.error('Could not retry failed push delivery:', releaseError.message);
          console.error('Push delivery failed:', statusCode || 'unknown status');
        }
      }
    };

    const scheduleItems = Array.isArray(data.scheduleItems) ? data.scheduleItems as ScheduleItem[] : [];
    for (const item of scheduleItems) {
      if (!item.startsAt || item.completed || !item.id) continue;
      const startsAt = new Date(item.startsAt).getTime();
      const reminderMinutes = Number.isFinite(item.reminderMinutes) ? item.reminderMinutes! : 10;
      const notificationTime = startsAt - reminderMinutes * 60_000;
      if (!Number.isFinite(startsAt)) continue;
      const reminderAge = now.getTime() - notificationTime;
      if (reminderAge >= 0 && reminderAge <= 120_000) {
        await sendOnce(`schedule:${item.id}:${item.startsAt}`, {
          title: `Upcoming: ${item.title ?? 'Your event'}`,
          body: `Your event starts at ${item.time ?? new Date(item.startsAt).toLocaleTimeString()}.`,
          tag: `schedule-${item.id}-${startsAt}`,
          url: '/',
        });
      }

      const lapseAge = now.getTime() - (startsAt + 30 * 60_000);
      if (lapseAge >= 0 && lapseAge <= 120_000) {
        await sendOnce(`schedule-lapsed:${item.id}:${item.startsAt}`, {
          title: `Was ${item.title ?? 'your event'} completed?`,
          body: 'This scheduled time has passed. Mark it complete or reschedule it when you can.',
          tag: `schedule-lapsed-${item.id}-${startsAt}`,
          url: '/',
        });
      }
    }

    let timeParts: Record<string, string>;
    try {
      const parts = new Intl.DateTimeFormat('en', {
        timeZone: subscriptionRow.time_zone || 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(now);
      timeParts = Object.fromEntries(parts.map(part => [part.type, part.value]));
    } catch (error) {
      console.error(
        'Invalid push subscription time zone:',
        subscriptionRow.time_zone,
        error instanceof Error ? error.message : 'Unknown time zone error.',
      );
      continue;
    }

    if (timeParts.hour === '10' && Number(timeParts.minute) <= 4) {
      await sendOnce(`daily-notice:${localDateKey(now, subscriptionRow.time_zone || 'UTC')}`, {
        title: "Mercy's Daily Notice",
        body: makeDailyNotice(data, now, subscriptionRow.time_zone || 'UTC'),
        tag: `daily-notice-${localDateKey(now, subscriptionRow.time_zone || 'UTC')}`,
        url: '/',
      });
    }
  }

  return Response.json({ delivered, expired });
});
