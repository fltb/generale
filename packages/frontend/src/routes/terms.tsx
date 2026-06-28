import { Title, Meta } from "@solidjs/meta";
import type { JSX } from "solid-js";
import { PLATFORM_NAME } from "~/config";
import { useT } from "~/i18n/useT";

export default function TermsPage() {
  const { t } = useT();
  return (
    <main class="max-w-3xl mx-auto px-6 py-10 text-sm text-base-content/80 leading-relaxed space-y-4">
      <Title>{t("Terms of Service")} — {PLATFORM_NAME}</Title>
      <Meta name="description" content={t("Terms of Service for {name}, an online multiplayer game platform.", { name: PLATFORM_NAME })} />
      <Meta property="og:title" content={t("Terms of Service") + " — " + PLATFORM_NAME} />
      <Meta property="og:description" content={t("Terms of Service for {name}.", { name: PLATFORM_NAME })} />
      <h1 class="text-xl text-primary font-press-start mb-6">{t("Terms of Service")}</h1>
      <p class="text-xs text-base-content/50">{t("Last updated: June 29, 2026")}</p>

      <p>{t("Terms welcome", { name: PLATFORM_NAME })}</p>

      <Section title={t("1. The Service")}>
        <p>{t("Terms service desc", { name: PLATFORM_NAME })}</p>
        <p>{t("Terms service as is")}</p>
      </Section>

      <Section title={t("2. Eligibility")}>
        <p>{t("Terms eligibility")}</p>
      </Section>

      <Section title={t("3. Accounts")}>
        <p>{t("Terms accounts 1")}</p>
        <p>{t("Terms accounts 2")}</p>
      </Section>

      <Section title={t("4. Acceptable Use")}>
        <p>{t("Terms acceptable use intro")}</p>
        <ul class="list-disc pl-5 space-y-1">
          <li>{t("Terms au exploit")}</li>
          <li>{t("Terms au automation")}</li>
          <li>{t("Terms au harassment")}</li>
          <li>{t("Terms au content")}</li>
          <li>{t("Terms au disruption")}</li>
          <li>{t("Terms au reverse")}</li>
        </ul>
      </Section>

      <Section title={t("5. User-Generated Content")}>
        <p>{t("Terms ugc 1")}</p>
        <p>{t("Terms ugc 2", { name: PLATFORM_NAME })}</p>
        <p>{t("Terms ugc 3")}</p>
      </Section>

      <Section title={t("6. Open Source")}>
        <p>{t("Terms opensource", { name: PLATFORM_NAME })}</p>
      </Section>

      <Section title={t("7. Privacy")}>
        <p>{t("Terms privacy 1")}</p>
        <p>{t("Terms privacy 2")}</p>
      </Section>

      <Section title={t("8. Third-Party Services")}>
        <p>{t("Terms thirdparty", { name: PLATFORM_NAME })}</p>
      </Section>

      <Section title={t("9. Limitation of Liability")}>
        <p>{t("Terms liability 1", { name: PLATFORM_NAME })}</p>
        <p>{t("Terms liability 2")}</p>
      </Section>

      <Section title={t("10. Termination")}>
        <p>{t("Terms termination 1")}</p>
        <p>{t("Terms termination 2")}</p>
      </Section>

      <Section title={t("11. Changes")}>
        <p>{t("Terms changes")}</p>
      </Section>

      <Section title={t("12. Contact")}>
        <p>{t("Terms contact")}</p>
      </Section>
    </main>
  );
}

function Section(props: { title: string; children: JSX.Element }) {
  return (
    <section>
      <h2 class="text-base text-base-content font-semibold mt-6 mb-2">{props.title}</h2>
      {props.children}
    </section>
  );
}
