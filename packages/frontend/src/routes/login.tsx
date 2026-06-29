import { Title, Meta } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { useT } from "../i18n/useT";
import { useAuth } from "~/hooks/useAuth";

type Tab = "login" | "register";

export default function LoginPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const { t } = useT();

  const [tab, setTab] = createSignal<Tab>("login");

  const [loginUsername, setLoginUsername] = createSignal("");
  const [loginPassword, setLoginPassword] = createSignal("");
  const [loginError, setLoginError] = createSignal("");
  const [loginLoading, setLoginLoading] = createSignal(false);

  const [regUsername, setRegUsername] = createSignal("");
  const [regPassword, setRegPassword] = createSignal("");
  const [regEmail, setRegEmail] = createSignal("");
  const [regMessage, setRegMessage] = createSignal("");
  const [regSent, setRegSent] = createSignal(false);
  const [regLoading, setRegLoading] = createSignal(false);
  const [regAcceptedTerms, setRegAcceptedTerms] = createSignal(false);

  const handleLogin = async (e: Event) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      await auth.login({
        username: loginUsername(),
        password: loginPassword(),
      });
      console.log("try nav");
      nav("/");
      console.log("nav called");
    } catch (err: unknown) {
      setLoginError((err as Error)?.message || t("Login failed"));
    } finally {
      setLoginLoading(false);
    }
  };

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
      setRegMessage(res?.message || t("Verification link sent, please check your email"));
      setRegSent(true);
    } catch (err: unknown) {
      setRegMessage((err as Error)?.message || t("Registration failed"));
    } finally {
      setRegLoading(false);
    }
  };

  const switchTo = (t: Tab) => {
    setTab(t);
    setLoginError("");
    setRegMessage("");
    setRegSent(false);
  };

  return (
    <div class="p-4 max-w-md mx-auto">
      <Title>
        {t("Login")} — {t("General E")}
      </Title>
      <Meta name="description" content={t("Sign in to your account.")} />
      <Meta property="og:title" content={`${t("Login")} — ${t("General E")}`} />
      <Meta property="og:description" content={t("Sign in to your account.")} />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />
      <h1 class="text-2xl mb-4">{t("Account")}</h1>

      <div class="tabs mb-4">
        <button
          type="button"
          class={`tab ${tab() === "login" ? "tab-active" : ""}`}
          onClick={() => switchTo("login")}
          aria-pressed={tab() === "login"}
        >
          {t("Login")}
        </button>
        <button
          type="button"
          class={`tab ${tab() === "register" ? "tab-active" : ""}`}
          onClick={() => switchTo("register")}
          aria-pressed={tab() === "register"}
        >
          {t("Register")}
        </button>
      </div>

      <Show when={tab() === "login"}>
        <form onSubmit={handleLogin} class="flex flex-col gap-2">
          <input
            data-testid="login-username"
            placeholder={t("Username or email")}
            value={loginUsername()}
            onInput={(e) => setLoginUsername(e.currentTarget.value)}
            class="input input-bordered"
            autocomplete="username"
            required
          />
          <input
            data-testid="login-password"
            type="password"
            placeholder={t("Password")}
            value={loginPassword()}
            onInput={(e) => setLoginPassword(e.currentTarget.value)}
            class="input input-bordered"
            autocomplete="current-password"
            required
          />
          <button data-testid="login-submit" type="submit" class="btn btn-primary" disabled={loginLoading()}>
            {loginLoading() ? t("Logging in...") : t("Login")}
          </button>
        </form>
        <p class="mt-2 text-red-500">{loginError()}</p>
        <p class="mt-2 text-sm">
          <A href="/forgot-password" class="link">
            {t("Forgot password?")}
          </A>
        </p>
        <p class="mt-2">
          {t("No account yet?")}{" "}
          <button type="button" class="link" onClick={() => switchTo("register")}>
            {t("Register here")}
          </button>
        </p>
      </Show>

      <Show when={tab() === "register"}>
        <div class="flex flex-col gap-2">
          <Show
            when={!regSent()}
            fallback={
              <div class="space-y-3">
                <div class="alert alert-success">
                  {regMessage() || t("Verification link sent, please check your email")}
                </div>
                <p class="text-sm opacity-70">
                  {t(
                    "Check your email (including spam) and click the link to activate your account. The link expires in 10 minutes.",
                  )}
                </p>
                <div class="flex gap-2">
                  <button type="button" class="btn btn-ghost btn-sm" onClick={() => switchTo("login")}>
                    {t("Back to login")}
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm"
                    onClick={() => {
                      setRegSent(false);
                      setRegMessage("");
                    }}
                  >
                    {t("Re-enter registration info")}
                  </button>
                </div>
              </div>
            }
          >
            <form onSubmit={handleRegister} class="flex flex-col gap-2">
              <input
                placeholder={t("Username")}
                value={regUsername()}
                onInput={(e) => setRegUsername(e.currentTarget.value)}
                class="input input-bordered"
                autocomplete="username"
                required
              />
              <input
                placeholder={t("Email")}
                value={regEmail()}
                onInput={(e) => setRegEmail(e.currentTarget.value)}
                class="input input-bordered"
                type="email"
                autocomplete="email"
                required
              />
              <input
                type="password"
                placeholder={t("Password")}
                value={regPassword()}
                onInput={(e) => setRegPassword(e.currentTarget.value)}
                class="input input-bordered"
                autocomplete="new-password"
                required
              />
              <label class="flex items-start gap-2 text-xs text-base-content/60">
                <input
                  type="checkbox"
                  checked={regAcceptedTerms()}
                  onChange={(e) => setRegAcceptedTerms(e.currentTarget.checked)}
                  class="checkbox checkbox-xs mt-0.5"
                />
                <span>
                  {t("I agree to the")}{" "}
                  <A href="/terms" class="link">
                    {t("Terms of Service")}
                  </A>
                </span>
              </label>
              <button type="submit" class="btn btn-primary" disabled={regLoading() || !regAcceptedTerms()}>
                {regLoading() ? t("Submitting...") : t("Register")}
              </button>
              <Show when={regMessage()}>
                <p class="mt-2 text-sm text-error">{regMessage()}</p>
              </Show>
            </form>
          </Show>

          <p class="mt-2">
            {t("Already have an account?")}{" "}
            <button type="button" class="link" onClick={() => switchTo("login")}>
              {t("Login here")}
            </button>
          </p>
        </div>
      </Show>
    </div>
  );
}
