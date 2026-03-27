// Image proxy — ดึงรูปจาก URL ใดก็ได้ แล้วเสิร์ฟผ่าน domain ของเรา
// ทำให้ Facebook scraper เห็นรูปจาก domain ที่เราเป็นเจ้าของได้

export const config = {
  api: { responseLimit: '4.5mb' },
};

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).end();

  try {
    const imageRes = await fetch(decodeURIComponent(url), {
      headers: { 'User-Agent': 'facebookexternalhit/1.1' },
    });
    if (!imageRes.ok) return res.status(404).end();

    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await imageRes.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(Buffer.from(buffer));
  } catch {
    res.status(500).end();
  }
}
