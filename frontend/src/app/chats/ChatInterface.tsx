"use client";

import { useState } from "react";
import { chatWithLLM, analyzeCustomerStatus } from "@/services/llm";

interface Message {
  sender: "user" | "bot";
  text: string;
  reasoning?: string;
  model?: string;
  error?: boolean;
}

interface Customer {
  id: number;
  name: string;
  status: string;
  lastMessage: string;
}

interface CustomerStatus {
  status: string;
  reasoning: string;
  confidence: number;
}

const ChatInterface = () => {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  const [customerStatus, setCustomerStatus] = useState<CustomerStatus>({ status: "NEUTRAL", reasoning: "", confidence: 0 });
  const [statusLoading, setStatusLoading] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([
    { id: 1, name: "User +60123456789", status: "NEUTRAL", lastMessage: "Hello!" },
    { id: 2, name: "User +60198765432", status: "WARM", lastMessage: "Hi there!" },
    { id: 3, name: "User +60123456780", status: "COLD", lastMessage: "Can you help me?" },
  ]);

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setMessages([
      { sender: "user", text: customer.lastMessage },
      { sender: "bot", text: "How can I assist you?" },
    ]);
    setConversationHistory([]);
    setCustomerStatus({ status: customer.status || "NEUTRAL", reasoning: "", confidence: 0 });
    setError(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "HOT":
        return "bg-red-600 text-white";
      case "WARM":
        return "bg-yellow-500 text-white";
      case "NEUTRAL":
        return "bg-gray-400 text-white";
      case "COLD":
        return "bg-blue-600 text-white";
      default:
        return "bg-gray-400 text-white";
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case "HOT":
        return "hover:bg-red-700";
      case "WARM":
        return "hover:bg-yellow-600";
      case "NEUTRAL":
        return "hover:bg-gray-500";
      case "COLD":
        return "hover:bg-blue-700";
      default:
        return "hover:bg-gray-500";
    }
  };

  const handleSendMessage = async () => {
    if (newMessage.trim() === "") return;

    const userText = newMessage;
    setMessages((prev) => [...prev, { sender: "user", text: userText }]);
    setNewMessage("");
    setIsLoading(true);
    setError(null);

    try {
      // Send message to LLM with conversation history
      const result = await chatWithLLM(userText, conversationHistory, false);

      // Add bot response with optional reasoning
      const botMessage: Message = {
        sender: "bot",
        text: result.response,
        reasoning: result.reasoning,
        model: result.model,
      };

      setMessages((prev) => [...prev, botMessage]);
      setConversationHistory(result.history);

      // Analyze customer status after message exchange
      if (conversationHistory.length >= 2) {
        setStatusLoading(true);
        try {
          const analysisResult = await analyzeCustomerStatus(result.history);
          setCustomerStatus(analysisResult);

          // Update customer status in the list
          if (selectedCustomer) {
            setCustomers((prev) =>
              prev.map((c) =>
                c.id === selectedCustomer.id
                  ? { ...c, status: analysisResult.status }
                  : c
              )
            );
          }
        } catch (err) {
          console.warn("Error analyzing customer status:", err);
        } finally {
          setStatusLoading(false);
        }
      }
    } catch (err) {
      console.error("Error sending message to LLM:", err);
      setError(err instanceof Error ? err.message : "Failed to get response from LLM");
      
      // Add error message
      const errorMessage: Message = {
        sender: "bot",
        text: "Sorry, I encountered an error. Please check your training configuration and try again.",
        error: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-1/4 bg-gray-800 text-white p-4">
        <h2 className="text-lg font-bold mb-4">Customers</h2>
        <ul>
          {customers.map((customer) => (
            <li
              key={customer.id}
              className={`p-2 mb-2 rounded cursor-pointer transition ${
                selectedCustomer?.id === customer.id
                  ? "bg-gray-600"
                  : "hover:bg-gray-700"
              }`}
              onClick={() => handleCustomerSelect(customer)}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="font-bold">{customer.name}</div>
                <span
                  className={`text-xs px-2 py-1 rounded font-bold ${getStatusColor(
                    customer.status
                  )}`}
                >
                  {customer.status}
                </span>
              </div>
              <div className="text-sm text-gray-400">{customer.lastMessage}</div>
            </li>
          ))}
        </ul>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col p-4">
        {selectedCustomer ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold">{selectedCustomer.name}</h2>
                <div className="mt-2 flex items-center gap-3">
                  <div className={`px-4 py-2 rounded font-bold text-white ${getStatusColor(customerStatus.status)}`}>
                    {customerStatus.status}
                  </div>
                  {statusLoading && (
                    <span className="text-sm text-gray-600 animate-pulse">Analyzing...</span>
                  )}
                  {customerStatus.confidence > 0 && (
                    <span className="text-sm text-gray-600">
                      Confidence: {(customerStatus.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                {customerStatus.reasoning && (
                  <p className="text-sm text-gray-600 mt-1">{customerStatus.reasoning}</p>
                )}
              </div>
            </div>
            
            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            <div className="flex-1 overflow-y-auto border rounded p-4 bg-gray-100">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`mb-4 ${
                    message.sender === "user" ? "text-right" : "text-left"
                  }`}
                >
                  <span
                    className={`inline-block px-4 py-2 rounded-lg ${
                      message.sender === "user"
                        ? "bg-blue-500 text-white"
                        : message.error
                        ? "bg-red-300 text-black"
                        : "bg-gray-300 text-black"
                    }`}
                  >
                    {message.text}
                  </span>
                  

                </div>
              ))}
              
              {isLoading && (
                <div className="text-center text-gray-500 py-4">
                  <span className="inline-block animate-pulse">Thinking...</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && !isLoading) {
                    handleSendMessage();
                  }
                }}
                className="flex-1 border rounded p-2"
                placeholder="Type your message..."
                disabled={isLoading}
              />
              <button
                onClick={handleSendMessage}
                disabled={isLoading}
                className={`px-4 py-2 rounded text-white ${
                  isLoading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600"
                }`}
              >
                {isLoading ? "Sending..." : "Send"}
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>No customer selected</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatInterface;