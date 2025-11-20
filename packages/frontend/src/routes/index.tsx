import { Title } from "@solidjs/meta";
import Counter from "~/components/Counter";
import { ProtectedRoute } from "~/components/ProtectedRoute";

export default function Home() {
  return (
    <ProtectedRoute>
      <main>
        <Title>Hello World</Title>
        <h1>Hello world!</h1>
        <Counter />
        <p>
          Visit{" "}
          <a href="https://start.solidjs.com" target="_blank">
            start.solidjs.com
          </a>{" "}
          to learn how to build SolidStart apps.
        </p>
      </main>
    </ProtectedRoute>
  );
}
