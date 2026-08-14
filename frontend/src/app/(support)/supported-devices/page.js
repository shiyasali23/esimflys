import Image from "next/image";
import { DeviceChecker } from "@/features/devices/components/device-checker.client";
import { CategoryTabs } from "@/features/devices/components/category-tabs.client";
import devices from "@/content/devices.json";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata = buildMetadata({
  title: "eSIM Compatible Devices",
  description:
    "Check whether your iPhone, Samsung Galaxy, or Google Pixel supports eSIM — plus compatible smartwatches, tablets, laptops, routers and cars.",
  path: "/supported-devices",
});

export default function SupportedDevicesPage() {
  return (
    <>
      <section className="relative -mt-20 overflow-hidden bg-gradient-to-br from-primary via-primary to-[#0f766e] text-white">
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
      </div>
    </>
  );
}
