import { create } from "zustand";

import { DEFAULT_BRAND_COLOR } from "@/lib/chart-colors";

export interface Brand {
  schoolName: string;
  schoolMotto: string;
  primaryColor: string;
  logoUrl: string;
}

interface BrandState extends Brand {
  setBrand: (b: Partial<Brand>) => void;
}

export const useBrandStore = create<BrandState>((set) => ({
  schoolName: "Markova",
  schoolMotto: "",
  primaryColor: DEFAULT_BRAND_COLOR,
  logoUrl: "",
  setBrand: (b) => set((s) => ({ ...s, ...b })),
}));
