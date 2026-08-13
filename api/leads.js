/**
 * Infinito Lead Generation — Vercel Serverless Function
 * Route: POST /api/leads
 * Provider: Google Gemini API (FREE — no credit card needed)
 *
 * Security:
 *   - API key read ONLY from process.env.GEMINI_API_KEY
 *   - Key is NEVER returned to client or logged
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'CONFIGURATION_MISSING',
      message: 'Gemini API key is not configured. Add GEMINI_API_KEY to Vercel Environment Variables.',
      setupSteps: [
        '1. Go to aistudio.google.com/apikey',
        '2. Sign in with Google → Click "Create API key"',
        '3. Copy the key (starts with AIza...)',
        '4. Go to vercel.com → Project → Settings → Environment Variables',
        '5. Add Name: GEMINI_API_KEY, Value: your key',
        '6. Select all environments → Save → Redeploy'
      ]
    });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  const {
    icp = 'icp_3',
    targetCountry = 'Global',
    targetState = '',
    targetCity = '',
    industry = '',
    limit = 20
  } = body;

  const effectiveLimit = Math.min(Number(limit) || 20, 20);

  const icpDescriptions = {
    icp_1: 'Indian IT Services & Software companies (SaaS, software development, IT consulting, tech firms)',
    icp_2: 'Indian Enterprise companies (non-IT buyers: manufacturing, BFSI, retail, logistics, healthcare)',
    icp_3: 'Global Small & Medium B2B businesses (any country, 50+ employees)'
  };
  const icpDesc = icpDescriptions[icp] || icpDescriptions['icp_3'];
  const locationStr = [targetCity, targetState, targetCountry].filter(Boolean).join(', ');
  const industryStr = industry ? `Industry: ${industry}.` : '';

  const prompt = `You are a B2B lead research assistant. Return ONLY real, publicly known companies.

STRICT RULES:
- Only real companies that genuinely exist in: ${locationStr}
- NEVER fabricate company names, LinkedIn URLs, emails, or founders
- Founder name/email: use "" if not publicly known
- LinkedIn URL: real company page or ""
- Source URL: real verifiable URL (website, LinkedIn, Crunchbase) or ""
- Verification: "Verified" if confirmed, "Needs Review" if uncertain
- ICP: ${icpDesc}
- ${industryStr}
- No duplicates, no companies from wrong locations

Find up to ${effectiveLimit} real B2B companies in ${locationStr} matching the ICP above.

Return ONLY a valid JSON array like this (no explanation, no markdown):
[
  {
    "companyName": "Real company name",
    "linkedinUrl": "https://linkedin.com/company/slug or empty string",
    "founderName": "Real founder name if known or empty string",
    "founderEmail": "Real email if publicly known or empty string",
    "sourceUrl": "Real URL or empty string",
    "verificationStatus": "Verified or Needs Review"
  }
]`;

  // Candidate models to try in sequence for resilient compatibility
  const candidateModels = [
    'gemini-1.5-flash-latest',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro'
  ];

  let lastError = null;
  let lastStatus = 500;
  let rawText = '';
  let successfulModel = '';

  for (const model of candidateModels) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 2500
            }
          })
        }
      );

      if (response.ok) {
        const completion = await response.json();
        rawText = completion?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (rawText) {
          successfulModel = model;
          break; // Success!
        }
      } else {
        const errBody = await response.json().catch(() => ({}));
        lastStatus = response.status;
        lastError = errBody?.error?.message || `HTTP ${response.status} for model ${model}`;

        // If invalid key or rate limit, fail immediately without retrying other models
        if (response.status === 401 || (response.status === 400 && errBody?.error?.message?.includes('API_KEY'))) {
          return res.status(401).json({
            error: 'INVALID_API_KEY',
            message: 'The Gemini API key is invalid. Update GEMINI_API_KEY in Vercel Environment Variables.',
            detail: errBody?.error?.message
          });
        }
        if (response.status === 429) {
          return res.status(429).json({
            error: 'RATE_LIMIT',
            message: 'Gemini free tier rate limit hit. Wait 1 minute and try again. Free limit: 15 requests/minute.',
            detail: errBody?.error?.message
          });
        }
      }
    } catch (e) {
      lastError = e.message;
    }
  }

  if (!successfulModel || !rawText) {
    return res.status(lastStatus || 500).json({
      error: 'GEMINI_ERROR',
      message: lastError || 'All Gemini model attempts failed.',
      candidateModelsTried: candidateModels
    });
  }

  let parsed = [];
  try {
    const cleaned = rawText
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/gi, '')
      .trim();

    const parsed_obj = JSON.parse(cleaned);
    if (Array.isArray(parsed_obj)) {
      parsed = parsed_obj;
    } else if (Array.isArray(parsed_obj.leads)) {
      parsed = parsed_obj.leads;
    } else {
      const firstArray = Object.values(parsed_obj).find(v => Array.isArray(v));
      parsed = firstArray || [];
    }
  } catch (parseError) {
    return res.status(500).json({
      error: 'PARSE_ERROR',
      message: 'Could not parse Gemini response as valid JSON lead data.',
      detail: parseError.message
    });
  }

  // Clean and validate — enforce strict 6-field output only
  const cleanLeads = parsed
    .filter(lead => lead && typeof lead.companyName === 'string' && lead.companyName.trim())
    .map(lead => ({
      companyName:        (lead.companyName || '').trim(),
      linkedinUrl:        isValidUrl(lead.linkedinUrl)  ? lead.linkedinUrl.trim()  : '',
      founderName:        typeof lead.founderName === 'string' ? lead.founderName.trim() : '',
      founderEmail:       isValidEmail(lead.founderEmail) ? lead.founderEmail.trim() : '',
      sourceUrl:          isValidUrl(lead.sourceUrl)    ? lead.sourceUrl.trim()    : '',
      verificationStatus: lead.verificationStatus === 'Verified' ? 'Verified' : 'Needs Review'
    }))
    .slice(0, effectiveLimit);

  return res.status(200).json({
    leads: cleanLeads,
    meta: {
      query: `ICP: ${icp} | Country: ${targetCountry} | State: ${targetState || 'All'} | City: ${targetCity || 'All'} | Industry: ${industry || 'All'}`,
      candidatesFound: cleanLeads.length,
      sourcesChecked: `Google Gemini API (${successfulModel} - free tier)`,
      timestamp: new Date().toISOString(),
      requestedLimit: effectiveLimit
    }
  });
}

function isValidUrl(str) {
  if (!str || typeof str !== 'string' || !str.trim()) return false;
  try {
    const u = new URL(str.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

function isValidEmail(str) {
  if (!str || typeof str !== 'string' || !str.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());
}
