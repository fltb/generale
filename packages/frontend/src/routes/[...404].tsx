import { Title, Meta } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { PLATFORM_NAME } from "~/config";

export default function NotFound() {
  return (
    <main class="max-w-3xl mx-auto px-6 py-20 text-center">
      <Title>Page Not Found — {PLATFORM_NAME}</Title>
      <Meta name="description" content="" />
      <Meta property="og:title" content={`Page Not Found — ${PLATFORM_NAME}`} />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />
      <h1 class="text-3xl text-primary font-press-start mb-4">404</h1>
      <p class="text-base text-base-content/60 mb-8">Page not found.</p>
      <A href="/" class="text-primary hover:underline text-sm">← Back to Home</A>
    </main>
  );
}
