import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalDocument, type LegalSection } from '../../components/legal/legal-document';
import { LEGAL } from '../../components/legal/legal-facts';

export const metadata: Metadata = {
  title: 'Terms of Service · Aila',
  description: 'The terms that apply when you use Aila.',
};

const mail = <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;

const sections: readonly LegalSection[] = [
  {
    id: 'agreement',
    title: 'Agreement to these terms',
    body: (
      <>
        <p>
          These terms are an agreement between you and {LEGAL.operator}, a business name
          registered with the Corporate Affairs Commission in Nigeria, of {LEGAL.address} (“Aila”,
          “we”, “us”). They apply to the Aila website at {LEGAL.website.replace('https://', '')}{' '}
          and every Aila product you use through your account.
        </p>
        <p>
          By creating an account or using Aila, you agree to these terms and to our{' '}
          <Link href="/privacy">Privacy Policy</Link>, which explains how we handle your personal
          information. If you do not agree, please do not use Aila.
        </p>
      </>
    ),
  },
  {
    id: 'eligibility',
    title: 'Who can use Aila',
    body: (
      <p>
        You must be at least 13 years old to use Aila. If you are under 18, you may use Aila only
        with the consent of a parent or guardian, who agrees to these terms on your behalf and is
        responsible for your use of Aila, including any purchases.
      </p>
    ),
  },
  {
    id: 'account',
    title: 'Your account',
    body: (
      <ul>
        <li>Give accurate information when you sign up and keep your email address current.</li>
        <li>
          Keep your password and sign-in codes private. You are responsible for everything done
          through your account.
        </li>
        <li>
          Tell us straight away at {mail} if you think someone else has used your account. You can
          also sign out of other devices in your account settings.
        </li>
        <li>An account is for one person and may not be shared or transferred.</li>
      </ul>
    ),
  },
  {
    id: 'service',
    title: 'The Aila service',
    body: (
      <p>
        Aila is an AI workspace. Today it includes Aila Intelligence, a chat assistant that can
        work with files you attach and with voice input, and we plan to add more products. We may
        add, change or remove features over time. If we remove a feature you have paid for, we
        will tell you and, where it is fair to do so, offer a remedy such as extending your paid
        period. We work to keep Aila available, but it may sometimes be interrupted for
        maintenance or by problems outside our control.
      </p>
    ),
  },
  {
    id: 'trial-and-pro',
    title: 'Free trial and Aila Pro',
    body: (
      <>
        <ul>
          <li>
            <strong>Free trial:</strong> each new account includes a free 3-hour trial of Aila. No
            payment details are needed, and nothing is charged when it ends.
          </li>
          <li>
            <strong>Aila Pro:</strong> you can buy one month of Aila Pro at a time. Payments in
            Nigerian naira are taken by Flutterwave or Paystack, and payments in US dollars
            (USD 9.99 per month) by PayPal. The current price is shown on the billing page before
            you pay.
          </li>
          <li>
            <strong>Automatic renewal (optional):</strong> when paying by card through
            Flutterwave, you can choose to renew Aila Pro automatically each month. Your card is
            then charged at the start of each new month until you cancel. You can cancel at any
            time on the <Link href="/billing">billing page</Link>, and no further charges will be
            made.
          </li>
          <li>
            <strong>End of a paid period:</strong> if you cancel, or a month you bought is not
            renewed, you keep Aila Pro until the end of the period you have paid for.
          </li>
        </ul>
        <p>
          We may change the price of Aila Pro. A new price applies only to purchases or renewals
          after the change, and we will tell you before it affects an automatic renewal.
        </p>
      </>
    ),
  },
  {
    id: 'payments-and-refunds',
    title: 'Payments and refunds',
    body: (
      <>
        <p>
          Payments are processed by Flutterwave, Paystack and PayPal under their own terms. Aila
          never stores your card number. A payment provider may add its own fees, which are shown
          to you before you pay.
        </p>
        <p>
          If you were charged for a payment that failed to give you Aila Pro, or you were charged
          more than once for the same purchase, email {mail} within 7 days of the charge with the
          email address on your account and the date of the payment. We will fix your access or
          refund the charge.
        </p>
        <p>
          Otherwise, months of Aila Pro that you have bought are non-refundable, including
          unused time, except where the law requires a refund. Nothing in these terms limits
          rights you have under consumer protection law.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>When you use Aila, you must not:</p>
        <ul>
          <li>
            create, upload or share anything illegal, or use Aila to plan or carry out illegal
            activity;
          </li>
          <li>
            harass, threaten, defraud or otherwise abuse anyone, or create content that exploits
            or harms children;
          </li>
          <li>
            infringe anyone else’s rights, including their privacy and intellectual property;
          </li>
          <li>
            try to break, probe or get around Aila’s security, usage limits or access controls, or
            access another person’s account or data;
          </li>
          <li>
            disrupt the service, for example with malware, automated scraping or excessive
            requests;
          </li>
          <li>
            resell, rent or share access to Aila, or offer it to others as part of your own
            service, without our written permission.
          </li>
        </ul>
        <p>
          We may remove content or limit access where we reasonably believe these rules have been
          broken.
        </p>
      </>
    ),
  },
  {
    id: 'your-content',
    title: 'Your content',
    body: (
      <>
        <p>
          You keep ownership of the messages, files and voice recordings you put into Aila and of
          the output Aila generates for you, to the extent the law allows. You are responsible
          for having the right to use what you upload.
        </p>
        <p>
          You give us permission to store, process and transmit your content only as needed to
          provide Aila to you, including sending it to our AI processing providers as described
          in our <Link href="/privacy">Privacy Policy</Link>. We do not use your content to train
          AI models.
        </p>
        <p>
          You can delete conversations and files at any time, and you can ask us to delete your
          account by emailing {mail}.
        </p>
      </>
    ),
  },
  {
    id: 'ai-output',
    title: 'AI output',
    body: (
      <>
        <p>
          Aila’s answers are generated by AI models. They can be inaccurate, incomplete or out of
          date, and they may sound confident when they are wrong. Similar requests may produce
          different answers.
        </p>
        <p>
          Check important information before relying on it. Aila does not give professional
          advice: its output is not a substitute for a qualified lawyer, doctor, financial adviser
          or other professional, and you are responsible for the decisions you make using it.
        </p>
      </>
    ),
  },
  {
    id: 'our-property',
    title: 'Aila’s property',
    body: (
      <p>
        Aila, including its software, design, name, crest and logo, belongs to {LEGAL.operator}.
        These terms give you a personal, non-transferable right to use Aila for as long as your
        account is in good standing. They do not give you any other rights in Aila. If you send us
        feedback or ideas, we may use them without any obligation to you.
      </p>
    ),
  },
  {
    id: 'ending',
    title: 'Suspension and closing your account',
    body: (
      <>
        <p>
          You can stop using Aila at any time and ask us to delete your account by emailing {mail}.
          Cancel any automatic renewal on the billing page first.
        </p>
        <p>
          We may suspend or close your account if you seriously or repeatedly break these terms,
          if the law requires it, or to protect other users or Aila. Where reasonable, we will tell
          you why and give you a chance to respond first. If we close your account without a good
          reason under these terms, we will refund the unused part of any paid period.
        </p>
      </>
    ),
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    body: (
      <p>
        We provide Aila with reasonable care and skill. Apart from that, and to the extent the law
        allows, Aila is provided “as is” and “as available”, without other promises, for example
        that it will be uninterrupted, error-free or suitable for a particular purpose.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: (
      <>
        <p>
          To the extent the law allows, Aila is not liable for indirect or consequential losses,
          such as lost profits, lost business or lost data, or for losses caused by relying on AI
          output. Our total liability to you for any claim relating to Aila is limited to the
          amount you paid us in the three months before the claim arose.
        </p>
        <p>
          Nothing in these terms excludes or limits liability that cannot be excluded or limited
          by law, including for fraud, or for death or personal injury caused by negligence.
        </p>
      </>
    ),
  },
  {
    id: 'governing-law',
    title: 'Governing law and disputes',
    body: (
      <p>
        These terms are governed by the laws of the Federal Republic of Nigeria. If you have a
        problem, please email {mail} first, and we will try to resolve it with you informally.
        If we cannot, disputes will be decided by the courts of Nigeria. If you live outside
        Nigeria, you keep any protections that the law of your country gives you and that cannot
        be waived by agreement.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: (
      <p>
        We may update these terms as Aila changes or the law requires. We will change the “Last
        updated” date above, and if a change is significant we will tell you by email or in Aila
        before it takes effect. If you keep using Aila after a change takes effect, the updated
        terms apply. If you do not agree, you can stop using Aila and close your account.
      </p>
    ),
  },
  {
    id: 'general',
    title: 'General',
    body: (
      <p>
        If any part of these terms cannot be enforced, the rest still applies. If we do not
        enforce a term straight away, we can still enforce it later. You may not transfer your
        rights under these terms without our permission. These terms and the Privacy Policy are
        the whole agreement between you and us about Aila.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: (
      <p>
        For questions about these terms, support or refunds, email {mail} or write to{' '}
        {LEGAL.operator}, {LEGAL.address}.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      intro={
        <p>
          These terms explain the rules for using Aila, what you can expect from us and what we
          expect from you. Please read them together with our{' '}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      }
      sections={sections}
    />
  );
}
