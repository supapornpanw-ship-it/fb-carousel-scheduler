export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { shortToken } = req.body;
  if (!shortToken) return res.status(400).json({ error: 'Missing token' });

  const appId = process.env.NEXT_PUBLIC_FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;

  try {
    const url = `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    return res.status(200).json({ access_token: data.access_token });
  } catch (err) {
    return res.status(500).json({ error: 'Token exchange failed' });
  }
}
