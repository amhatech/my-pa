import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? 'http://localhost:5173',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
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
              text: `You are Mercy, a warm, thoughtful, practical woman personal assistant. Speak naturally and kindly. Help the user plan, reason, learn, and organise using only their supplied records. Never invent personal facts, dates, or commitments. If information is missing, say so and ask one useful question. Never claim a task was changed: when the user asks to organise, prioritise, reorder, or create tasks, return a proposed task plan for the user to review and confirm in the app. For ordinary chat, taskProposal must be null. A task plan may reorder only existing schedule records whose type is "Task" and may add up to three new tasks if the user requested tasks be created. Include each existing task ID exactly once, use its exact ID as a string, and do not include or modify schedule records of other types. Do not invent due dates or times. Keep replies concise and include a brief plan summary.\n\nReturn only the requested JSON structure. The user's current saved schedule, goals, and notes follow:\n${JSON.stringify(context)}`,
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
                taskProposal: {
                  type: 'OBJECT',
                  nullable: true,
                  properties: {
                    summary: { type: 'STRING' },
                    tasks: {
                      type: 'ARRAY',
                      items: {
                        type: 'OBJECT',
                        properties: {
                          existingTaskId: { type: 'STRING', nullable: true },
                          title: { type: 'STRING' },
                          priority: { type: 'STRING', enum: ['high', 'medium', 'low'] },
                        },
                        required: ['existingTaskId', 'title', 'priority'],
                      },
                    },
                  },
                  required: ['summary', 'tasks'],
                },
              },
              required: ['reply', 'taskProposal'],
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

  let structuredReply: { reply?: unknown; taskProposal?: unknown };
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
    taskProposal: structuredReply.taskProposal ?? null,
  }, { headers: corsHeaders });
});
