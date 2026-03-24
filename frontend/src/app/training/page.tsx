"use client";

import { useState, useEffect } from "react";
import axios from "axios";

const Training = () => {
  const [instructions, setInstructions] = useState("");
  const [knowledge, setKnowledge] = useState("");
  const [product, setProduct] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);

  // Fetch existing training on mount
  useEffect(() => {
    const fetchTraining = async () => {
      try {
        const response = await axios.get("http://localhost:5000/api/training");
        if (response.data.success && response.data.data) {
          const training = response.data.data;
          setInstructions(training.instructions || "");
          setProduct(training.product || "");
          setLocation(training.location || "");
          setKnowledge(training.knowledge || "");
          setMessage("Training loaded successfully!");
        }
      } catch (error) {
        // No training found yet, that's ok - show empty form with placeholders
        console.log("No existing training found, showing empty form");
      } finally {
        setInitialLoading(false);
      }
    };

    fetchTraining();
  }, []);

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
    if (!instructions || !product || !location) {
      setMessage("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post("http://localhost:5000/api/training", {
        instructions,
        knowledge,
        product,
        location,
        createdAt: new Date().toISOString(),
      });

      setMessage("✓ Training configuration saved successfully!");
    } catch (error) {
      setMessage(`Error saving training: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">AI Bot Training</h1>
      <p className="text-gray-600 mb-8">Configure your AI bot with instructions and knowledge</p>

      {initialLoading ? (
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <div className="animate-pulse text-gray-500">Loading training configuration...</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
          {/* Instructions */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Instructions *
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Enter detailed instructions for how the AI should behave..."
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Knowledge Upload */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Knowledge Base (Optional - .txt files only)
            </label>
            <div className="flex items-center space-x-4">
              <input
                type="file"
                accept=".txt"
                onChange={handleFileUpload}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Supported: Plain text (.txt) files only</p>
            {knowledge && (
              <p className="text-sm text-green-600 mt-2">File loaded: {knowledge.substring(0, 50)}...</p>
            )}
          </div>

          {/* Product */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Product *
            </label>
            <textarea
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="Describe your product or service..."
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Location *
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., New York, USA"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Message */}
          {message && (
            <div
              className={`p-4 rounded-lg ${
                message.includes("Error") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
              }`}
            >
              {message}
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? "Saving..." : "Save Training Configuration"}
          </button>
        </div>
      )}
    </div>
  );
};

export default Training;