"use client";
import Link from "next/link";
import { useState } from "react";
import { useProduct } from "@/context/ProductContext";

const Navbar = () => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const { products, selectedProduct, setSelectedProduct } = useProduct();

  return (
    <nav style={{ backgroundColor: "#333", color: "#fff", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        <Link href="/dashboard" legacyBehavior>
          <a style={{ fontSize: "18px", fontWeight: "bold", textDecoration: "none", color: "#fff" }}>
            Jordan Sales
          </a>
        </Link>
        <Link href="/training" legacyBehavior>
          <a style={{ textDecoration: "none", color: "#fff", cursor: "pointer" }}>
            Training
          </a>
        </Link>

        <div style={{ position: "relative" }}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}
          >
            Chats
          </button>
          {isDropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "30px",
                left: "0",
                backgroundColor: "#444",
                borderRadius: "4px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                minWidth: "150px",
              }}
            >
              <Link href="/chats" legacyBehavior>
                <a style={{ display: "block", padding: "10px 15px", color: "#fff", textDecoration: "none" }}>
                  All
                </a>
              </Link>
              <Link href="/chats/whatsapp" legacyBehavior>
                <a style={{ display: "block", padding: "10px 15px", color: "#fff", textDecoration: "none" }}>
                  WhatsApp
                </a>
              </Link>
              <Link href="/chats/email" legacyBehavior>
                <a style={{ display: "block", padding: "10px 15px", color: "#fff", textDecoration: "none" }}>
                  Email
                </a>
              </Link>
              <Link href="/chats/telegram" legacyBehavior>
                <a style={{ display: "block", padding: "10px 15px", color: "#fff", textDecoration: "none" }}>
                  Telegram
                </a>
              </Link>
            </div>
          )}
        </div>

        <Link href="/project" legacyBehavior>
          <a style={{ textDecoration: "none", color: "#fff", cursor: "pointer" }}>
            Project
          </a>
        </Link>
      </div>

      {/* Profile Icon (Right Side) */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            border: "2px solid #fff",
            backgroundColor: "#555",
            cursor: "pointer",
            fontSize: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Profile"
        >
          👤
        </button>

        {showProfileMenu && (
          <div
            style={{
              position: "absolute",
              top: "50px",
              right: "0",
              backgroundColor: "#fff",
              border: "1px solid #ddd",
              borderRadius: "4px",
              minWidth: "280px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              zIndex: 1000,
            }}
          >
            <div style={{ padding: "12px", borderBottom: "1px solid #ddd" }}>
              <p style={{ margin: "0", fontWeight: "bold", color: "#000" }}>Jordan Projects</p>
              <p style={{ margin: "5px 0 0 0", fontSize: "12px", color: "#666" }}>
                Login Name
              </p>
            </div>

            <div style={{ padding: "10px 0" }}>
              {products.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => {
                    setSelectedProduct(prod);
                    setShowProfileMenu(false);
                  }}
                  style={{
                    padding: "10px 12px",
                    cursor: "pointer",
                    backgroundColor: selectedProduct?.id === prod.id ? "#e3f2fd" : "#fff",
                    borderLeft: selectedProduct?.id === prod.id ? "3px solid #007bff" : "3px solid transparent",
                    fontSize: "14px",
                    color: "#000",
                  }}
                >
                  {prod.productName}
                </div>
              ))}
            </div>

            <div style={{ padding: "10px", borderTop: "1px solid #ddd" }}>
              <button
                style={{
                  width: "100%",
                  padding: "8px",
                  backgroundColor: "#fff",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  cursor: "pointer",
                  color: "#000",
                }}
              >
                Edit Profile
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;