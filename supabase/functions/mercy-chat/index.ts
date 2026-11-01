import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (request) => {
  const corsHeaders = getCorsHeaders(request);
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: corsHeaders });
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return Response.json({ error: 'Authentication required.' }, { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!supabaseUrl || !anonKey || !geminiApiKey) {
    console.error('Missing required Edge Function configuration.');
    return Response.json({ error: 'AI service is not configured.' }, { status: 503, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: 'Authentication required.' }, { status: 401, headers: corsHeaders });
  }

  let body: { message?: unknown; history?: unknown; context?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400, headers: corsHeaders });
  }

  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 4000) {
    return Response.json({ error: 'Message must be between 1 and 4000 characters.' }, { status: 400, headers: corsHeaders });
  }

  const history = Array.isArray(body.history)
    ? body.history.filter((item): item is { role: 'user' | 'model'; text: string } =>
      Boolean(item) &&
      typeof item === 'object' &&
      ((item as { role?: unknown }).role === 'user' || (item as { role?: unknown }).role === 'model') &&
      typeof (item as { text?: unknown }).text === 'string' &&
      (item as { text: string }).text.length <= 4000
    ).slice(-12)
    : [];
  const context = body.context && typeof body.context === 'object' ? body.context : {};

  let apiResponse: Response;
  try {
    apiResponse = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
      {
        method: 'POST',
        signal: AbortSignal.timeout(25_000),
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: `You are Mercy, a capable professional personal assistant. Be warm, decisive, concise, and practical. Reduce effort for a user who struggles to get started: do not ask for confirmation before saving a clear request, do not ask the user which category to use, and do not ask follow-up questions unless a missing detail is essential to prevent a wrong or unsafe action. Use common sense and the user's saved records.

When the user's message clearly asks you to do something, immediately return the appropriate saved action:
- Create or update a task for things to do, including a commitment with no clear date/time. Use type "task".
- Put an appointment, meeting, meal, workout, or other event on the schedule only when its date and time are clear from the message and current local time. Use type "event" and provide startsAt as a future ISO-8601 timestamp. If the date/time is not clear, make it an unscheduled task instead of asking.
- Save a preference, personal fact, or information explicitly offered to remember as a memory. Use type "memory", with a short title, the exact useful detail, and category Preference, Personal, Idea, or Note.
- Add a longer-term outcome, target, or milestone to Goals using type "goal". Choose the closest category (Writing, Skills, Personal, Health, Career, Learning, Finance, Relationships, General), include a deadline only if the user stated or clearly implied one, and use existingGoalId to update a matching saved goal instead of creating a duplicate.
- If a user says something like “remember”, “I prefer”, “my goal is”, “I need to”, or “I’m trying to”, intelligently classify it without asking. Use a memory for personal facts/preferences, a goal for bigger outcomes, a task for routine actions, and an event only when a clear future time is stated.
- When organising existing tasks, return task actions for the existing items in the requested order, using each exact existingTaskId and preserving their meaning. Set a sensible priority. Only add new tasks when the user asks or a clear new action is present.
- For ordinary conversation with no requested record change, return an empty actions array. Never invent user facts, events, or commitments. Do not say an action was saved unless it is present in actions.

Use the supplied current date, local time, and time zone when interpreting relative dates such as today or tomorrow. Keep the reply brief. Actions are applied automatically by the app, so only include changes clearly supported by the user's message.

Return only the requested JSON structure. The user's current saved schedule, goals, and notes follow:\n${JSON.stringify(context)}`,
            }],
          },
          contents: [
            ...history.map(({ role, text }) => ({ role, parts: [{ text }] })),
            { role: 'user', parts: [{ text: body.message }] },
          ],
          generationConfig: {
            maxOutputTokens: 900,
            temperature: 0.6,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                reply: { type: 'STRING' },
                actions: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      type: { type: 'STRING', enum: ['task', 'event', 'memory', 'goal'] },
                      title: { type: 'STRING' },
                      details: { type: 'STRING' },
                      startsAt: { type: 'STRING' },
                      reminderMinutes: { type: 'INTEGER' },
                      priority: { type: 'STRING', enum: ['high', 'medium', 'low'] },
                      category: { type: 'STRING' },
                      existingTaskId: { type: 'STRING' },
                      existingGoalId: { type: 'STRING' },
                      deadline: { type: 'STRING' },
                    },
                    required: ['type', 'title', 'details', 'startsAt', 'reminderMinutes', 'priority', 'category', 'existingTaskId', 'existingGoalId', 'deadline'],
                  },
                },
              },
              required: ['reply', 'actions'],
            },
          },
        }),
      },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    console.error(timedOut ? 'Gemini request timed out.' : 'Gemini request could not be completed.');
    return Response.json(
      { error: timedOut ? 'The AI service timed out. Please try again.' : 'The AI service could not be reached.' },
      { status: 503, headers: corsHeaders },
    );
  }

  if (!apiResponse.ok) {
    console.error('Gemini request failed with status:', apiResponse.status);
    return Response.json(
      { error: 'Mercy could not get a response from the AI service.', status: apiResponse.status },
      { status: apiResponse.status === 429 || apiResponse.status >= 500 ? 503 : 502, headers: corsHeaders },
    );
  }

  const result = await apiResponse.json();
  const responseText = result.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? '')
    .join('')
    .trim();
  if (!responseText) {
    return Response.json({ error: 'The AI service returned an empty reply.' }, { status: 502, headers: corsHeaders });
  }

  let structuredReply: { reply?: unknown; actions?: unknown };
  try {
    structuredReply = JSON.parse(responseText);
  } catch {
    console.error('Gemini returned a response that was not valid JSON.');
    return Response.json({ error: 'The AI service returned an invalid response.' }, { status: 502, headers: corsHeaders });
  }

  if (typeof structuredReply.reply !== 'string' || !structuredReply.reply.trim()) {
    return Response.json({ error: 'The AI service returned an invalid reply.' }, { status: 502, headers: corsHeaders });
  }

  return Response.json({
    reply: structuredReply.reply.trim(),
    actions: Array.isArray(structuredReply.actions) ? structuredReply.actions.slice(0, 8) : [],
  }, { headers: corsHeaders });
});
