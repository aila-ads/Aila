import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalDocument, type LegalSection } from '../../components/legal/legal-document';
import { LEGAL } from '../../components/legal/legal-facts';

export const metadata: Metadata = {
  title: 'Privacy Policy · Aila',
  description: 'How Aila collects, uses, shares and protects your personal information.',
};

const mail = <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;

const sections: readonly LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          Aila is an AI workspace operated by {LEGAL.operator}, a business name registered with the
          Corporate Affairs Commission in Nigeria and founded by {LEGAL.founder}. In this policy,
          “Aila”, “we”, “us” and “our” mean {LEGAL.operator}.
        </p>
        <p>
          We are the data controller for the personal information described in this policy. This
          means we decide why and how it is used, and we are responsible for protecting it.
        </p>
        <address>
          {LEGAL.operator}
          <br />
          {LEGAL.address}
          <br />
          Email: {mail}
          <br />
          Website: <a href={LEGAL.website}>{LEGAL.website.replace('https://', '')}</a>
        </address>
      </>
    ),
  },
  {
    id: 'scope',
    title: 'What this policy covers',
    body: (
      <p>
        This policy applies to the Aila website at {LEGAL.website.replace('https://', '')} and to
        every Aila product you use through your Aila account, including Aila Intelligence (chat
        with file attachments and voice input) and the products we add later. It should be read
        together with our <Link href="/terms">Terms of Service</Link>.
      </p>
    ),
  },
  {
    id: 'information-we-collect',
    title: 'Information we collect',
    body: (
      <>
        <h3>Information you give us</h3>
        <ul>
          <li>
            <strong>Account details:</strong> your name, email address and password when you
            create an account. Passwords are handled by our sign-in provider and are never stored
            by Aila in readable form. If you choose to sign in with Google, we receive your name
            and email address from Google.
          </li>
          <li>
            <strong>Your content:</strong> the messages you write, the files you attach, the voice
            recordings you make for voice input, and the replies Aila generates for you.
          </li>
          <li>
            <strong>Settings:</strong> preferences such as your language and time zone.
          </li>
          <li>
            <strong>Messages to us:</strong> anything you include when you email us, for example
            about support, a refund or deleting your account.
          </li>
        </ul>
        <h3>Information created when you use Aila</h3>
        <ul>
          <li>
            <strong>Billing records:</strong> your plan, trial and subscription status, the
            amount, currency and date of each payment, and the reference numbers our payment
            providers give us. We never receive or store your full card number.
          </li>
          <li>
            <strong>Sign-in and device information:</strong> the sessions you are signed in to and
            the type of device and browser used for each, so you can review them and sign out of
            them in your settings.
          </li>
          <li>
            <strong>Usage records:</strong> information such as when you make AI requests and how
            much of the service you use, so we can apply plan limits, keep the service reliable
            and control costs. These records describe your usage; they do not copy your content.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: 'How we use your information',
    body: (
      <>
        <p>We use your information only to:</p>
        <ul>
          <li>create and secure your account and let you sign in;</li>
          <li>
            provide Aila’s features, including sending your messages, files and voice recordings
            for AI processing and saving your conversations so you can return to them;
          </li>
          <li>run your free trial, process payments and give you the Aila Pro access you paid for;</li>
          <li>apply usage limits and detect and prevent fraud, abuse and security incidents;</li>
          <li>answer your questions and support requests;</li>
          <li>send you essential emails, such as sign-in codes and password resets;</li>
          <li>meet our legal, tax and accounting obligations.</li>
        </ul>
        <p>
          We do not sell your personal information, we do not show advertising, and we do not use
          your content to train AI models.
        </p>
      </>
    ),
  },
  {
    id: 'legal-bases',
    title: 'Our legal bases',
    body: (
      <>
        <p>
          Under the Nigeria Data Protection Act 2023 (NDPA), and similar laws elsewhere, we rely
          on the following legal bases:
        </p>
        <ul>
          <li>
            <strong>Contract:</strong> most processing is needed to provide the service you signed
            up for, as described in our <Link href="/terms">Terms of Service</Link>.
          </li>
          <li>
            <strong>Legal obligation:</strong> for example, keeping billing records that tax and
            accounting laws require.
          </li>
          <li>
            <strong>Legitimate interests:</strong> keeping Aila secure, preventing abuse and
            improving reliability, in ways that do not override your rights.
          </li>
          <li>
            <strong>Consent:</strong> where we ask for it, such as a parent or guardian’s consent
            for a user under 18. You can withdraw consent at any time.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'ai-processing',
    title: 'How AI requests are processed',
    body: (
      <>
        <p>
          When you use Aila Intelligence, your message, any files you attach and the earlier
          messages in that conversation are sent through OpenRouter, a service that routes AI
          requests to model providers such as Google, DeepSeek and Qwen. Voice recordings are
          processed in the same way to turn your speech into text.
        </p>
        <p>
          We configure these requests so that model providers are not permitted to collect your
          data for their own purposes. Aila does not use your content to train AI models.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Who we share information with',
    body: (
      <>
        <p>
          We share personal information only with service providers that help us run Aila, and
          only as much as each one needs:
        </p>
        <ul>
          <li>
            <strong>Neon</strong> for accounts and sign-in, our database and file storage;
          </li>
          <li>
            <strong>Vercel</strong> for hosting the Aila website and application;
          </li>
          <li>
            <strong>OpenRouter</strong> and the model providers it routes to, for AI processing;
          </li>
          <li>
            <strong>Flutterwave, Paystack and PayPal</strong> for payments, if you buy Aila Pro.
            They process your payment details under their own privacy policies;
          </li>
          <li>
            <strong>Google</strong>, only if you choose to sign in with Google.
          </li>
        </ul>
        <p>
          We may also disclose information when the law requires it, to protect the rights,
          safety or property of our users, the public or Aila, or as part of a sale or
          reorganisation of our business, in which case this policy will continue to apply to your
          information.
        </p>
      </>
    ),
  },
  {
    id: 'international-transfers',
    title: 'Where your information is stored',
    body: (
      <p>
        Your account, conversations and files are stored with Neon in the United States (AWS
        us-east-2). Our other service providers may also process information outside Nigeria. When
        we transfer personal information abroad, we do so as the NDPA and other applicable laws
        allow, and we choose providers that protect it with appropriate safeguards.
      </p>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep information',
    body: (
      <>
        <p>
          We keep your account information and content for as long as your account is open, so
          you can come back to your work.
        </p>
        <ul>
          <li>
            You can delete individual conversations and files in Aila at any time, and they are
            removed from your account.
          </li>
          <li>
            You can ask us to delete your account by emailing {mail} from the email address on the
            account. We will confirm the request and then delete your account and its content.
          </li>
          <li>
            We keep billing records for as long as tax, accounting and other laws require, even
            after an account is deleted.
          </li>
          <li>
            We keep other records, such as security logs, only for as long as needed for the
            purposes in this policy.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'security',
    title: 'How we protect information',
    body: (
      <p>
        Connections to Aila are encrypted. Your files are kept in private storage and can only be
        reached through your signed-in account. Access to your data is checked on our servers for
        every request, and we limit what we record in logs. No online service can be perfectly
        secure, so please use a strong password and tell us at {mail} if you think your account has
        been compromised. If a breach affects your personal information, we will notify you and the
        authorities as the law requires.
      </p>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies',
    body: (
      <p>
        Aila uses only essential cookies that keep you signed in and protect your session. We do
        not use advertising cookies, analytics trackers or cross-site tracking. Because these
        cookies are needed for the service to work, there is no cookie banner; if you block them,
        you will not be able to sign in.
      </p>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights',
    body: (
      <>
        <p>Under the NDPA, you have the right to:</p>
        <ul>
          <li>be told how your personal information is used, as this policy does;</li>
          <li>get a copy of the personal information we hold about you;</li>
          <li>have inaccurate information corrected;</li>
          <li>have your information deleted;</li>
          <li>restrict or object to certain processing;</li>
          <li>receive your information in a portable format;</li>
          <li>withdraw consent where we rely on it;</li>
          <li>
            complain to the Nigeria Data Protection Commission if you believe we have not handled
            your information properly.
          </li>
        </ul>
        <p>
          If you live outside Nigeria, for example in the European Union or the United Kingdom, you
          have similar rights under the General Data Protection Regulation (GDPR) or your local
          law, including the right to complain to your local data protection authority.
        </p>
        <p>
          You can update your name and preferences, and delete conversations and files, yourself in
          Aila. For anything else, email {mail}. We may need to confirm your identity first, and we
          will reply within the time the law requires.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        You must be at least 13 years old to use Aila. If you are under 18, you may use Aila only
        with the consent of a parent or guardian. If you believe a child under 13 has given us
        personal information, please contact us at {mail} and we will delete it.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        We may update this policy as Aila changes or the law requires. We will change the “Last
        updated” date above, and if a change is significant we will tell you by email or in Aila
        before it takes effect.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: (
      <p>
        For any question about this policy or your personal information, email {mail} or write to{' '}
        {LEGAL.operator}, {LEGAL.address}.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what personal information Aila collects, why we collect it, who we
          share it with and the choices you have. We have tried to keep it short and in plain
          English.
        </p>
      }
      sections={sections}
    />
  );
}
