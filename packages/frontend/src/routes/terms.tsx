import { Title, Meta } from "@solidjs/meta";
import { PLATFORM_NAME } from "~/config";

export default function TermsPage() {
  return (
    <main class="max-w-3xl mx-auto px-6 py-10 text-sm text-base-content/80 leading-relaxed space-y-4">
      <Title>Terms of Service — {PLATFORM_NAME}</Title>
      <Meta name="description" content={`Terms of Service for ${PLATFORM_NAME}.`} />
      <h1 class="text-xl text-primary font-press-start mb-6">Terms of Service</h1>
      <p>Last updated: 2026-06-29</p>
      <section>
        <h2 class="text-base text-base-content font-semibold mt-6 mb-2">1. Acceptance of Terms</h2>
        <p>By accessing or using {PLATFORM_NAME}, you agree to be bound by these Terms of Service. If you do not agree, do not use the service.</p>
      </section>
      <section>
        <h2 class="text-base text-base-content font-semibold mt-6 mb-2">2. Description of Service</h2>
        <p>{PLATFORM_NAME} provides an online multiplayer gaming platform. Users may create accounts, join games, and interact with other players.</p>
      </section>
      <section>
        <h2 class="text-base text-base-content font-semibold mt-6 mb-2">3. User Accounts</h2>
        <p>You are responsible for maintaining the confidentiality of your account credentials. You must not share your account or allow others to access it.</p>
      </section>
      <section>
        <h2 class="text-base text-base-content font-semibold mt-6 mb-2">4. Acceptable Use</h2>
        <p>You agree not to: (a) exploit bugs or cheat, (b) harass other users, (c) disrupt the service, (d) use automated tools or bots.</p>
      </section>
      <section>
        <h2 class="text-base text-base-content font-semibold mt-6 mb-2">5. Limitation of Liability</h2>
        <p>{PLATFORM_NAME} is provided "as is" without warranties. We are not liable for any damages arising from your use of the service.</p>
      </section>
      <section>
        <h2 class="text-base text-base-content font-semibold mt-6 mb-2">6. Changes</h2>
        <p>We may update these terms at any time. Continued use after changes constitutes acceptance of the new terms.</p>
      </section>
    </main>
  );
}
