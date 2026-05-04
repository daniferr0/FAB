const crypto = require('crypto');

const ALLOWED_ORIGINS = [
  'https://rimessa-fab.com',
  'https://www.rimessa-fab.com',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
}

exports.handler = async (event) => {
  const origin = event.headers['origin'] || event.headers['Origin'] || '';
  const headers = corsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  let email, language;
  try {
    ({ email, language } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_json' }) };
  }

  email = (email || '').trim().toLowerCase();
  language = (language || '').trim().toLowerCase();

  if (!email || !EMAIL_RE.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_email' }) };
  }

  if (!['it', 'en'].includes(language)) {
    language = 'it';
  }

  const apiKey = process.env.MAILCHIMP_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'server_config' }) };
  }

  const LIST_ID = '6ba64db552';
  const SERVER = 'us2';
  const auth = Buffer.from(`anystring:${apiKey}`).toString('base64');
  const baseUrl = `https://${SERVER}.api.mailchimp.com/3.0/lists/${LIST_ID}`;

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
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'already_subscribed' }) };
    }
    console.error('Mailchimp add member error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'generic' }) };
  }

  const subscriberHash = crypto.createHash('md5').update(email).digest('hex');
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

  return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
};
