/**
 * Thailand PromptPay QR payload generator — the EMVCo "Merchant Presented
 * Mode" QR Code spec, using the PromptPay merchant application ID
 * (A000000677010111) that every Thai banking app recognizes. This is an
 * offline string algorithm — no gateway account, API key, or network call
 * needed, so it works the same in dev as in production.
 *
 * What it can't do: confirm the transfer actually arrived. There's no
 * webhook without a real payment-gateway subscription (SCB/KBank/Omise/
 * 2C2P etc.), so — same as how most small Thai merchants actually run
 * PromptPay off their own banking app today — the cashier still checks
 * their phone for the incoming-transfer notification and taps "Confirm
 * Payment" themselves. This just gets a correct, amount-prefilled,
 * scannable code in front of the customer instead of nothing.
 */

function toTargetTagAndValue(promptpayId: string): { tag: string; value: string } {
  const digits = promptpayId.replace(/\D/g, "");
  if (digits.length === 13) {
    // National ID or corporate Tax ID.
    return { tag: "02", value: digits };
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    // Local mobile number -> country code 66 + 9-digit subscriber number.
    return { tag: "01", value: `0066${digits.slice(1)}` };
  }
  if (digits.length === 9) {
    return { tag: "01", value: `0066${digits}` };
  }
  // e-Wallet ID — fixed 15-digit field, zero-padded.
  return { tag: "03", value: digits.padStart(15, "0") };
}

function tlv(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, "0")}${value}`;
}

/** CRC-16/CCITT-FALSE — the checksum algorithm the EMV QR spec requires. */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Builds a PromptPay QR payload for a specific bill amount. Pass the
 * café's registered PromptPay ID (phone number, national/tax ID, or
 * e-Wallet ID) from Settings > Checkout, and the exact amount due.
 */
export function buildPromptPayPayload(promptpayId: string, amount: number): string {
  const target = toTargetTagAndValue(promptpayId);
  const withoutCrc =
    tlv("00", "01") + // Payload Format Indicator
    tlv("01", "12") + // Point of Initiation Method: dynamic (has an amount)
    tlv("29", tlv("00", "A000000677010111") + tlv(target.tag, target.value)) +
    tlv("53", "764") + // Currency: THB (ISO 4217 numeric)
    tlv("54", amount.toFixed(2)) + // Transaction amount
    tlv("58", "TH") + // Country code
    "6304"; // CRC tag + length, checksum appended next
  return withoutCrc + crc16(withoutCrc);
}
