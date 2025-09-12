import { useAuth } from "~/hooks/useAuth";
import { createSignal } from "solid-js";

export default function RegisterPage() {
  const auth = useAuth();
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [code, setCode] = createSignal("");
  const [step, setStep] = createSignal<"form" | "verify">("form");
  const [message, setMessage] = createSignal("");

  const handleRegister = async (e: Event) => {
    e.preventDefault();
    try {
      const res = await auth.register({
        username: username(),
        password: password(),
        email: email(),
      });
      setMessage(res.message);
      setStep("verify");
    } catch (err: any) {
      setMessage(err.message || "注册失败");
    }
  };

  const handleVerify = async () => {
    try {
      const res = await auth.verify({ email: email(), code: code() });
      if (res.success) {
        setMessage("验证成功，请前往登录");
      } else {
        setMessage(res.message);
      }
    } catch {
      setMessage("验证失败");
    }
  };

  return (
    <div class="p-4 max-w-md mx-auto">
      <h1 class="text-2xl mb-4">注册</h1>

      {step() === "form" && (
        <form onSubmit={handleRegister} class="flex flex-col gap-2">
          <input
            placeholder="用户名"
            value={username()}
            onInput={(e) => setUsername(e.currentTarget.value)}
            class="input input-bordered"
          />
          <input
            placeholder="邮箱"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
            class="input input-bordered"
          />
          <input
            type="password"
            placeholder="密码"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            class="input input-bordered"
          />
          <button type="submit" class="btn btn-primary">
            注册
          </button>
        </form>
      )}

      {step() === "verify" && (
        <div class="flex flex-col gap-2">
          <input
            placeholder="验证码"
            value={code()}
            onInput={(e) => setCode(e.currentTarget.value)}
            class="input input-bordered"
          />
          <button onClick={handleVerify} class="btn btn-primary">
            提交验证码
          </button>
        </div>
      )}

      <p class="mt-2 text-green-600">{message()}</p>
    </div>
  );
}
