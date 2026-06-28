import { Title, Meta } from "@solidjs/meta";
import type { JSX } from "solid-js";
import { PLATFORM_NAME } from "~/config";

export default function TermsPage() {
  return (
    <main class="max-w-3xl mx-auto px-6 py-10 text-sm text-base-content/80 leading-relaxed space-y-4">
      <Title>Terms of Service — {PLATFORM_NAME}</Title>
      <Meta name="description" content={`Terms of Service for ${PLATFORM_NAME}, an online multiplayer game platform.`} />
      <Meta property="og:title" content={`Terms of Service — ${PLATFORM_NAME}`} />
      <Meta property="og:description" content={`Terms of Service for ${PLATFORM_NAME}.`} />
      <h1 class="text-xl text-primary font-press-start mb-6">Terms of Service</h1>
      <p class="text-xs text-base-content/50">Last updated: June 29, 2026</p>

      <p>Welcome to {PLATFORM_NAME}. By accessing or using our service, you agree to be bound by these Terms. If you do not agree, do not use the service.</p>

      <Section title="1. The Service">
        <p>{PLATFORM_NAME} provides an online multiplayer gaming platform ("the Service"). Users may create accounts, create and share custom game content, join multiplayer sessions, and interact with other players.</p>
        <p>The Service is provided "as is" and may be updated or modified at any time without prior notice.</p>
      </Section>

      <Section title="2. Eligibility">
        <p>You must be at least 13 years of age to use the Service. By creating an account, you represent that you meet this requirement. If you are under 13, a parent or guardian must supervise your use.</p>
      </Section>

      <Section title="3. Accounts">
        <p>You are responsible for safeguarding your account credentials. You may not share your account, allow others to access it, or use another person's account.</p>
        <p>You must provide accurate information when creating an account. Usernames may be changed under our display name policy but must not be misleading, impersonate others, or contain offensive content.</p>
      </Section>

      <Section title="4. Acceptable Use">
        <p>You agree not to:</p>
        <ul class="list-disc pl-5 space-y-1">
          <li>Exploit bugs, glitches, or design errors for unfair advantage</li>
          <li>Use automated tools, bots, or scripts to interact with the Service</li>
          <li>Harass, threaten, or abuse other players</li>
          <li>Post or share content that is illegal, offensive, or violates others' rights</li>
          <li>Attempt to disrupt, overload, or damage the Service</li>
          <li>Reverse engineer, decompile, or extract the source code of the Service</li>
        </ul>
      </Section>

      <Section title="5. User-Generated Content">
        <p>The Service allows you to create and share custom maps and other game content ("User Content"). You retain ownership of your User Content.</p>
        <p>By sharing User Content on the Service, you grant {PLATFORM_NAME} a non-exclusive, royalty-free, worldwide license to host, store, display, and distribute your content for the purpose of operating the Service.</p>
        <p>You represent that your User Content does not infringe any third-party rights. We reserve the right to remove any User Content that violates these Terms.</p>
      </Section>

      <Section title="6. Open Source">
        <p>The software powering {PLATFORM_NAME} is open source. Nothing in these Terms restricts your rights under applicable open source licenses. The availability of source code does not grant permission to operate competing services or to use our trademarks.</p>
      </Section>

      <Section title="7. Privacy">
        <p>We collect minimal data necessary to operate the Service: account credentials (email, username, hashed password), game statistics, and user-generated content. We do not sell your personal data.</p>
        <p>We use third-party services (DiceBear for avatar generation) that may process data according to their own policies. We recommend reviewing their privacy practices.</p>
      </Section>

      <Section title="8. Third-Party Services">
        <p>The Service uses DiceBear (avatars), Google Fonts (typography), and other third-party services. These services have their own terms and policies. {PLATFORM_NAME} is not responsible for the operation of these third-party services.</p>
      </Section>

      <Section title="9. Limitation of Liability">
        <p>To the maximum extent permitted by law, {PLATFORM_NAME} and its operators are not liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>
        <p>The Service is provided "as is" without warranties of any kind, either express or implied.</p>
      </Section>

      <Section title="10. Termination">
        <p>We may suspend or terminate your account at any time for violating these Terms. You may delete your account at any time by contacting us.</p>
        <p>Upon termination, your right to use the Service ceases immediately. User Content may be removed at our discretion.</p>
      </Section>

      <Section title="11. Changes">
        <p>We may update these Terms at any time. Changes will be posted on this page with an updated "Last updated" date. Continued use of the Service after changes constitutes acceptance of the new Terms.</p>
      </Section>

      <Section title="12. Contact">
        <p>For questions about these Terms or to report violations, please open an issue on our GitHub repository or contact us through the project page.</p>
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
