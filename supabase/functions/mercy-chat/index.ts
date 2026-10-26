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

  const apiResponse = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: `You are Mercy, a warm and practical personal assistant. Use only the user's supplied records as personal facts. Do not claim to save or change records; ask for confirmation or explain that the app does not yet support that action. Keep replies concise.\n\nUser records: ${JSON.stringify(context)}`,
          }],
        },
        contents: [
          ...history.map(({ role, text }) => ({ role, parts: [{ text }] })),
          { role: 'user', parts: [{ text: body.message }] },
        ],
        generationConfig: { maxOutputTokens: 512 },
      }),
    },
  );

  if (!apiResponse.ok) {
    const errorBody = await apiResponse.text();
    console.error('Gemini request failed:', apiResponse.status, errorBody);
    return Response.json(
      { error: 'Mercy could not get a response from the AI service.', status: apiResponse.status },
      { status: apiResponse.status === 429 || apiResponse.status >= 500 ? 503 : 502, headers: corsHeaders },
    );
  }

  const result = await apiResponse.json();
  const reply = result.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? '')
    .join('')
    .trim();
  if (!reply) {
    return Response.json({ error: 'The AI service returned an empty reply.' }, { status: 502, headers: corsHeaders });
  }

  return Response.json({ reply }, { headers: corsHeaders });
});
