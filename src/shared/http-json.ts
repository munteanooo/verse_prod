export async function readJson(request: Request, maxBytes: number) {
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    !request.body
  )
    return;
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode()) as unknown;
      length += value.byteLength;
      if (length > maxBytes) return;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return undefined;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
