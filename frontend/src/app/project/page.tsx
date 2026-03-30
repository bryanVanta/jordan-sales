"use client";

import { useState } from "react";
import axios from "axios";
import { useProduct } from "@/context/ProductContext";

const Project = () => {
  const { selectedProduct } = useProduct();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [leadsCollected, setLeadsCollected] = useState(0);

  const handleStartOutreach = async () => {
    if (!selectedProduct) {
      setMessage("❌ Please select a product first");
      return;
    }

    setLoading(true);
    setMessage("🔍 Starting outreach... Scraping companies...");

    try {
      const response = await axios.post(
        "http://localhost:5000/api/scraping/start-outreach",
        {
          productId: selectedProduct.id,
          productName: selectedProduct.productName,
          targetCustomer: selectedProduct.targetCustomer,
          location: selectedProduct.location,
        }
      );

      if (response.data.success) {
        setLeadsCollected(response.data.leadsCount);
        setMessage(
          `✅ Outreach completed! Found ${response.data.leadsCount} leads with contact info`
        );
      } else {
        setMessage(`❌ Error: ${response.data.error}`);
      }
    } catch (error: any) {
      setMessage(
        `❌ Error: ${error.response?.data?.error || error.message}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "20px" }}>
      {/* Main Content */}
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "30px" }}>Projects & Outreach</h1>

        {selectedProduct ? (
          <div style={{ border: "1px solid #ddd", padding: "20px", marginBottom: "30px" }}>
            <h2 style={{ marginTop: "0" }}>{selectedProduct.productName}</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div>
                <h4 style={{ margin: "0 0 8px 0" }}>Product Type:</h4>
                <p style={{ margin: "0 0 15px 0" }}>{selectedProduct.productType}</p>

                <h4 style={{ margin: "0 0 8px 0" }}>Target Customer:</h4>
                <p style={{ margin: "0 0 15px 0" }}>{selectedProduct.targetCustomer}</p>

                <h4 style={{ margin: "0 0 8px 0" }}>Location:</h4>
                <p style={{ margin: "0 0 15px 0" }}>{selectedProduct.location}</p>
              </div>

              <div>
                <h4 style={{ margin: "0 0 8px 0" }}>Description:</h4>
                <p style={{ margin: "0", fontSize: "14px" }}>{selectedProduct.description}</p>
              </div>
            </div>
          </div>
        ) : (
          <p>No products available</p>
        )}

        {/* Status Message */}
        {message && (
          <div
            style={{
              marginBottom: "20px",
              padding: "15px",
              backgroundColor: "#f0f0f0",
              border: "1px solid #ddd",
              borderRadius: "4px",
            }}
          >
            {message}
          </div>
        )}

        {leadsCollected > 0 && (
          <div
            style={{
              marginBottom: "20px",
              padding: "15px",
              backgroundColor: "#e8f5e9",
              border: "1px solid #4caf50",
              borderRadius: "4px",
            }}
          >
            <p style={{ margin: "0", fontWeight: "bold" }}>
              ✅ {leadsCollected} leads collected and saved to database
            </p>
          </div>
        )}
      </div>

      {/* Start Outreach Button (Bottom Right) */}
      {selectedProduct && (
        <button
          onClick={handleStartOutreach}
          disabled={loading}
          style={{
            position: "fixed",
            bottom: "30px",
            right: "30px",
            padding: "15px 25px",
            backgroundColor: loading ? "#ccc" : "#007bff",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "16px",
            fontWeight: "bold",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          {loading ? "🔄 Scraping..." : "🚀 Start Outreach"}
        </button>
      )}
    </div>
  );
};

export default Project;