/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['graph.facebook.com', 'scontent.facebook.com', 'platform-lookaside.fbsbx.com'],
  },
}

module.exports = nextConfig
