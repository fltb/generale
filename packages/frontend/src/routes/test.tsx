import { useT } from "../i18n/useT";

export default function Test() {
  const { t } = useT();
  return (
    <main>
      <p>{t("Test page placeholder")}</p>
    </main>
  );
}
