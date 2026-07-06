import { MEETWISE_PRIVACY_UPDATED_AT } from "@/lib/legal/versions";

export const MEETWISE_PRIVACY_SECTIONS = [
  {
    heading: "1. Scope of this Privacy Policy",
    paragraphs: [
      "This Privacy Policy explains how MeetWise processes personal data when you use our website, product, and calendar integrations.",
      "It describes what we collect, why we process it, retention rules, third-party recipients, international transfers, and your rights.",
    ],
  },
  {
    heading: "2. Data controller and contact",
    paragraphs: [
      "MNB solutions acts as the controller for product account and service operation data unless another role is contractually defined with an organization customer.",
      "For privacy requests, contact privacy@mnb.solutions.",
    ],
  },
  {
    heading: "3. What data we process",
    paragraphs: [
      "MeetWise processes account and workspace data, such as name, email, role, team metadata, plan status, and operational logs.",
      "For calendar analytics, we may process event metadata such as subject, start/end time, attendee counts, recurrence metadata, cancellation status, and linked identifiers needed for deduplication and reporting.",
    ],
    bullets: [
      "Authentication and profile data",
      "Calendar sync metadata and integration tokens",
      "Team configuration data including cost-related inputs",
      "Usage, diagnostics, and security logs",
    ],
  },
  {
    heading: "4. Calendar permissions and organization admin consent",
    paragraphs: [
      "Calendar access is obtained via provider authorization flows and permission scopes required by product features.",
      "In Microsoft Entra tenants, organization administrators may grant or restrict consent centrally. Your organization decides governance rules for tenant-wide or delegated access.",
      "Customers are responsible for ensuring internal approvals, employee notices, and lawful workplace processing before enabling organization-level consent.",
    ],
  },
  {
    heading: "5. Purposes and legal bases",
    paragraphs: [
      "We process data to provide account access, sync meetings, calculate analytics, generate AI-assisted recommendations, provide support, secure the platform, and meet legal obligations.",
      "Depending on context, legal bases may include contract performance, legitimate interests, legal obligations, and consent where required by law.",
    ],
  },
  {
    heading: "6. AI processing",
    paragraphs: [
      "MeetWise may use AI providers to generate summaries and recommendations from selected analytics inputs.",
      "Unless explicitly stated in product notices or enterprise agreements, customer content is not used to train foundation models by default for MeetWise service operation.",
    ],
  },
  {
    heading: "7. Sharing and subprocessors",
    paragraphs: [
      "We share data only with service providers needed to run MeetWise, such as hosting, database, authentication, email, billing, and AI providers.",
      "Each provider processes data under contractual controls appropriate to their role.",
    ],
  },
  {
    heading: "8. International transfers",
    paragraphs: [
      "Where personal data is transferred outside the EEA, we use recognized safeguards such as standard contractual clauses or equivalent legal mechanisms.",
      "Transfer safeguards depend on provider geography and service configuration.",
    ],
  },
  {
    heading: "9. Retention",
    paragraphs: [
      "We retain personal data only for as long as needed for product delivery, security, contractual obligations, and legal compliance.",
      "Retention periods vary by data type and customer lifecycle. Integration tokens and sync records may be removed or anonymized after disconnection, account deletion, or policy-defined inactivity periods.",
    ],
  },
  {
    heading: "10. Security",
    paragraphs: [
      "We implement technical and organizational measures designed to protect confidentiality, integrity, and availability of customer data.",
      "No method of transmission or storage is fully risk-free, but we continuously improve safeguards and incident response practices.",
    ],
  },
  {
    heading: "11. Your rights",
    paragraphs: [
      "Depending on your jurisdiction, you may have rights including access, rectification, erasure, restriction, portability, objection, and the right to lodge a complaint with a supervisory authority.",
      "If your data is managed through an employer workspace, some requests may need to be handled through your organization first.",
    ],
  },
  {
    heading: "12. Cookies and analytics",
    paragraphs: [
      "MeetWise may use essential cookies for session and security operation and optional analytics cookies where consent is required.",
      "Cookie handling and preferences are described in the applicable cookie notice or consent interface.",
    ],
  },
  {
    heading: "13. Policy updates",
    paragraphs: [
      "We may update this Privacy Policy to reflect legal, technical, or product changes.",
      "The latest version is always published on our website.",
    ],
  },
] as const;
