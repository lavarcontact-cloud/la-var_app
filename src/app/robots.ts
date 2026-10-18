import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return process.env.SITE_INDEXABLE === "true"
    ? { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/moderation", "/api"] }] }
    : { rules: [{ userAgent: "*", disallow: "/" }] };
}
