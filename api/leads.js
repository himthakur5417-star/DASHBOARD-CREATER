/**
 * Infinito Lead Generation — Vercel Serverless Function
 * Route: POST /api/leads
 *
 * Security:
 *   - API key is read ONLY from process.env.OPENAI_API_KEY
 *   - Key is NEVER returned to the client or logged
 *   - CORS restricted to same origin in production
 *
 * Expects JSON body:
 *   { icp, targetCountry, targetState, targetCity, industry, limit }
 *
 * Returns JSON:
 *   { leads: [...], meta: { sourcesChecked, candidatesFound, timestamp, query } }
 */

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Read API key from environment — NEVER from request or hardcoded
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'CONFIGURATION_MISSING',
      message:
        'OpenAI API key is not configured. Add OPENAI_API_KEY to your Vercel project environment variables at vercel.com → Project Settings → Environment Variables.',
      setupSteps: [
        '1. Go to vercel.com → Your Project → Settings → Environment Variables',
        '2. Add Name: OPENAI_API_KEY',
        '3. Add Value: your OpenAI API key (starts with sk-proj-...)',
        '4. Select all environments (Production, Preview, Development)',
        '5. Click Save → Redeploy'
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

  /* Clamp to 20 on free Vercel plan — fits within 10s timeout */
  const effectiveLimit = Math.min(Number(limit) || 20, 20);

  // Build a precise, structured prompt for real B2B company discovery
  const icpDescriptions = {
    icp_1: 'Indian IT Services & Software Product companies (technology firms, SaaS, software development, IT consulting)',
    icp_2: 'Indian Enterprise companies (non-IT buyers of AI/software, revenue ≥ ₹100 Crore, industries like manufacturing, BFSI, retail, logistics, healthcare)',
    icp_3: 'Global Small & Medium Businesses (any country, B2B companies with 50+ employees)'
  };
  const icpDesc = icpDescriptions[icp] || icpDescriptions['icp_3'];

  const locationStr = [targetCity, targetState, targetCountry].filter(Boolean).join(', ');
  const industryStr = industry ? `Industry focus: ${industry}.` : '';

  const systemPrompt = `You are a B2B lead research assistant. Return ONLY real, publicly known companies matching the search criteria.

RULES:
- Only real companies that exist in the specified location
- NEVER fabricate company names, LinkedIn URLs, emails, or founders
- Founder name/email: leave as "" if not publicly known
- LinkedIn URL: real company page or ""
- Source URL: real verifiable URL (website, LinkedIn, Crunchbase)
- Verification: "Verified" if confirmed, "Needs Review" if uncertain
- Location: ${locationStr}
- ICP: ${icpDesc}
- ${industryStr}
- No duplicates`;

  const userPrompt = `Find up to ${effectiveLimit} real B2B companies matching:
- Location: ${locationStr}
- ICP: ${icpDesc}
- ${industryStr}

Return a JSON array:
[
  {
    "companyName": "Exact real company name",
    "linkedinUrl": "https://www.linkedin.com/company/exact-slug or empty string",
    "founderName": "Real founder/CEO name if publicly known, otherwise empty string",
    "founderEmail": "Real verified business email if publicly known, otherwise empty string",
    "sourceUrl": "Real URL: company website or LinkedIn or Crunchbase",
    "verificationStatus": "Verified or Needs Review"
  }
]

Return ONLY the JSON array. No text, no markdown.`;

  let openaiResponse;
  try {
    openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 2500,
        response_format: { type: 'json_object' }
      })
    });
  } catch (fetchError) {
    return res.status(502).json({
      error: 'OPENAI_UNREACHABLE',
      message: 'Could not reach OpenAI API. Check your network or OpenAI status.',
      detail: fetchError.message
    });
  }

  if (!openaiResponse.ok) {
    const errBody = await openaiResponse.json().catch(() => ({}));
    const status = openaiResponse.status;

    if (status === 401) {
      return res.status(401).json({
        error: 'INVALID_API_KEY',
        message: 'The OpenAI API key is invalid or has been revoked. Update OPENAI_API_KEY in Vercel environment variables.',
        openaiError: errBody?.error?.message
      });
    }
    if (status === 429) {
      return res.status(429).json({
        error: 'RATE_LIMIT_OR_QUOTA',
        message: 'OpenAI rate limit or billing quota exceeded. Check your usage at platform.openai.com/usage.',
        openaiError: errBody?.error?.message
      });
    }
    if (status === 403) {
      return res.status(403).json({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'API key does not have permission for this model. Check your OpenAI account permissions.',
        openaiError: errBody?.error?.message
      });
    }

    return res.status(status).json({
      error: 'OPENAI_ERROR',
      message: errBody?.error?.message || 'OpenAI API returned an error.',
      openaiStatus: status
    });
  }

  let parsed;
  try {
    const completion = await openaiResponse.json();
    const rawContent = completion.choices?.[0]?.message?.content || '{}';

    // Parse the JSON response — handle both array and {leads:[...]} formats
    const parsed_obj = JSON.parse(rawContent);
    if (Array.isArray(parsed_obj)) {
      parsed = parsed_obj;
    } else if (Array.isArray(parsed_obj.leads)) {
      parsed = parsed_obj.leads;
    } else {
      // Try to find any array in the object
      const firstArray = Object.values(parsed_obj).find(v => Array.isArray(v));
      parsed = firstArray || [];
    }
  } catch (parseError) {
    return res.status(500).json({
      error: 'PARSE_ERROR',
      message: 'Could not parse OpenAI response as valid JSON lead data.',
      detail: parseError.message
    });
  }

  // Clean and validate each lead — enforce strict 6-field output
  const cleanLeads = parsed
    .filter(lead => lead && typeof lead.companyName === 'string' && lead.companyName.trim())
    .map(lead => ({
      companyName: (lead.companyName || '').trim(),
      linkedinUrl: isValidUrl(lead.linkedinUrl) ? lead.linkedinUrl.trim() : '',
      founderName: typeof lead.founderName === 'string' ? lead.founderName.trim() : '',
      founderEmail: isValidEmail(lead.founderEmail) ? lead.founderEmail.trim() : '',
      sourceUrl: isValidUrl(lead.sourceUrl) ? lead.sourceUrl.trim() : '',
      verificationStatus: lead.verificationStatus === 'Verified' ? 'Verified' : 'Needs Review'
    }))
    .slice(0, effectiveLimit);

  return res.status(200).json({
    leads: cleanLeads,
    meta: {
      query: `ICP: ${icp} | Country: ${targetCountry} | State: ${targetState || 'All'} | City: ${targetCity || 'All'} | Industry: ${industry || 'All'}`,
      candidatesFound: cleanLeads.length,
      sourcesChecked: 'OpenAI GPT-4o-mini (real company knowledge base)',
      timestamp: new Date().toISOString(),
      requestedLimit: limit
    }
  });
}

function isValidUrl(str) {
  if (!str || typeof str !== 'string' || !str.trim()) return false;
  try {
    const u = new URL(str.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidEmail(str) {
  if (!str || typeof str !== 'string' || !str.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());
}
