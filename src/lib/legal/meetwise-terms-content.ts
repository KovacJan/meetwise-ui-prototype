import { MEETWISE_TERMS_UPDATED_AT } from "@/lib/legal/versions";

export const MEETWISE_TERMS_SECTIONS = [
  {
    heading: "1. About MeetWise",
    paragraphs: [
      "MeetWise is a meeting analytics service that connects to supported calendar providers, estimates meeting cost based on configured team rates, and provides AI-assisted recommendations for improving meeting efficiency.",
      "These Terms govern access to our website, application, integrations, analytics features, paid plans, and related support services.",
    ],
  },
  {
    heading: "2. Eligibility and authority",
    paragraphs: [
      "You must be legally capable of accepting these Terms. If you use MeetWise for a company, you confirm you are authorized to bind that organization.",
      "Where required by your organization, you must obtain internal approval before connecting calendars or enabling organization-level integrations.",
    ],
  },
  {
    heading: "3. Accounts and security",
    paragraphs: [
      "You are responsible for maintaining account security and controlling access to your workspace.",
      "You must provide accurate account information and promptly report suspected unauthorized access.",
    ],
  },
  {
    heading: "4. Calendar integration and permissions",
    paragraphs: [
      "MeetWise accesses calendar data through delegated or organization-approved permissions to deliver sync and analytics features.",
      "If your Microsoft tenant uses admin consent controls, your organization is responsible for deciding whether to grant consent and for governing who may connect accounts.",
      "You must not connect calendars or resources that you are not authorized to access.",
    ],
    bullets: [
      "MeetWise is designed to read calendar event metadata required for analytics.",
      "Private or sensitive events may be excluded based on integration behavior and product safeguards.",
      "Revoking provider consent or disconnecting calendar access can limit or disable related features.",
    ],
  },
  {
    heading: "5. Customer responsibilities for data and permissions",
    paragraphs: [
      "You are responsible for your workspace configuration, including team member data, meeting rate inputs, and role assignment inside your organization.",
      "You must ensure you have a lawful basis to process attendee and employee data in MeetWise, including workplace transparency obligations where required.",
    ],
  },
  {
    heading: "6. AI insights and decision support",
    paragraphs: [
      "AI-generated recommendations are advisory and may be incomplete, inaccurate, or not suitable for your specific context.",
      "You remain responsible for operational, HR, legal, and managerial decisions. MeetWise does not provide legal, tax, or employment advice.",
    ],
  },
  {
    heading: "7. Acceptable use",
    paragraphs: [
      "You may use MeetWise only for lawful internal productivity and analytics purposes.",
      "You must not misuse the service, interfere with platform security, or attempt unauthorized extraction of other customers' data.",
    ],
    bullets: [
      "No reverse engineering or abuse of APIs beyond documented behavior.",
      "No deceptive or unlawful use of analytics outputs.",
      "No upload of malicious code, credentials, or unauthorized personal datasets.",
    ],
  },
  {
    heading: "8. Fees, subscriptions, and billing",
    paragraphs: [
      "Some MeetWise features may require a paid plan. Pricing, limits, and renewal conditions are shown at purchase.",
      "Payments may be processed by third-party billing providers. We do not store full payment card details on our systems.",
      "Refund handling follows checkout terms, mandatory consumer law, and applicable billing provider rules.",
    ],
  },
  {
    heading: "9. Intellectual property",
    paragraphs: [
      "MeetWise software, design, branding, and platform technology remain the property of MNB solutions or its licensors.",
      "You retain rights in your organization data. You grant us only the limited rights needed to host, process, secure, and improve the service according to our agreements and policies.",
    ],
  },
  {
    heading: "10. Privacy and data protection",
    paragraphs: [
      "Personal data handling is described in the Privacy Policy, including categories of data, purposes, recipients, retention, and rights.",
      "For organization customers, data protection roles may depend on your implementation model and contractual setup.",
    ],
  },
  {
    heading: "11. Availability, warranties, and liability",
    paragraphs: [
      "MeetWise is provided on an as-is and as-available basis to the extent permitted by law. We work to maintain reliability but do not guarantee uninterrupted operation.",
      "To the maximum extent permitted by law, indirect and consequential damages are excluded, and any liability cap follows the applicable commercial arrangement unless mandatory law states otherwise.",
    ],
  },
  {
    heading: "12. Suspension and termination",
    paragraphs: [
      "We may suspend or terminate access if we reasonably believe there is abuse, legal risk, security risk, payment fraud, or material breach of these Terms.",
      "You may stop using MeetWise at any time. Termination does not remove obligations that arose before termination.",
    ],
  },
  {
    heading: "13. Changes to Terms",
    paragraphs: [
      "We may update these Terms from time to time. The latest version will be available on our website.",
      "Where changes are material, we may provide additional notice. Continued use after the effective date means acceptance of the updated Terms.",
    ],
  },
  {
    heading: "14. Governing law and contact",
    paragraphs: [
      "These Terms are governed by Slovak law unless mandatory consumer or employment protections provide otherwise.",
      "For legal or support questions, contact support@mnb.solutions. For privacy questions, contact privacy@mnb.solutions.",
    ],
  },
] as const;
