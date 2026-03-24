"use client";

import { useState } from "react";

const ChatInterface = () => {
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

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
  };

  const handleSendMessage = () => {
    if (newMessage.trim() === "") return;

    setMessages([...messages, { sender: "user", text: newMessage }]);
    setNewMessage("");

    // Simulate bot response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: "This is a simulated response." },
      ]);
    }, 1000);
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
            <div className="flex-1 overflow-y-auto border rounded p-4 bg-gray-100">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`mb-2 ${
                    message.sender === "user" ? "text-right" : "text-left"
                  }`}
                >
                  <span
                    className={`inline-block px-4 py-2 rounded-lg ${
                      message.sender === "user"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-300 text-black"
                    }`}
                  >
                    {message.text}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1 border rounded p-2"
                placeholder="Type your message..."
              />
              <button
                onClick={handleSendMessage}
                className="ml-2 bg-blue-500 text-white px-4 py-2 rounded"
              >
                Send
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