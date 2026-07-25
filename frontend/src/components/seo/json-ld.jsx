/**
 * Renders JSON-LD into the server HTML (blueprint §27). Server component so the
 * markup is in the initial HTML, not injected client-side.
 * @param {{ data: object | object[] }} props
 */
export function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
