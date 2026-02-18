const express = require('express');
const router = express.Router();
require('dotenv').config();

/**
 * OneCompiler via RapidAPI proxy (keeps UI simple + keeps API key off the browser)
 * Docs: https://rapidapi.com/onecompiler/api/onecompiler-apis
 */
const RAPIDAPI_KEY = process.env.ONECOMPILER_ACCESS_TOKEN || process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'onecompiler-apis.p.rapidapi.com';

if (!RAPIDAPI_KEY) {
    console.warn('[OneCompiler/RapidAPI] RAPIDAPI_KEY is NOT set (did you create a .env file?)');
} else {
    const masked =
        RAPIDAPI_KEY.length <= 8
            ? '********'
            : `${RAPIDAPI_KEY.slice(0, 4)}********${RAPIDAPI_KEY.slice(-4)}`;
    console.log(`[OneCompiler/RapidAPI] API key loaded: ${masked}`);
}

function oneCompilerHeaders() {
    return {
        'Content-Type': 'application/json',
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
    };
}

let oneCompilerLanguagesCache = { fetchedAt: 0, data: null };
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

router.get('/languages', async (req, res) => {
    try {
        const now = Date.now();
        if (
            oneCompilerLanguagesCache.data &&
            now - oneCompilerLanguagesCache.fetchedAt < ONE_DAY_MS
        ) {
            return res.json(oneCompilerLanguagesCache.data);
        }

        const r = await fetch(`https://onecompiler.com/api/v1/languages`, {
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            return res.status(r.status).json({
                error: 'Failed to fetch OneCompiler languages',
                details: data,
            });
        }

        oneCompilerLanguagesCache = { fetchedAt: now, data };
        return res.json(data);
    } catch (e) {
        return res
            .status(500)
            .json({ error: 'OneCompiler languages request failed', details: String(e) });
    }
});

router.post('/run', async (req, res) => {
    try {
        if (!RAPIDAPI_KEY) {
            return res.status(500).json({
                error:
                    'Server is missing RAPIDAPI_KEY (or ONECOMPILER_ACCESS_TOKEN). Set it in your environment before running.',
            });
        }

        const { language, code, stdin } = req.body || {};
        if (typeof language !== 'string' || !language.trim()) {
            return res.status(400).json({ error: '`language` is required' });
        }
        if (typeof code !== 'string' || !code.trim()) {
            return res.status(400).json({ error: '`code` is required' });
        }

        const fileNameByLanguage = {
            javascript: 'main.js',
            nodejs: 'main.js',
            typescript: 'main.ts',
            python: 'main.py',
            python2: 'main.py',
            java: 'Main.java',
            cpp: 'main.cpp',
            c: 'main.c',
            csharp: 'main.cs',
            go: 'main.go',
            ruby: 'main.rb',
            php: 'main.php',
        };

        const r = await fetch(`https://${RAPIDAPI_HOST}/api/v1/run`, {
            method: 'POST',
            headers: oneCompilerHeaders(),
            body: JSON.stringify({
                language: language.trim(),
                stdin: typeof stdin === 'string' || Array.isArray(stdin) ? stdin : '',
                files: [
                    {
                        name: fileNameByLanguage[language.trim()] || 'main.txt',
                        content: code,
                    },
                ],
            }),
        });

        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            return res.status(r.status).json({
                error: 'Failed to run code on OneCompiler',
                details: data,
            });
        }

        return res.json(data);
    } catch (e) {
        return res
            .status(500)
            .json({ error: 'OneCompiler run request failed', details: String(e) });
    }
});

module.exports = router;
