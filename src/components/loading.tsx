import Image from "next/image";
import React from "react";

interface LoadingProps {
  text: string;
}

const Loading: React.FC<LoadingProps> = ({ text }) => {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3">
      <Image src="/loading.gif" alt="logo" width={100} height={100} />
      <p className="text-sm font-normal text-[#7192A5]">{text}</p>
    </div>
  );
};

export default Loading;
