export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}
