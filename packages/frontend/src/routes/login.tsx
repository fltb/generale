import { useAuth } from "~/hooks/useAuth";
import { useNavigate, A } from "@solidjs/router";
import { createSignal } from "solid-js";

export default function LoginPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");

  const handleLogin = async (e: Event) => {
    e.preventDefault();
    try {
      await auth.login({ username: username(), password: password() });
      nav("/profile");
    } catch (err: any) {
      setError(err.message || "登录失败");
    }
  };

  return (
    <div class="p-4 max-w-md mx-auto">
      <h1 class="text-2xl mb-4">登录</h1>
      <form onSubmit={handleLogin} class="flex flex-col gap-2">
        <input
          placeholder="用户名"
          value={username()}
          onInput={(e) => setUsername(e.currentTarget.value)}
          class="input input-bordered"
        />
        <input
          type="password"
          placeholder="密码"
          value={password()}
          onInput={(e) => setPassword(e.currentTarget.value)}
          class="input input-bordered"
        />
        <button type="submit" class="btn btn-primary">登录</button>
      </form>
      <p class="text-red-500">{error()}</p>
      <A href="/register" class="link">还没有账号？去注册</A>
    </div>
  );
}
