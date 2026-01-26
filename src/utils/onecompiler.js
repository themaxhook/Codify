const API_BASE =
    process.env.REACT_APP_API_BASE ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:7000' : '');

export async function fetchOneCompilerLanguages(signal) {
    const r = await fetch(`${API_BASE}/api/onecompiler/languages`, { signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
        throw new Error(data?.error || 'Failed to fetch languages');
    }
    return data;
}

export async function runOneCompiler({ language, code, stdin }) {
    const r = await fetch(`${API_BASE}/api/onecompiler/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, code, stdin }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
        throw new Error(data?.error || 'Failed to run code');
    }
    return data;
}


