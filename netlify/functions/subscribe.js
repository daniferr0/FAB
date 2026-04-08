const crypto = require('crypto');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  let email, language;
  try {
    ({ email, language } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'invalid_json' }) };
  }

  if (!email || !language) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'missing_fields' }) };
  }

  const apiKey = process.env.MAILCHIMP_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'server_config' }) };
  }

  const LIST_ID = '6ba64db552';
  const SERVER = 'us2';
  const auth = Buffer.from(`anystring:${apiKey}`).toString('base64');
  const baseUrl = `https://${SERVER}.api.mailchimp.com/3.0/lists/${LIST_ID}`;

  // ── 1. Add member (POST — fails with 400 if already exists) ──
  const addRes = await fetch(`${baseUrl}/members`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email_address: email,
      status: 'subscribed',
      merge_fields: { LANGUAGE: language },
    }),
  });

  if (!addRes.ok) {
    const err = await addRes.json();
    if (err.title === 'Member Exists') {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ error: 'already_subscribed' }) };
    }
    console.error('Mailchimp add member error:', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'generic' }) };
  }

  // ── 2. Add tags ──
  const subscriberHash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
  await fetch(`${baseUrl}/members/${subscriberHash}/tags`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tags: [
        { name: 'fab', status: 'active' },
        { name: `fab-${language}`, status: 'active' },
      ],
    }),
  });

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
};
