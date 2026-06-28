import { Title, Meta } from "@solidjs/meta";

export default function NotFound() {
  return (
    <main>
      <Title>Page Not Found — General E</Title>
      <Meta name="description" content="" />
      <Meta property="og:title" content="Page Not Found — General E" />
      <Meta property="og:description" content="" />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />
      <h1>Page Not Found</h1>
      <p>
        Visit{" "}
        <a href="https://start.solidjs.com" target="_blank" rel="noopener">
          start.solidjs.com
        </a>{" "}
        to learn how to build SolidStart apps.
      </p>
    </main>
  );
}
