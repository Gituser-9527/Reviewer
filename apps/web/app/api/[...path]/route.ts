import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

const hopByHopHeaders = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

async function proxyRequest(request: NextRequest, context: RouteContext): Promise<Response> {
  const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://localhost:3001').replace(/\/$/u, '');
  const { path } = await context.params;
  const targetUrl = new URL(`/api/${path.join('/')}${request.nextUrl.search}`, apiBaseUrl);
  const headers = new Headers(request.headers);
  for (const header of hopByHopHeaders) {
    headers.delete(header);
  }

  const body =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();
  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    ...(body === undefined ? {} : { body }),
    cache: 'no-store',
  });
  const responseHeaders = new Headers(upstream.headers);
  for (const header of hopByHopHeaders) {
    responseHeaders.delete(header);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxyRequest(request, context);
}

export function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxyRequest(request, context);
}

export function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxyRequest(request, context);
}

export function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxyRequest(request, context);
}

export function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxyRequest(request, context);
}
