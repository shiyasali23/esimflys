import Image from "next/image";
import { DeviceChecker } from "@/features/devices/components/device-checker.client";
import { CategoryTabs } from "@/features/devices/components/category-tabs.client";
import devices from "@/content/devices.json";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { faqPageJsonLd, itemListJsonLd } from "@/lib/seo/jsonld";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

export const metadata = buildMetadata({
  title: "eSIM Compatible Devices",
  description:
    "Check whether your iPhone, Samsung Galaxy, or Google Pixel supports eSIM — plus compatible smartwatches, tablets, laptops, routers and cars.",
  path: "/supported-devices",
});

export default function SupportedDevicesPage() {
  return (
    <>
      {/*
        Every category panel is now server-rendered (see category-tabs.client.jsx), so the
        list can name the models the page actually shows. The FAQ block mirrors the visible
        accordion below.
      */}
      <JsonLd
        data={[
          itemListJsonLd(
            "eSIM compatible devices",
            devices.categories.flatMap((c) =>
              c.brands.map((b) => ({ name: `${c.name} — ${b.brand}: ${b.examples}` })),
            ),
          ),
          faqPageJsonLd(devices.faqs),
        ]}
      />
      <section className="relative -mt-16 overflow-hidden bg-gradient-to-br from-primary via-primary to-[#0f766e] text-white sm:-mt-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-14 pt-32 md:pb-20 md:pt-44 lg:grid-cols-2">
          <div>
            <h1 className="font-display text-4xl font-bold uppercase md:text-5xl">
              {devices.checker.title}
            </h1>
            <p className="mt-4 max-w-lg text-lg text-white/80">{devices.checker.subtitle}</p>
            <div className="mt-8 max-w-md">
              <DeviceChecker />
              <p className="mt-4 text-sm text-white/80">{devices.manualCheck.body}</p>
            </div>
          </div>
          <div className="flex justify-center">
            <Image
              src="/images/devices-network.webp"
              alt="A laptop, smartphone, tablet, smartwatch and Wi-Fi router linked together — devices that support eSIM."
              width={1500}
              height={1000}
              priority
              sizes="(min-width: 1024px) 520px, 90vw"
              className="h-auto w-full max-w-[560px] drop-shadow-2xl"
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-6 font-display text-2xl font-bold uppercase">Compatible device categories</h2>
        <CategoryTabs />
        <h2 className="mb-6 mt-16 font-display text-2xl font-bold uppercase">Device questions</h2>
        <Accordion>
          {devices.faqs.map((f, i) => (
            <AccordionItem key={i} name="device-faq">
              <AccordionTrigger>{f.q}</AccordionTrigger>
              <AccordionContent>{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </>
  );
}
