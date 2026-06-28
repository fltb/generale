import { Title, Meta } from "@solidjs/meta";

export default function About() {
  return (
    <main>
      <Title>About — General E</Title>
      <Meta name="description" content="About the General E game platform." />
      <Meta property="og:title" content="About — General E" />
      <Meta property="og:description" content="About the General E game platform." />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />
      <h1>About</h1>
    </main>
  );
}
