import ChatInterface from "./ChatInterface";
import { Suspense } from "react";

const Chats = () => {
  return (
    <div className="h-screen w-full overflow-hidden">
      <Suspense fallback={<div>Loading chat...</div>}>
        <ChatInterface />
      </Suspense>
    </div>
  );
};

export default Chats;