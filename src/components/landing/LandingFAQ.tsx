import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FAQItem {
  question: string;
  answer: string;
}

interface LandingFAQProps {
  sectionId?: string;
  title: string;
  subtitle: string;
  items: FAQItem[];
}

export default function LandingFAQ({
  sectionId,
  title,
  subtitle,
  items,
}: LandingFAQProps) {
  return (
    <section
      id={sectionId}
      className="relative z-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-24 scroll-mt-20"
    >
      <div className="rounded-3xl border border-white/12 bg-white/[0.04] px-5 sm:px-8 py-8 sm:py-10">
        <div className="max-w-3xl mb-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            {title}
          </h2>
          <p className="mt-3 text-muted-foreground">{subtitle}</p>
        </div>

        <Accordion type="single" collapsible className="w-full">
          {items.map((item, index) => (
            <AccordionItem
              key={item.question}
              value={`faq-item-${index}`}
              className="border-white/10"
            >
              <AccordionTrigger className="text-left text-foreground hover:no-underline">
                <span className="pr-4 text-sm sm:text-base font-semibold">
                  {item.question}
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
