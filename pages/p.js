import Head from 'next/head';
import { useEffect } from 'react';

export async function getServerSideProps({ query, req }) {
  // ใช้ชื่อ param ที่ไม่ชัดเจน เพื่อไม่ให้ Facebook scraper ตาม URL ปลายทาง
  const { img = '', ti = '', de = '', r = '' } = query;
  const base = `https://${req.headers.host}`;

  // decode URL ปลายทาง
  let destUrl = '';
  try { destUrl = r ? decodeURIComponent(r) : ''; } catch {}

  let resolvedTitle = ti;
  let resolvedDesc = de;

  // ถ้าไม่มีชื่อ → ดึง OG title/desc จาก URL ปลายทางอัตโนมัติ
  if ((!resolvedTitle || resolvedTitle === '.') && destUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(destUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'facebookexternalhit/1.1' },
      });
      clearTimeout(timer);
      const html = await res.text();

      const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/i)
                   || html.match(/content="([^"]+)"\s+property="og:title"/i)
                   || html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (ogTitle?.[1]) resolvedTitle = ogTitle[1].trim();

      if (!resolvedDesc) {
        const ogDesc = html.match(/property="og:description"\s+content="([^"]+)"/i)
                    || html.match(/content="([^"]+)"\s+property="og:description"/i);
        if (ogDesc?.[1]) resolvedDesc = ogDesc[1].trim();
      }
    } catch {}
  }

  const proxyImg = img ? `${base}/api/img?url=${encodeURIComponent(img)}` : '';

  return { props: { img: proxyImg, title: resolvedTitle || '', desc: resolvedDesc || '', destUrl } };
}

export default function ProxyPage({ img, title, desc, destUrl }) {
  useEffect(() => {
    if (destUrl) window.location.href = destUrl;
  }, [destUrl]);

  return (
    <>
      <Head>
        <title>{title || 'ดูสินค้าเพิ่มเติม'}</title>
        <meta name="description" content={desc} />
        <meta property="og:title" content={title || 'ดูสินค้าเพิ่มเติม'} />
        <meta property="og:description" content={desc} />
        <meta property="og:image" content={img} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:type" content="website" />
      </Head>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', fontFamily: 'sans-serif', color: '#888',
      }}>
        <p>กำลังพาคุณไปยังหน้าสินค้า...</p>
      </div>
    </>
  );
}
