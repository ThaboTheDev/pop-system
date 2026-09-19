import type { MetadataRoute } from "next";

/** Disallow all crawling. This is a private administrative system with a
 *  public submission form that does not benefit from being indexed. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
