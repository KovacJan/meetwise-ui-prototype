"use client";

import LegalDocument from "@/components/landing/LegalDocument";
import {
  MEETWISE_TERMS_SECTIONS,
  MEETWISE_TERMS_UPDATED_AT,
} from "@/lib/legal/meetwise-terms-content";

export default function TermsOfUsePage() {
  return (
    <LegalDocument
      title="Terms of Use"
      updatedAt={MEETWISE_TERMS_UPDATED_AT}
      sections={MEETWISE_TERMS_SECTIONS}
    />
  );
}
