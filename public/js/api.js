/**
 * API client — all communication with the server goes through these functions.
 * Each function returns the parsed JSON response or throws an Error.
 */
const API = (() => {
  function syncCode() {
    return localStorage.getItem('syncCode') || '';
  }

  async function request(method, path, body = null, isFormData = false) {
    const headers = { 'X-Sync-Code': syncCode() };
    if (body && !isFormData) headers['Content-Type'] = 'application/json';

    const res = await fetch(path, {
      method,
      headers,
      body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
    });

    if (res.status === 204) return null;

    // Read as text first so a non-JSON response (e.g. an HTML error page) shows
    // its actual content rather than a cryptic JSON parse failure message.
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Server returned unexpected response (HTTP ${res.status}): ${text.slice(0, 400)}`);
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  return {
    // Sync
    newSyncCode: () => request('POST', '/api/sync/new'),
    joinSyncCode: (code) => request('POST', '/api/sync/join', { syncCode: code }),

    // Tunes
    getTunes: () => request('GET', '/api/tunes'),
    getTune: (id) => request('GET', `/api/tunes/${id}`),
    createTune: (data) => request('POST', '/api/tunes', data),
    updateTune: (id, data) => request('PUT', `/api/tunes/${id}`, data),
    deleteTune: (id) => request('DELETE', `/api/tunes/${id}`),
    importCsv: (file) => {
      const form = new FormData();
      form.append('csv', file);
      return request('POST', '/api/tunes/import', form, true);
    },

    // Tunes (partial update)
    patchTune: (id, data) => request('PATCH', `/api/tunes/${id}`, data),
    mergeTune: (primaryId, mergeIds) => request('POST', `/api/tunes/${primaryId}/merge`, { mergeIds }),
    uploadTuneImage: (id, file) => {
      const form = new FormData();
      form.append('image', file);
      return request('POST', `/api/tunes/${id}/image`, form, true);
    },
    deleteTuneImage: (id) => request('DELETE', `/api/tunes/${id}/image`),
    importImages: (file) => {
      const form = new FormData();
      form.append('tarball', file);
      return request('POST', '/api/tunes/import-images', form, true);
    },

    // Sets
    getSets: () => request('GET', '/api/sets'),
    getSet: (id) => request('GET', `/api/sets/${id}`),
    createSet: (tuneIds) => request('POST', '/api/sets', { tuneIds }),
    updateSet: (id, tuneIds) => request('PUT', `/api/sets/${id}`, { tuneIds }),
    patchSet: (id, data) => request('PATCH', `/api/sets/${id}`, data),
    practiceSet: (id, date) => request('POST', `/api/sets/${id}/practice`, { date }),
    deleteSet: (id) => request('DELETE', `/api/sets/${id}`),
    importSetsCsv: (file) => {
      const form = new FormData();
      form.append('csv', file);
      return request('POST', '/api/sets/import', form, true);
    },
  };
})();
