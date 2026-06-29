import { createSignal, Show } from "solid-js";
import { PLATFORM_NAME } from "~/config";
import { useT } from "~/i18n/useT";

const STORAGE_KEY = "generale.cookie-consent";

export default function CookieConsent() {
  const { t } = useT();
  const [accepted, setAccepted] = createSignal(localStorage.getItem(STORAGE_KEY) === "true");

  function handleAccept() {
    localStorage.setItem(STORAGE_KEY, "true");
    setAccepted(true);
  }

  return (
    <Show when={!accepted()}>
      <div class="fixed bottom-0 left-0 right-0 z-50 bg-base-100 border-t-2 border-base-300 px-6 py-3 flex items-center justify-between gap-4 text-sm">
        <p class="text-base-content/70">
          {t("Cookie consent text", { name: PLATFORM_NAME })}{" "}
          <a href="/terms" class="text-primary hover:underline">
            {t("Learn more")}
          </a>
          .
        </p>
        <button
          type="button"
          onClick={handleAccept}
          class="shrink-0 px-4 py-1.5 bg-primary text-primary-content text-sm"
        >
          {t("Got it")}
        </button>
      </div>
    </Show>
  );
}
