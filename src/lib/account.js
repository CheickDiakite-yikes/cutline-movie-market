const JSON_HEADERS = { "content-type": "application/json" };

async function readJson(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.reason || payload?.status || `Cutline sync returned ${response.status}`);
  }
  return payload;
}

export async function fetchAccountSession() {
  const response = await fetch("/api/session", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  return readJson(response);
}

export async function fetchAccountIdeas() {
  const response = await fetch("/api/ideas", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  return (await readJson(response)).items || [];
}

export async function upsertAccountIdea(idea) {
  const response = await fetch(`/api/ideas/${encodeURIComponent(idea.eventTicker)}`, {
    method: "PUT",
    headers: { ...JSON_HEADERS, accept: "application/json" },
    body: JSON.stringify({ idea }),
  });
  return (await readJson(response)).item;
}

export async function removeAccountIdea(eventTicker) {
  const response = await fetch(`/api/ideas/${encodeURIComponent(eventTicker)}`, {
    method: "DELETE",
    headers: { accept: "application/json" },
  });
  return readJson(response);
}
