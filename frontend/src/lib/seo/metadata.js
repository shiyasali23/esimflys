import { SITE } from "@/config/site";

/**
 * Build a Next.js Metadata object with a self-referential canonical + OG/Twitter
 * (blueprint §28.1). `title` runs through the root template `%s | eSIMFlys`.
 * @param {{ title?: string, description?: string, path?: string, index?: boolean, ogImage?: string, type?: string }} opts
 */
export function buildMetadata({
  title,
  description,
  path = "/",
  index = true,
  ogImage,
  type = "website",
}) {
  const url = new URL(path, SITE.baseUrl).toString();
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type,
      url,
      title,
      description,
      siteName: SITE.name,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
