"use client";

import { useState, useEffect } from "react";
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

const Training = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  const [instructions, setInstructions] = useState("");
  const [knowledge, setKnowledge] = useState("");
  const [product, setProduct] = useState("");
  const [productName, setProductName] = useState("");
  const [productType, setProductType] = useState("service");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);

  // Fetch all products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await axios.get("http://localhost:5000/api/products");
        if (response.data.success && response.data.data) {
          setProducts(response.data.data);
        }
      } catch (error) {
        console.log("No products found or error loading");
      } finally {
        setInitialLoading(false);
      }
    };

    fetchProducts();
  }, []);

  // Handle product selection from list
  const handleSelectProduct = (prod: Product) => {
    setSelectedProduct(prod);
    setInstructions(prod.instructions || "");
    setProduct(prod.description || "");
    setProductName(prod.productName || "");
    setProductType(prod.productType || "service");
    setTargetCustomer(prod.targetCustomer || "");
    setLocation(prod.location || "");
    setKnowledge(prod.knowledge || "");
    setMessage("");
  };

  // Handle creating new product
  const handleAddProduct = () => {
    setSelectedProduct(null);
    setInstructions("");
    setProduct("");
    setProductName("");
    setProductType("service");
    setTargetCustomer("");
    setLocation("");
    setKnowledge("");
    setMessage("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setKnowledge(event.target?.result as string);
        setMessage("File uploaded successfully!");
      };
      reader.readAsText(file);
    }
  };

  const handleSave = async () => {
    if (!instructions || !product || !productName || !targetCustomer || !location) {
      setMessage("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      if (selectedProduct) {
        // Update existing product
        const response = await axios.put(`http://localhost:5000/api/products/${selectedProduct.id}`, {
          productName,
          productType,
          description: product,
          targetCustomer,
          location,
          instructions,
          knowledge,
        });

        setMessage(`✓ Product updated successfully! ID: ${selectedProduct.id}`);
        
        // Update products list
        setProducts((prev) =>
          prev.map((p) => (p.id === selectedProduct.id ? response.data.data : p))
        );
        setSelectedProduct(response.data.data);
      } else {
        // Create new product
        const response = await axios.post("http://localhost:5000/api/products", {
          productName,
          productType,
          description: product,
          targetCustomer,
          location,
          instructions,
          knowledge,
        });

        const newProduct = response.data.data;
        setMessage(`✓ Product created successfully! ID: ${newProduct.id}`);
        
        // Add to products list
        setProducts((prev) => [newProduct, ...prev]);
        setSelectedProduct(newProduct);
      }
    } catch (error) {
      setMessage(`Error saving product: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProduct || !window.confirm("Are you sure you want to delete this product?")) {
      return;
    }

    setLoading(true);
    try {
      await axios.delete(`http://localhost:5000/api/products/${selectedProduct.id}`);
      setMessage(`✓ Product deleted successfully!`);
      
      // Remove from products list
      setProducts((prev) => prev.filter((p) => p.id !== selectedProduct.id));
      setSelectedProduct(null);
      
      // Clear form
      setInstructions("");
      setProduct("");
      setProductName("");
      setProductType("service");
      setTargetCustomer("");
      setLocation("");
      setKnowledge("");
    } catch (error) {
      setMessage(`Error deleting product: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: "20px", padding: "20px" }}>
      {/* LEFT SIDEBAR - Products List */}
      <div style={{ width: "250px", border: "1px solid #ddd", padding: "15px", overflow: "auto" }}>
        <button
          onClick={handleAddProduct}
          style={{ width: "100%", padding: "10px", marginBottom: "15px", cursor: "pointer", border: "1px solid #007bff", backgroundColor: "#007bff", color: "#fff" }}
        >
          + Add Product
        </button>

        <div>
          {initialLoading ? (
            <p>Loading products...</p>
          ) : products.length === 0 ? (
            <p>No products yet</p>
          ) : (
            products.map((prod) => (
              <div
                key={prod.id}
                onClick={() => handleSelectProduct(prod)}
                style={{
                  padding: "10px",
                  marginBottom: "8px",
                  border: "1px solid #ddd",
                  cursor: "pointer",
                  backgroundColor: selectedProduct?.id === prod.id ? "#007bff" : "#fff",
                  color: selectedProduct?.id === prod.id ? "#fff" : "#000",
                }}
              >
                <p style={{ margin: "0 0 5px 0", fontWeight: "bold" }}>{prod.productName}</p>
                <p style={{ margin: "0", fontSize: "12px", opacity: "0.7" }}>{prod.productType}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT SIDE - Form */}
      <div style={{ flex: 1, border: "1px solid #ddd", padding: "20px", overflow: "auto" }}>
        {selectedProduct && (
          <p style={{ color: "#666", fontSize: "12px", marginBottom: "15px" }}>
            Product ID: {selectedProduct.id}
          </p>
        )}

        <h2 style={{ marginTop: "0" }}>
          {selectedProduct ? "Edit" : "Create"} Product
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px" }}>
          {/* LEFT COLUMN - AI Training */}
          <div>
            <h3>AI Training Data</h3>

            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="How should the AI behave when pitching this product?"
              style={{ width: "100%", height: "150px", padding: "8px", marginBottom: "15px", border: "1px solid #333", fontFamily: "Arial, sans-serif" }}
            />

            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Knowledge Base (PDF/TXT)
            </label>
            <input
              type="file"
              onChange={handleFileUpload}
              accept=".txt,.pdf"
              style={{ display: "block", marginBottom: "10px", padding: "8px", border: "1px solid #333" }}
            />
            {knowledge && (
              <div style={{ backgroundColor: "#f0f0f0", padding: "10px", borderRadius: "4px", fontSize: "12px", border: "1px solid #ddd" }}>
                <p style={{ margin: "0 0 5px 0", fontWeight: "bold" }}>📄 Knowledge loaded:</p>
                <p style={{ margin: "0" }}>{knowledge.substring(0, 150)}...</p>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN - Product Details */}
          <div>
            <h3>Product Details</h3>

            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Product Name*
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g., CloudSync Pro"
              style={{ width: "100%", padding: "8px", marginBottom: "15px", boxSizing: "border-box", border: "1px solid #333" }}
            />

            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Product Type*
            </label>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              style={{ width: "100%", padding: "8px", marginBottom: "15px", boxSizing: "border-box", border: "1px solid #333" }}
            >
              <option value="saas">SaaS</option>
              <option value="software">Software</option>
              <option value="service">Service</option>
              <option value="hardware">Hardware</option>
              <option value="consulting">Consulting</option>
              <option value="other">Other</option>
            </select>

            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Product Description*
            </label>
            <textarea
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="What does this product do?"
              style={{ width: "100%", height: "100px", padding: "8px", marginBottom: "15px", boxSizing: "border-box", border: "1px solid #333", fontFamily: "Arial, sans-serif" }}
            />

            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Target Customer*
            </label>
            <input
              type="text"
              value={targetCustomer}
              onChange={(e) => setTargetCustomer(e.target.value)}
              placeholder="Who is this for?"
              style={{ width: "100%", padding: "8px", marginBottom: "15px", boxSizing: "border-box", border: "1px solid #333" }}
            />

            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Location*
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., New York, USA"
              style={{ width: "100%", padding: "8px", marginBottom: "15px", boxSizing: "border-box", border: "1px solid #333" }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
          <button
            onClick={handleSave}
            disabled={loading}
            style={{ padding: "10px 20px", cursor: "pointer", flex: 1, border: "1px solid #007bff", backgroundColor: "#007bff", color: "#fff" }}
          >
            {loading ? "Saving..." : selectedProduct ? "Update Product" : "Create Product"}
          </button>

          {selectedProduct && (
            <button
              onClick={handleDelete}
              disabled={loading}
              style={{ padding: "10px 20px", cursor: "pointer", backgroundColor: "#ff4444", color: "#fff", border: "1px solid #ff4444" }}
            >
              Delete
            </button>
          )}
        </div>

        {/* Status Message */}
        {message && (
          <div style={{ marginTop: "15px", padding: "10px", backgroundColor: "#f0f0f0", borderRadius: "4px", border: "1px solid #ddd" }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

export default Training;