import { useLocation } from "@solidjs/router";

export default function Nav() {
  const location = useLocation();
  const active = (path: string) =>
    path == location.pathname ? "border-sky-600" : "border-transparent hover:border-sky-600";
  return (
    <nav class="bg-sky-800">
      <ul class="container flex items-center p-3 text-gray-200">
        <li class={`border-b-2 ${active("/")} mx-1.5 sm:mx-6`}>
          <a href="/">Home</a>
        </li>
        <li class={`border-b-2 ${active("/about")} mx-1.5 sm:mx-6`}>
          <a href="/about">About</a>
        </li>
                <li class={`border-b-2 ${active("/login")} mx-1.5 sm:mx-6`}>
          <a href="/login">Login</a>
        </li>
                <li class={`border-b-2 ${active("/register")} mx-1.5 sm:mx-6`}>
          <a href="/register">Register</a>
        </li>
                <li class={`border-b-2 ${active("/test")} mx-1.5 sm:mx-6`}>
          <a href="/test">Test</a>
        </li>

      </ul>
    </nav>
  );
}
