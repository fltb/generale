import { useAuth } from "~/hooks/useAuth";
import { useNavigate, A } from "@solidjs/router";
import { createSignal, Show } from "solid-js";

type Tab = "login" | "register";

/**
 * 单页认证：包含登录与注册（含验证码验证）两块，使用 Tab 切换
 * 修改点：在验证码验证成功后尝试自动登录并跳转到 /profile
 */
export default function LoginPage() {
  const auth = useAuth();
  const nav = useNavigate();

  // Tab 控制
  const [tab, setTab] = createSignal<Tab>("login");

  // -------- 登录状态 ----------
  const [loginUsername, setLoginUsername] = createSignal("");
  const [loginPassword, setLoginPassword] = createSignal("");
  const [loginError, setLoginError] = createSignal("");
  const [loginLoading, setLoginLoading] = createSignal(false);

  // -------- 注册状态 ----------
  const [regUsername, setRegUsername] = createSignal("");
  const [regPassword, setRegPassword] = createSignal("");
  const [regEmail, setRegEmail] = createSignal("");
  const [regMessage, setRegMessage] = createSignal("");
  const [regSent, setRegSent] = createSignal(false);
  const [regLoading, setRegLoading] = createSignal(false);

  /**
   * 处理登录提交
   */
  const handleLogin = async (e: Event) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      await auth.login({
        username: loginUsername(),
        password: loginPassword(),
      });
      // try {
      //   if (!wsManager.isConnected) {
      //     // true 表示尝试使用已有 connectionId 进行 reattach
      //     wsManager.connect(true);
      //   }
      //   // 可选：立即请求打开你常用的 domain（会被入队并在连接后发送）
      //   // wsManager.openDomain("room"); // 举例：打开 room domain
      // } catch (wsErr) {
      //   console.warn("WebSocket connect/open failed:", wsErr);
      //   // 不要阻塞用户登录流程：仅记录或展示非致命提示
      // }
      console.log("try nav")
      nav("/");
      console.log("nav called");
    } catch (err: any) {
      setLoginError(err?.message || "登录失败");
    } finally {
      setLoginLoading(false);
    }
  };

  /**
   * 注册：服务端落库 unverified 用户并发可点击链接到邮箱。
   * 不再有验证码回填步骤——用户去邮箱点链接完成。
   */
  const handleRegister = async (e: Event) => {
    e.preventDefault();
    setRegMessage("");
    setRegLoading(true);
    try {
      const res = await auth.register({
        username: regUsername(),
        password: regPassword(),
        email: regEmail(),
      });
      setRegMessage(res?.message || "验证链接已发送，请查收邮箱后点击链接完成验证");
      setRegSent(true);
    } catch (err: any) {
      setRegMessage(err?.message || "注册失败");
    } finally {
      setRegLoading(false);
    }
  };

  // 切换 tab 时清理相关提示（可按需调整）
  const switchTo = (t: Tab) => {
    setTab(t);
    setLoginError("");
    setRegMessage("");
    setRegSent(false);
  };

  return (
    <div class="p-4 max-w-md mx-auto">
      <h1 class="text-2xl mb-4">账户</h1>

      {/* Tab 控制 */}
      <div class="tabs mb-4">
        <button
          class={`tab ${tab() === "login" ? "tab-active" : ""}`}
          onClick={() => switchTo("login")}
          aria-pressed={tab() === "login"}
        >
          登录
        </button>
        <button
          class={`tab ${tab() === "register" ? "tab-active" : ""}`}
          onClick={() => switchTo("register")}
          aria-pressed={tab() === "register"}
        >
          注册
        </button>
      </div>

      {/* 登录表单 */}
      <Show when={tab() === "login"}>
        <form onSubmit={handleLogin} class="flex flex-col gap-2">
          <input
            placeholder="用户名或邮箱"
            value={loginUsername()}
            onInput={(e) => setLoginUsername(e.currentTarget.value)}
            class="input input-bordered"
            autocomplete="username"
            required
          />
          <input
            type="password"
            placeholder="密码"
            value={loginPassword()}
            onInput={(e) => setLoginPassword(e.currentTarget.value)}
            class="input input-bordered"
            autocomplete="current-password"
            required
          />
          <button
            type="submit"
            class="btn btn-primary"
            disabled={loginLoading()}
          >
            {loginLoading() ? "登录中..." : "登录"}
          </button>
        </form>
        <p class="mt-2 text-red-500">{loginError()}</p>
        <p class="mt-2 text-sm">
          <A href="/forgot-password" class="link">忘记密码？</A>
        </p>
        <p class="mt-2">
          还没有账号？{" "}
          <button class="link" onClick={() => switchTo("register")}>
            去注册
          </button>
        </p>
      </Show>

      {/* 注册表单：提交后服务端发可点击链接到邮箱，用户去邮箱点链接完成验证 */}
      <Show when={tab() === "register"}>
        <div class="flex flex-col gap-2">
          <Show
            when={!regSent()}
            fallback={
              <div class="space-y-3">
                <div class="alert alert-success">
                  {regMessage() || "验证链接已发送，请查收邮箱后点击链接完成验证"}
                </div>
                <p class="text-sm opacity-70">
                  查看邮箱（包括垃圾邮件），点击邮件里的链接即可激活账号。链接 10 分钟内有效。
                </p>
                <div class="flex gap-2">
                  <button class="btn btn-ghost btn-sm" onClick={() => switchTo("login")}>返回登录</button>
                  <button class="btn btn-sm" onClick={() => { setRegSent(false); setRegMessage(""); }}>
                    重新填写注册信息
                  </button>
                </div>
              </div>
            }
          >
            <form onSubmit={handleRegister} class="flex flex-col gap-2">
              <input
                placeholder="用户名"
                value={regUsername()}
                onInput={(e) => setRegUsername(e.currentTarget.value)}
                class="input input-bordered"
                autocomplete="username"
                required
              />
              <input
                placeholder="邮箱"
                value={regEmail()}
                onInput={(e) => setRegEmail(e.currentTarget.value)}
                class="input input-bordered"
                type="email"
                autocomplete="email"
                required
              />
              <input
                type="password"
                placeholder="密码"
                value={regPassword()}
                onInput={(e) => setRegPassword(e.currentTarget.value)}
                class="input input-bordered"
                autocomplete="new-password"
                required
              />
              <button
                type="submit"
                class="btn btn-primary"
                disabled={regLoading()}
              >
                {regLoading() ? "提交中..." : "注册"}
              </button>
              <Show when={regMessage()}>
                <p class="mt-2 text-sm text-error">{regMessage()}</p>
              </Show>
            </form>
          </Show>

          <p class="mt-2">
            已有账号？{" "}
            <button class="link" onClick={() => switchTo("login")}>
              去登录
            </button>
          </p>
        </div>
      </Show>
    </div>
  );
}
