const productionOrigin = 'https://my-pa-rho.vercel.app';

function getAllowedOrigins() {
  const origins = new Set([productionOrigin, 'http://localhost:5173']);
  const configuredOrigin = Deno.env.get('APP_ORIGIN');

  if (configuredOrigin) {
    try {
      origins.add(new URL(configuredOrigin).origin);
    } catch (error) {
      console.error('APP_ORIGIN must be a valid URL:', error);
    }
  }

  return origins;
}

export function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = getAllowedOrigins();
  const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : productionOrigin;

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}
