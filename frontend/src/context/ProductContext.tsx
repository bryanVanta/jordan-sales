"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

interface Product {
  id: string;
  productName: string;
  productType: string;
  description: string;
  targetCustomer: string;
  location: string;
  instructions: string;
  knowledge: string;
}

interface ProductContextType {
  products: Product[];
  selectedProduct: Product | null;
  setSelectedProduct: (product: Product | null) => void;
  loading: boolean;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export const ProductProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await axios.get("http://localhost:5000/api/products");
        if (response.data.success && response.data.data) {
          setProducts(response.data.data);
          if (response.data.data.length > 0 && !selectedProduct) {
            setSelectedProduct(response.data.data[0]);
          }
        }
      } catch (error) {
        console.log("Error fetching products");
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  return (
    <ProductContext.Provider value={{ products, selectedProduct, setSelectedProduct, loading }}>
      {children}
    </ProductContext.Provider>
  );
};

export const useProduct = () => {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error("useProduct must be used within ProductProvider");
  }
  return context;
};
