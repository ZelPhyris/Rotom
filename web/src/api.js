// Thin fetch helpers. Always send cookies so the session travels with requests.

async function parse(res) {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error((data && data.error) || `http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function apiGet(path) {
  return fetch(path, { credentials: 'include' }).then(parse);
}

export function apiPost(path, body) {
  return fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(parse);
}
