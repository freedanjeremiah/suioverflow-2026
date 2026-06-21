import { Hero } from "@/components/site/Hero";
import { Premise, TrustStrip } from "@/components/site/sections";
import { MarketTeaser } from "@/components/site/MarketTeaser";
import { FeatureTriptych, SliceShowcase, FinalCTA } from "@/components/site/landing";

export default function Home() {
  return (
    <>
      <Hero />
      <Premise />
      <FeatureTriptych />
      <SliceShowcase />
      <MarketTeaser />
      <TrustStrip />
      <FinalCTA />
    </>
  );
}
