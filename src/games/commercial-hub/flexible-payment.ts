import type { Resources } from "./types";
import { RESOURCE_KEYS } from "./resources";

/** Free slots are separate from mandatory cash and additional charges. */
export function validateFreePayment(payment: Resources | undefined, slots: number): Resources {
  if (!payment || Object.keys(payment).length !== RESOURCE_KEYS.length || RESOURCE_KEYS.some(k => !Number.isSafeInteger(payment[k]) || payment[k] < 0) || RESOURCE_KEYS.reduce((n, k) => n + payment[k], 0) !== slots) {
    throw new Error(`自由資源${slots}枠の支払いを指定してください`);
  }
  return { cash: payment.cash, materials: payment.materials, goods: payment.goods };
}

export function freePaymentOptions(slots: number): Resources[] {
  const options: Resources[] = [];
  for (let cash = slots; cash >= 0; cash--) for (let materials = slots - cash; materials >= 0; materials--) {
    options.push({ cash, materials, goods: slots - cash - materials });
  }
  return options;
}
