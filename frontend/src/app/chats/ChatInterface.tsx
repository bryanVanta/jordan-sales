"use client";

import { useState } from "react";
import { chatWithLLM } from "@/services/llm";

const ChatInterface = () => {
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [conversationHistory, setConversationHistory] = useState([]);

  const customers = [
    { id: 1, name: "User +60123456789", status: "New", lastMessage: "Hello!" },
    { id: 2, name: "User +60198765432", status: "Hot", lastMessage: "Hi there!" },
    { id: 3, name: "User +60123456780", status: "Cold", lastMessage: "Can you help me?" },
  ];

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setMessages([
      { sender: "user", text: customer.lastMessage },
      { sender: "bot", text: "How can I assist you?" },
    ]);
    setConversationHistory([]);
    setError(null);
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
      const botMessage = {
        sender: "bot",
        text: result.response,
        reasoning: result.reasoning,
        model: result.model,
      };

      setMessages((prev) => [...prev, botMessage]);
      setConversationHistory(result.history);
    } catch (err) {
      console.error("Error sending message to LLM:", err);
      setError(err instanceof Error ? err.message : "Failed to get response from LLM");
      
      // Add error message
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: "Sorry, I encountered an error. Please check your training configuration and try again.",
          error: true,
        },
      ]);
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
              className={`p-2 mb-2 rounded cursor-pointer ${
                selectedCustomer?.id === customer.id
                  ? "bg-gray-600"
                  : "hover:bg-gray-700"
              }`}
              onClick={() => handleCustomerSelect(customer)}
            >
              <div className="font-bold">{customer.name}</div>
              <div className="text-sm text-gray-400">{customer.lastMessage}</div>
            </li>
          ))}
        </ul>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col p-4">
        {selectedCustomer ? (
          <>
            <h2 className="text-2xl font-bold mb-4">{selectedCustomer.name}</h2>
            
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