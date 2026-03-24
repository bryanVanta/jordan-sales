"use client";
import Link from "next/link";
import { useState } from "react";

const Navbar = () => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <nav className="bg-gray-800 text-white p-4">
      <div className="flex items-center">
        <Link href="/dashboard" legacyBehavior>
          <a className="text-xl font-bold hover:underline mr-8">Jordan Sales</a>
        </Link>
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="hover:underline"
          >
            Chats
          </button>
          {isDropdownOpen && (
            <ul className="absolute left-0 mt-2 bg-gray-700 text-white rounded shadow-lg">
              <li className="px-4 py-2 hover:bg-gray-600">
                <Link href="/chats">All</Link>
              </li>
              <li className="px-4 py-2 hover:bg-gray-600">
                <Link href="/chats/whatsapp">WhatsApp</Link>
              </li>
              <li className="px-4 py-2 hover:bg-gray-600">
                <Link href="/chats/email">Email</Link>
              </li>
              <li className="px-4 py-2 hover:bg-gray-600">
                <Link href="/chats/telegram">Telegram</Link>
              </li>
            </ul>
          )}
        </div>
        <Link href="/project" legacyBehavior>
          <a className="hover:underline ml-8">Project</a>
        </Link>
      </div>
    </nav>
  );
};

export default Navbar;