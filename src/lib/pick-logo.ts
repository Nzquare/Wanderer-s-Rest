/**
 * Picks whichever of the café's two logo uploads (Back Office → Settings
 * → Café) actually suits a given background — logoUrl is the light/white
 * version meant for dark backgrounds, receiptLogoUrl is the dark/black
 * version meant for light ones (§Receipt/light-background logo). Falls
 * back to the other one if the preferred slot was never uploaded, so a
 * café that's only ever set one logo still gets *something* everywhere,
 * not a blank space just because it's the "wrong" variant.
 */
export function pickLogo(
  cafe: { logoUrl: string | null; receiptLogoUrl: string | null },
  background: "dark" | "light",
): string | null {
  return background === "dark"
    ? (cafe.logoUrl ?? cafe.receiptLogoUrl)
    : (cafe.receiptLogoUrl ?? cafe.logoUrl);
}
