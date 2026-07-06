"use client";

import LegalDocument from "@/components/landing/LegalDocument";
import {
  MEETWISE_PRIVACY_SECTIONS,
  MEETWISE_PRIVACY_UPDATED_AT,
} from "@/lib/legal/meetwise-privacy-content";

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      updatedAt={MEETWISE_PRIVACY_UPDATED_AT}
      sections={MEETWISE_PRIVACY_SECTIONS}
    />
  );
}
