const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="28" fill="#2563eb" opacity=".12"/>
  <circle cx="32" cy="32" r="20" fill="#dbeafe" stroke="#2563eb" stroke-width="5"/>
  <circle cx="24" cy="24" r="4" fill="#eff6ff" opacity=".9"/>
</svg>`;

export default function handler(request, response) {
  response.setHeader("content-type", "image/svg+xml; charset=utf-8");
  response.setHeader("cache-control", "public, max-age=31536000, immutable");
  response.status(200).send(FAVICON);
}
