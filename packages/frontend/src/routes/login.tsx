import { useAuth } from "~/hooks/useAuth";
import { useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { useWS } from "~/hooks/useWebsocket";

type Tab = "login" | "register";

/**
 * 单页认证：包含登录与注册（含验证码验证）两块，使用 Tab 切换
 * 修改点：在验证码验证成功后尝试自动登录并跳转到 /profile
 */
export default function LoginPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const wsManager = useWS();

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
  const [regCode, setRegCode] = createSignal("");
  const [regStep, setRegStep] = createSignal<"form" | "verify">("form");
  const [regMessage, setRegMessage] = createSignal("");
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
   * 处理注册提交（发送验证码 / 创建账号）
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
      // 假设后端返回 { message: string }
      setRegMessage(res?.message || "已发送验证码，请查收邮箱");
      setRegStep("verify");
    } catch (err: any) {
      setRegMessage(err?.message || "注册失败");
    } finally {
      setRegLoading(false);
    }
  };

  /**
   * 提交验证码以完成验证，并在验证成功后自动登录
   */
  const handleVerify = async () => {
    setRegLoading(true);
    setRegMessage("");
    try {
      const res = await auth.verify({ email: regEmail(), code: regCode() });
      if (res?.success) {
        setRegMessage("验证成功，正在为你自动登录…");

        // 尝试自动登录（使用刚才填写的用户名/密码）
        try {
          await auth.login({
            username: regUsername(),
            password: regPassword(),
          });
          // 自动登录成功，跳转到 /
          nav("/");
          return; // 已跳转，不再执行后续清理
        } catch (loginErr: any) {
          // 自动登录失败：提示用户并切回登录 tab（可按需改为留在当前页）
          setRegMessage(
            `验证成功，但自动登录失败，请手动登录。原因：${
              loginErr?.message || "未知错误"
            }`
          );
          setTab("login");
        }

        // 如果不自动跳转（自动登录失败或选择不自动登录），清理注册表单
        setRegUsername("");
        setRegPassword("");
        setRegEmail("");
        setRegCode("");
        setRegStep("form");
      } else {
        setRegMessage(res?.message || "验证失败");
      }
    } catch (err: any) {
      setRegMessage(err?.message || "验证失败");
    } finally {
      setRegLoading(false);
    }
  };

  // 切换 tab 时清理相关提示（可按需调整）
  const switchTo = (t: Tab) => {
    setTab(t);
    setLoginError("");
    setRegMessage("");
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
            placeholder="用户名"
            value={loginUsername()}
            onInput={(e) => setLoginUsername(e.currentTarget.value)}
            class="input input-bordered"
            required
          />
          <input
            type="password"
            placeholder="密码"
            value={loginPassword()}
            onInput={(e) => setLoginPassword(e.currentTarget.value)}
            class="input input-bordered"
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
        <p class="mt-2">
          还没有账号？{" "}
          <button class="link" onClick={() => switchTo("register")}>
            去注册
          </button>
        </p>
      </Show>

      {/* 注册表单 + 验证 */}
      <Show when={tab() === "register"}>
        <div class="flex flex-col gap-2">
          <Show when={regStep() === "form"}>
            <form onSubmit={handleRegister} class="flex flex-col gap-2">
              <input
                placeholder="用户名"
                value={regUsername()}
                onInput={(e) => setRegUsername(e.currentTarget.value)}
                class="input input-bordered"
                required
              />
              <input
                placeholder="邮箱"
                value={regEmail()}
                onInput={(e) => setRegEmail(e.currentTarget.value)}
                class="input input-bordered"
                type="email"
                required
              />
              <input
                type="password"
                placeholder="密码"
                value={regPassword()}
                onInput={(e) => setRegPassword(e.currentTarget.value)}
                class="input input-bordered"
                required
              />
              <button
                type="submit"
                class="btn btn-primary"
                disabled={regLoading()}
              >
                {regLoading() ? "提交中..." : "注册"}
              </button>
            </form>
          </Show>

          <Show when={regStep() === "verify"}>
            <div class="flex flex-col gap-2">
              <input
                placeholder="验证码"
                value={regCode()}
                onInput={(e) => setRegCode(e.currentTarget.value)}
                class="input input-bordered"
              />
              <div class="flex gap-2">
                <button
                  class="btn btn-primary"
                  onClick={(e) => {
                    e.preventDefault();
                    handleVerify();
                  }}
                  disabled={regLoading()}
                >
                  {regLoading() ? "验证中..." : "提交验证码"}
                </button>
                <button
                  class="btn"
                  onClick={(e) => {
                    e.preventDefault();
                    // 切回表单以便用户修改邮箱等信息并重新提交
                    setRegStep("form");
                  }}
                >
                  返回修改信息
                </button>
              </div>
            </div>
          </Show>

          <p class="mt-2 text-sm text-green-600">{regMessage()}</p>
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
