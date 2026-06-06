import { create } from "zustand";

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
  primaryColor: "#1B4F72",
  logoUrl: "",
  setBrand: (b) => set((s) => ({ ...s, ...b })),
}));
