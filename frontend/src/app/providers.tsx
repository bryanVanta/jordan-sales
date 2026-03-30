"use client";

import { ProductProvider } from "@/context/ProductContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ProductProvider>
      {children}
    </ProductProvider>
  );
}
