import { ShoppingCart, QrCode, Settings, Plane } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";
import { SITE } from "@/config/site";

export const metadata = buildMetadata({
  title: "How it Works",
  description:
    "Set up a travel eSIM in minutes: choose a plan, get a QR code by email, scan to install, then connect on arrival — no physical SIM, no roaming bills.",
  path: "/how-it-works",
});

const STEPS = [
  { icon: ShoppingCart, title: "Choose your plan", body: `Pick a destination from ${SITE.countryCount} countries and select the data amount and validity that fit your trip.` },
  { icon: QrCode, title: "Receive your QR code", body: "After checkout we email you an eSIM QR code, usually within minutes." },
  { icon: Settings, title: "Scan & install", body: "Open your phone's settings, add an eSIM, and scan the QR code. Install before you travel while on Wi-Fi." },
  { icon: Plane, title: "Connect on arrival", body: "Turn on the eSIM line when you land and enjoy fast 4G/5G data. Your original SIM stays in for calls and texts." },
];

export default function HowItWorksPage() {
  return (
    <Section>
      <Container>
        <h1 className="mb-4 font-display text-headline-lg uppercase text-foreground">How eSIMFlys works</h1>
        <p className="mb-12 max-w-2xl text-body-lg text-muted-foreground">
          A travel eSIM is a digital SIM you install by scanning a QR code — no physical card, no
          swapping, no roaming bills. Here's the whole process.
        </p>
        <div className="grid gap-10 md:grid-cols-2">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                <s.icon size={26} aria-hidden />
              </div>
              <div>
                <h2 className="mb-2 font-display text-headline-md text-foreground">
                  {i + 1}. {s.title}
                </h2>
                <p className="text-body-md text-muted-foreground">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-16 text-center">
          <Button href={routes.destinations()} variant="primary" size="lg">Browse destinations</Button>
        </div>
      </Container>
    </Section>
  );
}
